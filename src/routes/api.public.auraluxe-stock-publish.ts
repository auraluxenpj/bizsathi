import { createFileRoute } from '@tanstack/react-router';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
type Db = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

function equal(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function targetUrl(): string {
  const raw = process.env['AURALUXE_STOCK_EVENT_URL']?.trim()
    || 'https://www.auraluxe.com.np/api/public/bizsathi-stock-event';
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.pathname !== '/api/public/bizsathi-stock-event'
    || url.username || url.password || url.search || url.hash) {
    throw new Error('AURALUXE_STOCK_EVENT_URL must be the final HTTPS stock event API URL');
  }
  return url.toString();
}

export const Route = createFileRoute('/api/public/auraluxe-stock-publish')({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env['WEBSITE_INVENTORY_SYNC_SECRET'] ?? '';
    const auth = request.headers.get('authorization') ?? '';
    const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (secret.length < 24 || !supplied || !equal(secret, supplied)) return json({ error: 'Unauthorized' }, 401);

    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
    if (!body || typeof body !== 'object' || !('action' in body) || body.action !== 'publish_outbox') {
      return json({ error: 'Invalid action' }, 400);
    }
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const db = supabaseAdmin as unknown as Db;
      const lease = crypto.randomUUID();
      const claimed = await db.rpc('claim_auraluxe_stock_outbox', { _business_id: BUSINESS_ID, _lease: lease, _limit: 25 });
      if (claimed.error || !Array.isArray(claimed.data)) return json({ error: 'Stock event outbox unavailable' }, 503);
      const url = targetUrl();
      let delivered = 0;
      for (const raw of claimed.data) {
        if (!raw || typeof raw !== 'object' || !('id' in raw) || !('payload' in raw)) return json({ error: 'Invalid outbox event' }, 503);
        const id = Number(raw.id);
        const payload = raw.payload;
        if (!Number.isSafeInteger(id) || !payload || typeof payload !== 'object') return json({ error: 'Invalid outbox event' }, 503);
        try {
          const response = await fetch(url, {
            method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(12000),
            headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload),
          });
          const result = await response.json().catch(() => null) as { ok?: boolean } | null;
          if (!response.ok || result?.ok !== true) {
            await db.rpc('fail_auraluxe_stock_outbox', { _id: id, _lease: lease, _error: `Auraluxe stock event HTTP ${response.status}` });
            return json({ ok: false, delivered, blocked: true }, 503);
          }
          const ack = await db.rpc('ack_auraluxe_stock_outbox', { _id: id, _lease: lease });
          if (ack.error || ack.data !== true) return json({ ok: false, delivered, blocked: true }, 503);
          delivered += 1;
        } catch {
          await db.rpc('fail_auraluxe_stock_outbox', { _id: id, _lease: lease, _error: 'Stock event network delivery failed' }).catch(() => undefined);
          return json({ ok: false, delivered, blocked: true }, 503);
        }
      }
      return json({ ok: true, delivered, blocked: false });
    } catch (error) {
      console.error('[auraluxe-stock-publish] failed', error);
      return json({ error: 'Stock event publisher unavailable' }, 503);
    }
  } } },
});
