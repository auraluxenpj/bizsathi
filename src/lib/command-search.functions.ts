import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const input = z.object({
  businessId: z.string().uuid(),
  query: z.string().trim().min(2).max(64),
});

export const searchWorkspaceRecords = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator(input)
  .handler(async ({ data, context }) => {
    const { data: member, error: accessError } = await context.supabase.rpc('is_business_member', { _business_id: data.businessId });
    if (accessError || !member) throw new Error('Business access is required.');
    const term = data.query.replace(/[%,_()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (term.length < 2) return { products: [], parties: [], vouchers: [] };
    const pattern = `%${term}%`;
    const [byVariant, byProduct, parties, vouchers] = await Promise.all([
      context.supabase.from('product_variants').select('id,product_id,name,sku,barcode').eq('business_id', data.businessId).or(`name.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern}`).limit(5),
      context.supabase.from('products').select('id,name').eq('business_id', data.businessId).ilike('name', pattern).limit(5),
      context.supabase.from('parties').select('id,name,phone,kind').eq('business_id', data.businessId).or(`name.ilike.${pattern},phone.ilike.${pattern}`).limit(5),
      context.supabase.from('accounting_vouchers').select('id,reference,kind,voucher_date,reason').eq('business_id', data.businessId).or(`reference.ilike.${pattern},reason.ilike.${pattern}`).order('created_at', { ascending: false }).limit(5),
    ]);
    if (byVariant.error || byProduct.error || parties.error || vouchers.error) throw new Error('Workspace search is temporarily unavailable.');
    const productIds = [...new Set([...(byVariant.data ?? []).map(v => v.product_id), ...(byProduct.data ?? []).map(p => p.id)])];
    const [variants, products] = await Promise.all([
      context.supabase.from('product_variants').select('id,product_id,name,sku,barcode').eq('business_id', data.businessId).in('product_id', productIds).limit(12),
      context.supabase.from('products').select('id,name').eq('business_id', data.businessId).in('id', productIds),
    ]);
    if (variants.error || products.error) throw new Error('Product search is temporarily unavailable.');
    const names = new Map((products.data ?? []).map(p => [p.id, p.name]));
    const seen = new Set<string>();
    const productResults = (variants.data ?? []).filter(v => {
      if (seen.has(v.product_id)) return false;
      seen.add(v.product_id);
      return true;
    }).slice(0, 6).map(v => ({
      id: v.id,
      name: names.get(v.product_id) ?? v.name,
      detail: [v.sku, v.barcode].filter(Boolean).join(' · '),
    }));
    return {
      products: productResults,
      parties: (parties.data ?? []).map(p => ({ id: p.id, name: p.name, detail: [p.kind, p.phone].filter(Boolean).join(' · ') })),
      vouchers: (vouchers.data ?? []).map(v => ({ id: v.id, name: v.reference, detail: [v.kind.replaceAll('_', ' '), v.voucher_date, v.reason].filter(Boolean).join(' · ') })),
    };
  });
