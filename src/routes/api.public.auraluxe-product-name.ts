import { createFileRoute } from '@tanstack/react-router';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
type Db = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

function equal(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export const Route = createFileRoute('/api/public/auraluxe-product-name')({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env['WEBSITE_INVENTORY_SYNC_SECRET'] ?? '';
    const authorization = request.headers.get('authorization') ?? '';
    const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (secret.length < 24 || !supplied || !equal(secret, supplied)) return json({ error: 'Unauthorized' }, 401);

    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request' }, 400);
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['auraluxe_product_id', 'name'].includes(key))) return json({ error: 'Only product ID and name are accepted' }, 400);
    const productId = input['auraluxe_product_id'];
    const name = input['name'];
    if (typeof productId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)
      || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 150 || hasControlCharacters(name)) {
      return json({ error: 'Invalid product ID or name' }, 400);
    }

    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const db = supabaseAdmin as unknown as Db;
      const applied = await db.rpc('apply_auraluxe_product_name', {
        _auraluxe_product_id: productId,
        _name: name.trim(),
      });
      if (applied.error) {
        console.error('[auraluxe-product-name] update rejected', applied.error.message);
        return json({ error: 'Mapped product name could not be updated' }, 409);
      }
      const result = applied.data as { ok?: boolean; product_id?: string; name?: string } | null;
      if (!result?.ok || !result.product_id || result.name !== name.trim()) return json({ error: 'Product name update was not confirmed' }, 409);
      return json({ ok: true, business_id: BUSINESS_ID, product_id: result.product_id, name: result.name });
    } catch (error) {
      console.error('[auraluxe-product-name] failed', error);
      return json({ error: 'Product name service unavailable' }, 503);
    }
  } } },
});
