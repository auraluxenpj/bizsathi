import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { callWebsite, callWebsiteCatalogue, probeWebsiteCatalogueAuth } from './website-sync.server';
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

    const rows: {
      product_id: string;
      variant_id: string;
      name: string;
      category: string;
      variant_name: string;
      model_code: string | null;
      sku: string;
      selling_price: number;
    }[] = [];

    for (let offset = 0; ; offset += 500) {
      const page = await context.supabase
        .from('product_variants')
        .select('id,product_id,name,sku,model_code,selling_price,is_active,products!product_variants_business_id_product_id_fkey(name,category,is_active)')
        .eq('business_id', data.businessId)
        .eq('is_active', true)
        .order('id')
        .range(offset, offset + 499);
      if (page.error) throw new Error('BizSathi catalogue could not be loaded.');
      for (const variant of page.data ?? []) {
        const joined = variant.products as unknown as { name: string; category: string; is_active: boolean } | { name: string; category: string; is_active: boolean }[] | null;
        const product = Array.isArray(joined) ? joined[0] : joined;
        if (!product?.is_active) continue;
        const sellingPrice = Number(variant.selling_price);
        if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
          throw new Error(`Invalid selling price for SKU ${variant.sku}. Catalogue sync stopped without sending this batch.`);
        }
        rows.push({
          product_id: variant.product_id,
          variant_id: variant.id,
          name: product.name,
          category: product.category ?? '',
          variant_name: variant.name,
          model_code: variant.model_code?.trim() || null,
          sku: variant.sku,
          selling_price: sellingPrice,
        });
      }
      if ((page.data?.length ?? 0) < 500) break;
    }

    const identityError = validateCatalogueIdentity(rows);
    if (identityError) throw new Error(`Catalogue model-number validation failed: ${identityError}. No catalogue batch was sent.`);

    if (!rows.length) return { rows: 0, createdProducts: 0, updatedProducts: 0, createdVariants: 0, updatedVariants: 0, stockImported: false, productsPublished: false };

    let createdProducts = 0;
    let updatedProducts = 0;
    let createdVariants = 0;
    let updatedVariants = 0;
    for (let offset = 0; offset < rows.length; offset += 500) {
      const response = catalogueResult.parse(await callWebsiteCatalogue({
        items: rows.slice(offset, offset + 500),
      }));
      createdProducts += response.result.created_products;
      updatedProducts += response.result.updated_products;
      createdVariants += response.result.created_variants;
      updatedVariants += response.result.updated_variants;
    }
    return {
      rows: rows.length,
      createdProducts,
      updatedProducts,
      createdVariants,
      updatedVariants,
      stockImported: false,
      productsPublished: false,
    };
  });

export const syncWebsiteStock = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input.extend({ confirmed: z.literal(true) })).handler(async ({ data, context }) => {
  const { performWebsiteSync } = await import('./website-sync.run.server');
  return performWebsiteSync(context.supabase, data.branchId);
});
