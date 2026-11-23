import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc: mocks.rpc } }));

import { Route } from './api.public.auraluxe-catalogue-reconcile-publish';

const SECRET = 'isolated-test-secret-with-more-than-24-chars';
const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
const snapshot = [
  { product_id: '11111111-1111-4111-8111-111111111111', variant_id: '22222222-2222-4222-8222-222222222222', sku: 'AL-TEST-001' },
  { product_id: '33333333-3333-4333-8333-333333333333', variant_id: '44444444-4444-4444-8444-444444444444', sku: 'AL-TEST-002' },
];
const mappings = [
  { sku: 'AL-TEST-001', auraluxe_product_id: '55555555-5555-4555-8555-555555555555', auraluxe_variant_id: '66666666-6666-4666-8666-666666666666', bizsathi_product_id: snapshot[0].product_id, bizsathi_variant_id: snapshot[0].variant_id },
  { sku: 'AL-TEST-002', auraluxe_product_id: '77777777-7777-4777-8777-777777777777', auraluxe_variant_id: '88888888-8888-4888-8888-888888888888', bizsathi_product_id: snapshot[1].product_id, bizsathi_variant_id: snapshot[1].variant_id },
];
const post = (body: unknown, token: string | null = SECRET) => new Request('https://bizsathi.test/api/public/auraluxe-catalogue-reconcile-publish', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const handler = (Route as unknown as { options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } } }).options.server.handlers.POST;
const invoke = (body: unknown, token: string | null = SECRET) => handler({ request: post(body, token) });

beforeEach(() => {
  process.env['WEBSITE_INVENTORY_SYNC_SECRET'] = SECRET;
  process.env['AURALUXE_CATALOGUE_RECONCILE_URL'] = 'https://auraluxe.test/api/public/bizsathi-catalogue-reconcile';
  mocks.rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === 'get_auraluxe_catalogue_snapshot') return { data: snapshot, error: null };
    if (name === 'upsert_auraluxe_catalogue_mappings') return { data: 2, error: null };
    return { data: null, error: null };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env['WEBSITE_INVENTORY_SYNC_SECRET'];
  delete process.env['AURALUXE_CATALOGUE_RECONCILE_URL'];
});

describe('BizSathi full Auraluxe catalogue reconciliation publisher', () => {
  it('rejects unauthenticated requests before database access', async () => {
    const response = await invoke({ action: 'publish_snapshot' }, null);
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('persists every returned SKU cross-reference after the receiver confirms the full snapshot', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${SECRET}`);
      expect(JSON.parse(String(init?.body))).toEqual({ items: snapshot });
      return Response.json({ result: { created_products: 0, updated_products: 2, mappings } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await invoke({ action: 'publish_snapshot' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, snapshot_rows: 2, mappings_saved: 2 });
    expect(mocks.rpc).toHaveBeenCalledWith('upsert_auraluxe_catalogue_mappings', {
      _business_id: BUSINESS_ID,
      _items: mappings,
    });
  });

  it('refuses incomplete or cross-wired mapping responses without saving any IDs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ result: { mappings: [mappings[0]] } })));
    const response = await invoke({ action: 'publish_snapshot' });
    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalledWith('upsert_auraluxe_catalogue_mappings', expect.anything());
  });

  it('saves large snapshots in bounded mapping batches', async () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({
      product_id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      variant_id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      sku: `SKU-${i + 1}`,
    }));
    const remoteMappings = rows.map((row, i) => ({
      sku: row.sku,
      bizsathi_product_id: row.product_id,
      bizsathi_variant_id: row.variant_id,
      auraluxe_product_id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      auraluxe_variant_id: `40000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    }));
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_auraluxe_catalogue_snapshot') return { data: rows, error: null };
      if (name === 'upsert_auraluxe_catalogue_mappings') return { data: Array.isArray(arguments[0]) ? 0 : 0, error: null };
      return { data: null, error: null };
    });
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'get_auraluxe_catalogue_snapshot') return { data: rows, error: null };
      if (name === 'upsert_auraluxe_catalogue_mappings') return { data: (args['_items'] as unknown[]).length, error: null };
      return { data: null, error: null };
    });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ result: { mappings: remoteMappings } })));

    const response = await invoke({ action: 'publish_snapshot' });
    expect(response.status).toBe(200);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'upsert_auraluxe_catalogue_mappings').map(([, args]) => (args as Record<string, unknown>)['_items'] as unknown[]).map(batch => batch.length)).toEqual([100, 1]);
  });

  it('reports partial mapping persistence so the idempotent snapshot can be retried', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_auraluxe_catalogue_snapshot') return { data: snapshot, error: null };
      return { data: null, error: { message: 'temporary failure' } };
    });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ result: { mappings } })));

    const response = await invoke({ action: 'publish_snapshot' });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ mappings_saved: 0 });
  });
});
