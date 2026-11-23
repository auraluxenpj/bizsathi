import { createFileRoute } from '@tanstack/react-router';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
type Db = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
type SnapshotRow = { sku?: unknown; product_id?: unknown; variant_id?: unknown };
type CatalogueMapping = Record<string, unknown>;

function equal(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function targetUrl(): string {
  const raw = process.env['AURALUXE_CATALOGUE_RECONCILE_URL']?.trim()
    || 'https://www.auraluxe.com.np/api/public/bizsathi-catalogue-reconcile';
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.pathname !== '/api/public/bizsathi-catalogue-reconcile'
    || url.username || url.password || url.search || url.hash) {
    throw new Error('AURALUXE_CATALOGUE_RECONCILE_URL must be the HTTPS reconciliation endpoint');
  }
  return url.toString();
}

function validatedMappings(snapshot: SnapshotRow[], value: unknown): CatalogueMapping[] | null {
  if (!Array.isArray(value) || value.length !== snapshot.length) return null;
  const expected = new Map<string, SnapshotRow>();
  for (const row of snapshot) {
    const sku = typeof row.sku === 'string' ? row.sku.trim().toLowerCase() : '';
    if (!sku || expected.has(sku)) return null;
    expected.set(sku, row);
  }
  const seen = new Set<string>();
  const seenVariantIds = new Set<string>();
  const mappings: CatalogueMapping[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const mapping = raw as CatalogueMapping;
    const sku = typeof mapping['sku'] === 'string' ? mapping['sku'].trim().toLowerCase() : '';
    const source = expected.get(sku);
    if (!source || seen.has(sku)) return null;
    for (const field of ['auraluxe_product_id', 'auraluxe_variant_id', 'bizsathi_product_id', 'bizsathi_variant_id']) {
      if (typeof mapping[field] !== 'string' || !(mapping[field] as string).trim()) return null;
    }
    if (mapping['bizsathi_product_id'] !== source.product_id
      || mapping['bizsathi_variant_id'] !== source.variant_id) return null;
    const remoteVariantId = mapping['auraluxe_variant_id'] as string;
    if (seenVariantIds.has(remoteVariantId)) return null;
    seenVariantIds.add(remoteVariantId);
    seen.add(sku);
    mappings.push(mapping);
  }
  return seen.size === expected.size ? mappings : null;
}

export const Route = createFileRoute('/api/public/auraluxe-catalogue-reconcile-publish')({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env['WEBSITE_INVENTORY_SYNC_SECRET'] ?? '';
    const authorization = request.headers.get('authorization') ?? '';
    const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (secret.length < 24 || !supplied || !equal(secret, supplied)) return json({ error: 'Unauthorized' }, 401);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
    if (!body || typeof body !== 'object' || !('action' in body) || body.action !== 'publish_snapshot') {
      return json({ error: 'Invalid action' }, 400);
    }
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const db = supabaseAdmin as unknown as Db;
      const snapshot = await db.rpc('get_auraluxe_catalogue_snapshot', { _business_id: BUSINESS_ID });
      if (snapshot.error || !Array.isArray(snapshot.data) || snapshot.data.length < 1 || snapshot.data.length > 500) {
        console.error('[auraluxe-catalogue-reconcile-publish] snapshot unavailable', snapshot.error?.message ?? 'invalid snapshot');
        return json({ error: 'Complete BizSathi catalogue snapshot unavailable' }, 503);
      }
      const response = await fetch(targetUrl(), {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: snapshot.data }),
      });
      const remote = await response.json().catch(() => null) as { result?: Record<string, unknown>; error?: string } | null;
      if (!response.ok || !remote?.result || typeof remote.result !== 'object') {
        console.error('[auraluxe-catalogue-reconcile-publish] receiver rejected snapshot', { status: response.status, error: remote?.error });
        return json({ error: 'Auraluxe did not confirm full catalogue reconciliation' }, 503);
      }

      const mappings = validatedMappings(snapshot.data as SnapshotRow[], remote.result['mappings']);
      if (!mappings) {
        console.error('[auraluxe-catalogue-reconcile-publish] receiver returned incomplete or inconsistent SKU mappings');
        return json({ error: 'Auraluxe catalogue reconciliation returned incomplete SKU mappings' }, 503);
      }

      let mappingsSaved = 0;
      for (let offset = 0; offset < mappings.length; offset += 100) {
        const batch = mappings.slice(offset, offset + 100);
        const saved = await db.rpc('upsert_auraluxe_catalogue_mappings', {
          _business_id: BUSINESS_ID,
          _items: batch,
        });
        if (saved.error || saved.data !== batch.length) {
          console.error('[auraluxe-catalogue-reconcile-publish] cross-reference persistence failed', {
            saved: mappingsSaved,
            batchSize: batch.length,
            error: saved.error?.message ?? 'mapping count mismatch',
          });
          return json({ error: 'Catalogue reconciled, but SKU cross-references could not be fully saved', mappings_saved: mappingsSaved }, 503);
        }
        mappingsSaved += batch.length;
      }

      const { mappings: _mappings, ...reconciliation } = remote.result;
      return json({ ok: true, snapshot_rows: snapshot.data.length, mappings_saved: mappingsSaved, reconciliation });
    } catch (error) {
      console.error('[auraluxe-catalogue-reconcile-publish] failed', error);
      return json({ error: 'Full catalogue reconciliation unavailable' }, 503);
    }
  } } },
});
