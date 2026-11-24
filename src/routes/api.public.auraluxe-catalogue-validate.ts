import { createFileRoute } from '@tanstack/react-router';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
type SnapshotRow = {
  product_id?: unknown; variant_id?: unknown; sku?: unknown; variant_name?: unknown;
  name?: unknown; category?: unknown; purchase_price?: unknown; mrp?: unknown;
  selling_price?: unknown; wholesale_price?: unknown; model_code?: unknown;
};
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
function validate(rows: unknown): { valid: boolean; row_count: number; unique_skus: number; issues: string[] } {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) {
    return { valid: false, row_count: Array.isArray(rows) ? rows.length : 0, unique_skus: 0, issues: ['Snapshot must contain between 1 and 500 rows'] };
  }
  const skus = new Set<string>(), variantIds = new Set<string>();
  const issues: string[] = [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const priceFields = ['purchase_price', 'mrp', 'selling_price', 'wholesale_price'] as const;
  for (const [index, raw] of rows.entries()) {
    const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as SnapshotRow : {};
    const label = typeof row.sku === 'string' && row.sku.trim() ? row.sku.trim() : `row ${index + 1}`;
    const sku = typeof row.sku === 'string' ? row.sku.trim() : '';
    const normalized = sku.toLowerCase();
    if (!/^\\S{1,80}$/.test(sku)) issues.push(`${label}: SKU is missing or invalid`);
    else if (skus.has(normalized)) issues.push(`${label}: duplicate SKU`);
    else skus.add(normalized);
    if (typeof row.product_id !== 'string' || !uuid.test(row.product_id)) issues.push(`${label}: invalid product ID`);

    if (typeof row.variant_id !== 'string' || !uuid.test(row.variant_id)) issues.push(`${label}: invalid variant ID`);
    else if (variantIds.has(row.variant_id)) issues.push(`${label}: duplicate variant ID`);
    else variantIds.add(row.variant_id);
    if (typeof row.name !== 'string' || !row.name.trim()) issues.push(`${label}: product name is missing`);
    if (typeof row.variant_name !== 'string' || !row.variant_name.trim()) issues.push(`${label}: variant name is missing`);
    if (typeof row.category !== 'string' || !row.category.trim()) issues.push(`${label}: category is missing`);
    for (const field of priceFields) {
      const value = row[field];
      if (value !== null && value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        issues.push(`${label}: ${field} must be a non-negative number or null`);
      }
    }
  }
  return { valid: issues.length === 0, row_count: rows.length, unique_skus: skus.size, issues: issues.slice(0, 100) };
}

export const Route = createFileRoute('/api/public/auraluxe-catalogue-validate')({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env['WEBSITE_INVENTORY_SYNC_SECRET'] ?? '';
    const authorization = request.headers.get('authorization') ?? '';
    const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (secret.length < 24 || !supplied || !equal(secret, supplied)) return json({ error: 'Unauthorized' }, 401);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
    if (!body || typeof body !== 'object' || !('action' in body) || body.action !== 'validate_snapshot') {
      return json({ error: 'Invalid action' }, 400);
    }
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const db = supabaseAdmin as unknown as Db;
      const snapshot = await db.rpc('get_auraluxe_catalogue_snapshot', { _business_id: BUSINESS_ID });
      if (snapshot.error) {
        console.error('[auraluxe-catalogue-validate] snapshot unavailable', snapshot.error.message);
        return json({ error: 'BizSathi catalogue snapshot unavailable' }, 503);
      }
      const result = validate(snapshot.data);
      return json({ ok: true, ...result });
    } catch (error) {
      console.error('[auraluxe-catalogue-validate] validation failed', error);
      return json({ error: 'Catalogue validation unavailable' }, 503);
    }
  } } },
});
