import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc: mocks.rpc } }));

import { Route } from './api.public.auraluxe-catalogue-validate';

const SECRET = 'isolated-test-secret-with-more-than-24-chars';
const rows = [
  { product_id: '11111111-1111-4111-8111-111111111111', variant_id: '22222222-2222-4222-8222-222222222222', name: 'Kurti Set A', category: 'Kurti Sets', variant_name: 'Standard', sku: 'AL-KUR-135', model_code: 'ALJS015', purchase_price: 500, mrp: 1200, selling_price: 999, wholesale_price: null },
  { product_id: '33333333-3333-4333-8333-333333333333', variant_id: '44444444-4444-4444-8444-444444444444', name: 'Kurti Set B', category: 'Kurti Sets', variant_name: 'Standard', sku: 'AL-KUR-136', model_code: 'ALJS015', purchase_price: 510, mrp: 1250, selling_price: 1050, wholesale_price: null },
];
const handler = (Route as unknown as { options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } } }).options.server.handlers.POST;
const invoke = (body: unknown, token: string | null = SECRET) => handler({ request: new Request('https://bizsathi.test/api/public/auraluxe-catalogue-validate', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
}) });

beforeEach(() => {
  process.env['WEBSITE_INVENTORY_SYNC_SECRET'] = SECRET;
  mocks.rpc.mockReset().mockResolvedValue({ data: rows, error: null });
});
afterEach(() => { delete process.env['WEBSITE_INVENTORY_SYNC_SECRET']; });

describe('read-only Auraluxe catalogue validation', () => {
  it('validates a complete snapshot and permits repeated model codes', async () => {
    const response = await invoke({ action: 'validate_snapshot' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, valid: true, row_count: 2, unique_skus: 2, issues: [] });
    expect(mocks.rpc).toHaveBeenCalledWith('get_auraluxe_catalogue_snapshot', { _business_id: 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01' });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate normalized SKUs', async () => {
    mocks.rpc.mockResolvedValue({ data: [rows[0], { ...rows[1], sku: ' al-kur-135 ' }], error: null });
    const response = await invoke({ action: 'validate_snapshot' });
    expect(await response.json()).toMatchObject({ ok: true, valid: false, issues: expect.arrayContaining(['al-kur-135: duplicate SKU']) });
  });

  it('rejects invalid names, variant IDs and prices', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...rows[0], variant_name: ' ', variant_id: 'bad-id', selling_price: -1 }], error: null });
    const response = await invoke({ action: 'validate_snapshot' });
    const result = await response.json();
    expect(result).toMatchObject({ valid: false, issues: expect.arrayContaining([
      'AL-KUR-135: invalid variant ID',
      'AL-KUR-135: variant name is missing',
      'AL-KUR-135: selling_price must be a non-negative number or null',
    ]) });
  });

  it('rejects unauthenticated calls before reading the database', async () => {
    const response = await invoke({ action: 'validate_snapshot' }, null);
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not publish or persist catalogue mappings', async () => {
    await invoke({ action: 'validate_snapshot' });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalledWith('upsert_auraluxe_catalogue_mappings', expect.anything());
  });
});
