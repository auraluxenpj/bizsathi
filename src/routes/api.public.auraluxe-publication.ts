import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
type Db = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
const schema = z.object({
  auraluxe_product_id: z.string().uuid(),
  auraluxe_variant_id: z.string().uuid(),
  bizsathi_product_id: z.string().uuid(),
  bizsathi_variant_id: z.string().uuid(),
  sku: z.string().trim().min(1).max(80),
  published: z.boolean(),
}).strict();
function equal(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export const Route = createFileRoute('/api/public/auraluxe-publication')({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env['WEBSITE_INVENTORY_SYNC_SECRET'] ?? '';
    const auth = request.headers.get('authorization') ?? '';
    const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (secret.length < 24 || !supplied || !equal(secret, supplied)) return json({ error: 'Unauthorized' }, 401);
    let parsed: z.infer<typeof schema>;
    try { parsed = schema.parse(await request.json()); } catch { return json({ error: 'Invalid publication event' }, 400); }
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const db = supabaseAdmin as unknown as Db;
      const result = await db.rpc('apply_auraluxe_publication', {
        _business_id: BUSINESS_ID,
        _auraluxe_product_id: parsed.auraluxe_product_id,
        _auraluxe_variant_id: parsed.auraluxe_variant_id,
        _sku: parsed.sku,
        _published: parsed.published,
      });
      if (result.error || result.data !== true) return json({ error: 'Publication mapping was not accepted' }, 409);
      return json({ ok: true });
    } catch (error) {
      console.error('[auraluxe-publication] receiver failed', error);
      return json({ error: 'Publication receiver unavailable' }, 503);
    }
  } } },
});
