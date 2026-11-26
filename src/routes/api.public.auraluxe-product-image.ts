import { createFileRoute } from '@tanstack/react-router';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
const SHARED_IMAGE_PREFIX = 'https://jsshaoucrjorbyuzagdr.supabase.co/storage/v1/object/public/product-images/';

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
    if (Object.keys(input).some((key) => !['bizsathi_product_id', 'image_url'].includes(key))) return json({ error: 'Unexpected fields' }, 400);
    const productId = input['bizsathi_product_id'];
    const imageUrl = input['image_url'];
    if (typeof productId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)
      || (imageUrl !== null && (typeof imageUrl !== 'string' || imageUrl.length > 2000 || !imageUrl.startsWith(SHARED_IMAGE_PREFIX)))) {
      return json({ error: 'Invalid product ID or shared image URL' }, 400);
    }

    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { data, error } = await supabaseAdmin.from('products')
        .update({ image_path: imageUrl })
        .eq('business_id', BUSINESS_ID)
        .eq('id', productId)
        .select('id');
      if (error || !Array.isArray(data) || data.length !== 1) {
        console.error('[auraluxe-product-image] mapped product update rejected', error?.message ?? 'not uniquely matched');
        return json({ error: 'Mapped BizSathi product was not found uniquely' }, 409);
      }
      return json({ ok: true, product_id: productId, image_url: imageUrl });
    } catch (error) {
      console.error('[auraluxe-product-image] update failed', error);
      return json({ error: 'Product image sync unavailable' }, 503);
    }
  } } },
});
