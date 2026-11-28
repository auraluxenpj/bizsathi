import { createFileRoute } from '@tanstack/react-router';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
type Db = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
type Row = { id: number; payload: Record<string, unknown> };
function equal(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
async function release(db: Db, rows: Row[], lease: string, error: string) {
  for (const row of rows) {
    try { await db.rpc('fail_auraluxe_catalogue_outbox', { _id: row.id, _lease: lease, _error: error }); } catch { /* lease expiry fallback */ }
  }
}
export const Route = createFileRoute('/api/public/auraluxe-publication-publish')({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env['WEBSITE_INVENTORY_SYNC_SECRET'] ?? '';
    const auth = request.headers.get('authorization') ?? '';
    const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (secret.length < 24 || !supplied || !equal(secret, supplied)) return json({ error: 'Unauthorized' }, 401);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
    if (!body || typeof body !== 'object' || !('action' in body) || body.action !== 'publish_outbox') return json({ error: 'Invalid action' }, 400);
    let db: Db | undefined;
    const lease = crypto.randomUUID();
    let rows: Row[] = [];
    try {
      const target = process.env['AURALUXE_PUBLICATION_URL']?.trim() || 'https://www.auraluxe.com.np/api/public/bizsathi-publication';
      const url = new URL(target);
      if (url.protocol !== 'https:' || url.pathname !== '/api/public/bizsathi-publication' || url.username || url.password || url.search || url.hash) throw new Error('Invalid Auraluxe publication receiver URL');
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      db = supabaseAdmin as unknown as Db;
      const claimed = await db.rpc('claim_auraluxe_publication_outbox', { _business_id: BUSINESS_ID, _lease: lease, _limit: 25 });
      if (claimed.error || !Array.isArray(claimed.data)) return json({ error: 'Publication outbox unavailable' }, 503);
      rows = claimed.data as Row[];
      let delivered = 0;
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i], p = row.payload;
        if (!Number.isSafeInteger(Number(row.id)) || p?.publication_only !== true
          || typeof p.sku !== 'string' || typeof p.published !== 'boolean'
          || typeof p.auraluxe_product_id !== 'string' || typeof p.auraluxe_variant_id !== 'string'
          || typeof p.bizsathi_product_id !== 'string' || typeof p.bizsathi_variant_id !== 'string') {
          await release(db, rows.slice(i), lease, 'Invalid publication outbox event');
          return json({ ok: false, delivered, blocked: true }, 503);
        }
        const response = await fetch(url, {
          method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(12000),
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            auraluxe_product_id: p.auraluxe_product_id,
            auraluxe_variant_id: p.auraluxe_variant_id,
            bizsathi_product_id: p.bizsathi_product_id,
            bizsathi_variant_id: p.bizsathi_variant_id,
            sku: p.sku, published: p.published,
          }),
        });
        const remote = await response.json().catch(() => null) as { ok?: boolean } | null;
        if (!response.ok || remote?.ok !== true) {
          await release(db, rows.slice(i), lease, `Auraluxe publication receiver HTTP ${response.status}`);
          return json({ ok: false, delivered, blocked: true }, 503);
        }
        const ack = await db.rpc('ack_auraluxe_catalogue_outbox', { _id: Number(row.id), _lease: lease });
        if (ack.error || ack.data !== true) {
          await release(db, rows.slice(i + 1), lease, 'Publication acknowledgement failed');
          return json({ ok: false, delivered, blocked: true }, 503);
        }
        delivered += 1;
      }
      return json({ ok: true, delivered, blocked: false });
    } catch (error) {
      if (db && rows.length) await release(db, rows, lease, 'Publication publisher failed');
      console.error('[auraluxe-publication-publish] failed', error);
      return json({ error: 'Publication publisher unavailable' }, 503);
    }
  } } },
});
