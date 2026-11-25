import { createFileRoute } from '@tanstack/react-router';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
type Db = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

function equal(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function releaseClaimedRange(db: Db, rows: unknown[], startIndex: number, lease: string, error: string): Promise<void> {
  for (let index = startIndex; index < rows.length; index += 1) {
    const raw = rows[index];
    if (!raw || typeof raw !== 'object' || !('id' in raw)) continue;
    const id = Number(raw.id);
    if (!Number.isSafeInteger(id)) continue;
    try {
      await db.rpc('fail_auraluxe_catalogue_outbox', { _id: id, _lease: lease, _error: error });
    } catch {
      // The claim lease will expire if the best-effort release cannot be recorded.
    }
  }
}

function targetUrl(): string {
  const raw = process.env['AURALUXE_CATALOGUE_SYNC_URL']?.trim()
    || 'https://www.auraluxe.com.np/api/public/bizsathi-catalogue';
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.pathname !== '/api/public/bizsathi-catalogue' || url.username || url.password || url.search || url.hash) {
    throw new Error('AURALUXE_CATALOGUE_SYNC_URL must be the final HTTPS catalogue API URL');
  }
  return url.toString();
}

export const Route = createFileRoute('/api/public/auraluxe-catalogue-publish')({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env['WEBSITE_INVENTORY_SYNC_SECRET'] ?? '';
    const auth = request.headers.get('authorization') ?? '';
    const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (secret.length < 24 || !supplied || !equal(secret, supplied)) return json({ error: 'Unauthorized' }, 401);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
    if (!body || typeof body !== 'object' || !('action' in body) || body.action !== 'publish_outbox') return json({ error: 'Invalid action' }, 400);
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const db = supabaseAdmin as unknown as Db;
      const lease = crypto.randomUUID();
      const claimed = await db.rpc('claim_auraluxe_catalogue_outbox', { _business_id: BUSINESS_ID, _lease: lease, _limit: 25 });
      if (claimed.error || !Array.isArray(claimed.data)) return json({ error: 'Catalogue outbox unavailable' }, 503);
      const url = targetUrl();
      let delivered = 0;
      for (let index = 0; index < claimed.data.length; index += 1) {\n        const raw = claimed.data[index];
        if (!raw || typeof raw !== 'object' || !('id' in raw) || !('payload' in raw)) {\n          await releaseClaimedRange(db, claimed.data, index, lease, 'Invalid outbox event; releasing remaining claim');\n          return json({ error: 'Invalid outbox event' }, 503);\n        }
        const id = Number(raw.id), payload = raw.payload;
        if (!Number.isSafeInteger(id) || !payload || typeof payload !== 'object') {\n          await releaseClaimedRange(db, claimed.data, index, lease, 'Invalid outbox event; releasing remaining claim');\n          return json({ error: 'Invalid outbox event' }, 503);\n        }
        try {
          const response = await fetch(url, {
            method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(12000),
            headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ items: [payload] }),
          });
          if (!response.ok) {
            await db.rpc('fail_auraluxe_catalogue_outbox', { _id: id, _lease: lease, _error: `Auraluxe HTTP ${response.status}` });
            return json({ ok: false, delivered, blocked: true }, 503);
          }
          const remote = await response.json().catch(() => null) as {
            result?: { mappings?: Array<Record<string, unknown>> };
          } | null;
          const mappings = remote?.result?.mappings;
          const sourceSku = typeof payload === 'object' && payload !== null && 'sku' in payload
            ? String(payload.sku).toLowerCase() : '';
          if (!Array.isArray(mappings) || mappings.length !== 1
            || String(mappings[0]?.sku ?? '').toLowerCase() !== sourceSku) {
            await db.rpc('fail_auraluxe_catalogue_outbox', { _id: id, _lease: lease, _error: 'Auraluxe did not return the expected SKU cross-reference' });
            return json({ ok: false, delivered, blocked: true }, 503);
          }
          const savedMapping = await db.rpc('upsert_auraluxe_catalogue_mappings', {
            _business_id: BUSINESS_ID,
            _items: mappings,
          });
          if (savedMapping.error || savedMapping.data !== 1) {
            await db.rpc('fail_auraluxe_catalogue_outbox', { _id: id, _lease: lease, _error: 'Auraluxe cross-reference could not be saved in BizSathi' });
            return json({ ok: false, delivered, blocked: true }, 503);
          }
          const ack = await db.rpc('ack_auraluxe_catalogue_outbox', { _id: id, _lease: lease });
          if (ack.error || ack.data !== true) {\n            await releaseClaimedRange(db, claimed.data, index, lease, 'Catalogue acknowledgement failed; releasing remaining claim');\n            return json({ ok: false, delivered, blocked: true }, 503);\n          }
          delivered += 1;
        } catch {
          await releaseClaimedRange(db, claimed.data, index, lease, 'Network delivery failed');
          return json({ ok: false, delivered, blocked: true }, 503);
        }
      }
      return json({ ok: true, delivered, blocked: false });
    } catch (error) {
      console.error('[auraluxe-catalogue-publish] failed', error);
      return json({ error: 'Catalogue publisher unavailable' }, 503);
    }
  } } },
});
