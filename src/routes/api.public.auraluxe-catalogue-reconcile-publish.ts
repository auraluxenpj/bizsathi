import { createFileRoute } from '@tanstack/react-router';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
type Db = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
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
      const result = await response.json().catch(() => null) as { result?: Record<string, unknown>; error?: string } | null;
      if (!response.ok || !result?.result) {
        console.error('[auraluxe-catalogue-reconcile-publish] receiver rejected snapshot', { status: response.status, error: result?.error });
        return json({ error: 'Auraluxe did not confirm full catalogue reconciliation' }, 503);
      }
      return json({ ok: true, snapshot_rows: snapshot.data.length, reconciliation: result.result });
    } catch (error) {
      console.error('[auraluxe-catalogue-reconcile-publish] failed', error);
      return json({ error: 'Full catalogue reconciliation unavailable' }, 503);
    }
  } } },
});
