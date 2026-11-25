import { createFileRoute } from '@tanstack/react-router';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
type Db = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
type ClaimedRow = { id: number; payload: Record<string, unknown>; sku: string };

function equal(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
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

export const Route = createFileRoute('/api/public/auraluxe-catalogue-publish')({
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

    let db: Db | undefined;
    let lease: string | undefined;
    let claimedRows: unknown[] = [];
    try {
      const url = targetUrl();
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      db = supabaseAdmin as unknown as Db;
      lease = crypto.randomUUID();
      const claimed = await db.rpc('claim_auraluxe_catalogue_outbox', {
        _business_id: BUSINESS_ID,
        _lease: lease,
        _limit: 25,
      });
      if (claimed.error || !Array.isArray(claimed.data)) return json({ error: 'Catalogue outbox unavailable' }, 503);
      claimedRows = claimed.data;
      if (claimedRows.length === 0) return json({ ok: true, delivered: 0, blocked: false });

      const rows: ClaimedRow[] = [];
      const expectedSkus = new Set<string>();
      for (let index = 0; index < claimedRows.length; index += 1) {
        const raw = claimedRows[index];
        if (!raw || typeof raw !== 'object' || !('id' in raw) || !('payload' in raw)) {
          await releaseClaimedRange(db, claimedRows, index, lease, 'Invalid outbox event; releasing claimed batch');
          return json({ error: 'Invalid outbox event' }, 503);
        }
        const id = Number(raw.id);
        const payload = raw.payload;
        if (!Number.isSafeInteger(id) || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
          await releaseClaimedRange(db, claimedRows, index, lease, 'Invalid outbox event; releasing claimed batch');
          return json({ error: 'Invalid outbox event' }, 503);
        }
        const sku = 'sku' in payload && typeof payload.sku === 'string' ? payload.sku.trim().toLowerCase() : '';
        if (!sku || expectedSkus.has(sku)) {
          await releaseClaimedRange(db, claimedRows, index, lease, 'Invalid or duplicate SKU in claimed catalogue batch');
          return json({ error: 'Invalid or duplicate SKU in claimed catalogue batch' }, 503);
        }
        expectedSkus.add(sku);
        rows.push({ id, payload: payload as Record<string, unknown>, sku });
      }

      const response = await fetch(url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ items: rows.map((row) => row.payload) }),
      });
      if (!response.ok) {
        await releaseClaimedRange(db, claimedRows, 0, lease, `Auraluxe HTTP ${response.status}`);
        return json({ ok: false, delivered: 0, blocked: true }, 503);
      }

      const remote = await response.json().catch(() => null) as {
        result?: { mappings?: Array<Record<string, unknown>> };
      } | null;
      const mappings = remote?.result?.mappings;
      const returnedSkus = new Set<string>();
      if (!Array.isArray(mappings) || mappings.length !== rows.length) {
        await releaseClaimedRange(db, claimedRows, 0, lease, 'Auraluxe returned an incomplete catalogue mapping batch');
        return json({ ok: false, delivered: 0, blocked: true }, 503);
      }
      for (const mapping of mappings) {
        const sku = typeof mapping?.sku === 'string' ? mapping.sku.trim().toLowerCase() : '';
        if (!sku || !expectedSkus.has(sku) || returnedSkus.has(sku)) {
          await releaseClaimedRange(db, claimedRows, 0, lease, 'Auraluxe returned an invalid or duplicate SKU cross-reference');
          return json({ ok: false, delivered: 0, blocked: true }, 503);
        }
        returnedSkus.add(sku);
      }
      if (returnedSkus.size !== expectedSkus.size) {
        await releaseClaimedRange(db, claimedRows, 0, lease, 'Auraluxe did not return every expected SKU cross-reference');
        return json({ ok: false, delivered: 0, blocked: true }, 503);
      }

      const savedMapping = await db.rpc('upsert_auraluxe_catalogue_mappings', {
        _business_id: BUSINESS_ID,
        _items: mappings,
      });
      if (savedMapping.error || savedMapping.data !== rows.length) {
        await releaseClaimedRange(db, claimedRows, 0, lease, 'Auraluxe cross-references could not be saved in BizSathi');
        return json({ ok: false, delivered: 0, blocked: true }, 503);
      }

      let delivered = 0;
      for (let index = 0; index < rows.length; index += 1) {
        const ack = await db.rpc('ack_auraluxe_catalogue_outbox', { _id: rows[index].id, _lease: lease });
        if (ack.error || ack.data !== true) {
          await releaseClaimedRange(db, claimedRows, index, lease, 'Catalogue acknowledgement failed; releasing remaining claim');
          return json({ ok: false, delivered, blocked: true }, 503);
        }
        delivered += 1;
      }
      return json({ ok: true, delivered, blocked: false });
    } catch (error) {
      if (db && lease && claimedRows.length > 0) {
        await releaseClaimedRange(db, claimedRows, 0, lease, 'Unexpected catalogue publisher failure');
      }
      console.error('[auraluxe-catalogue-publish] failed', error);
      return json({ error: 'Catalogue publisher unavailable' }, 503);
    }
  } } },
});
