import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { callWebsite, probeWebsiteCatalogueAuth, publishAuraluxeCatalogueSnapshot, validateAuraluxeCatalogueSnapshot } from './website-sync.server';
import { AURALUXE_BUSINESS_ID, compareStock, eligibleStock, localSnapshot, validateCatalogueIdentity, websiteState } from './website-sync';

const input = z.object({ businessId: z.literal(AURALUXE_BUSINESS_ID), branchId: z.string().uuid() });
export const compareWebsiteStock = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input).handler(async ({ data, context }) => {
  const snapshot = await context.supabase.rpc('read_website_stock_snapshot', { _business_id: data.businessId, _branch_id: data.branchId });
  if (snapshot.error) throw new Error('Auraluxe administrator and active branch access are required.');
  const binding = await context.supabase.from('website_stock_sync').select('branch_id').eq('business_id', data.businessId).maybeSingle();
  if (binding.error) throw new Error('Website connection could not be checked.');
  if (binding.data && binding.data.branch_id !== data.branchId) throw new Error('Select the branch already linked to the website.');
  const local = eligibleStock(localSnapshot.parse(snapshot.data));
  const remote = local.valid.length ? websiteState.parse(await callWebsite({ action: 'state', skus: local.valid.map(r => r.sku) })).items : [];
  return { rows: compareStock(local.valid, remote), issues: local.issues, boundBranch: binding.data?.branch_id ?? null };
});

const catalogueInput = z.object({ businessId: z.literal(AURALUXE_BUSINESS_ID) });

/** Administrator-only, read-only check; does not import products or touch inventory. */
export const testWebsiteCatalogueConnection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(catalogueInput)
  .handler(async ({ data, context }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc('has_business_role', {
      _business_id: data.businessId,
      _min_role: 'admin',
    });
    if (roleError || !allowed) throw new Error('Auraluxe administrator access is required.');
    return probeWebsiteCatalogueAuth();
  });


/** Admin-only read-only validation. Does not publish, sync, or modify catalogue/stock. */
export const validateWebsiteCatalogue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(catalogueInput)
  .handler(async ({ data, context }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc('has_business_role', {
      _business_id: data.businessId,
      _min_role: 'admin',
    });
    if (roleError || !allowed) throw new Error('Auraluxe administrator access is required.');
    return validateAuraluxeCatalogueSnapshot();
  });

const catalogueResult = z.object({
  result: z.object({
    created_products: z.number().int().nonnegative(),
    updated_products: z.number().int().nonnegative(),
    created_variants: z.number().int().nonnegative(),
    updated_variants: z.number().int().nonnegative(),
    stock_imported: z.literal(false),
    products_published: z.literal(false),
  }),
});

export const syncWebsiteCatalogueDrafts = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(catalogueInput)
  .handler(async ({ data, context }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc('has_business_role', {
      _business_id: data.businessId,
      _min_role: 'admin',
    });
    if (roleError || !allowed) throw new Error('Auraluxe administrator access is required.');

    return publishAuraluxeCatalogueSnapshot();
  });

export const syncWebsiteStock = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input.extend({ confirmed: z.literal(true) })).handler(async ({ data, context }) => {
  const { performWebsiteSync } = await import('./website-sync.run.server');
  return performWebsiteSync(context.supabase, data.branchId);
});
