import { createFileRoute } from '@tanstack/react-router';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
const SHARED_IMAGE_PREFIX = 'https://jsshaoucrjorbyuzagdr.supabase.co/storage/v1/object/public/product-images/';

function isSharedImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.origin === 'https://jsshaoucrjorbyuzagdr.supabase.co'
      && url.pathname.startsWith('/storage/v1/object/public/product-images/')
      && !url.pathname.split('/').some((segment) => segment === '..' || segment === '.')
      && /\\.(webp|jpe?g|png)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function equal(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export const Route = createFileRoute('/api/public/auraluxe-product-image')({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env['WEBSITE_INVENTORY_SYNC_SECRET'] ?? '';
    const authorization = request.headers.get('authorization') ?? '';
    const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (secret.length < 24 || !supplied || !equal(secret, supplied)) return json({ error: 'Unauthorized' }, 401);

    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request' }, 400);
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['bizsathi_product_id', 'sku', 'image_url'].includes(key))) return json({ error: 'Unexpected fields' }, 400);
    const productId = input['bizsathi_product_id'];
    const skuValue = input['sku'];
    const sku = typeof skuValue === 'string' ? skuValue.trim() : '';
    const imageUrl = input['image_url'];
    if (typeof productId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)
      || (skuValue !== null && skuValue !== undefined && (typeof skuValue !== 'string' || sku.length < 1 || sku.length > 100))
      || (imageUrl !== null && !isSharedImageUrl(imageUrl))) {
      return json({ error: 'Invalid product ID, SKU or shared image URL' }, 400);
    }

    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      // Prefer the Auraluxe SKU when it resolves to exactly one active BizSathi variant.
      // A missing SKU match falls back to the existing immutable product-ID mapping.
      let targetProductId = '';
      let matchMethod: 'sku' | 'product_id' = 'product_id';
      if (sku) {
        const { data: skuMatches, error: skuError } = await supabaseAdmin.from('product_variants')
          .select('product_id,sku')
          .eq('business_id', BUSINESS_ID)
          .eq('sku', sku)
          .eq('is_active', true)
          .limit(2);
        if (skuError) {
          console.error('[auraluxe-product-image] SKU lookup failed', skuError.message);
          return json({ error: 'BizSathi SKU lookup failed' }, 503);
        }
        if (Array.isArray(skuMatches) && skuMatches.length > 1) {
          return json({ error: 'SKU is not unique in BizSathi; image was not changed', reason: 'duplicate_sku' }, 409);
        }
        if (Array.isArray(skuMatches) && skuMatches.length === 1) {
          targetProductId = skuMatches[0].product_id;
          matchMethod = 'sku';
        }
      }
      if (!targetProductId) targetProductId = productId;

      const { data, error } = await supabaseAdmin.from('products')
        .update({ image_path: imageUrl })
        .eq('business_id', BUSINESS_ID)
        .eq('id', targetProductId)
        .select('id');
      if (error || !Array.isArray(data) || data.length !== 1) {
        console.error('[auraluxe-product-image] mapped product update rejected', error?.message ?? 'not uniquely matched');
        return json({ error: 'Mapped BizSathi product was not found uniquely', reason: 'product_not_found' }, 409);
      }
      return json({ ok: true, product_id: data[0].id, image_url: imageUrl, matched_by: matchMethod });
    } catch (error) {
      console.error('[auraluxe-product-image] update failed', error);
      return json({ error: 'Product image sync unavailable' }, 503);
    }
  } } },
});
