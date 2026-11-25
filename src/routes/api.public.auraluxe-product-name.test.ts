import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc: mocks.rpc } }));

import { Route } from './api.public.auraluxe-product-name';

const SECRET = 'isolated-test-secret-with-more-than-24-chars';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const handler = (Route as unknown as { options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } } }).options.server.handlers.POST;
const invoke = (body: unknown, token: string | null = SECRET) => handler({ request: new Request('https://bizsathi.test/api/public/auraluxe-product-name', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
}) });

beforeEach(() => {
  process.env['WEBSITE_INVENTORY_SYNC_SECRET'] = SECRET;
  mocks.rpc.mockReset().mockResolvedValue({ data: { ok: true, product_id: '11111111-1111-4111-8111-111111111111', name: 'Updated Kurti' }, error: null });
});
afterEach(() => { delete process.env['WEBSITE_INVENTORY_SYNC_SECRET']; });

describe('Auraluxe name-only catalogue endpoint', () => {
  it('rejects unauthenticated requests before database access', async () => {
    const response = await invoke({ auraluxe_product_id: PRODUCT_ID, name: 'Updated Kurti' }, null);
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects extra fields so non-name catalogue data cannot be sent', async () => {
    const response = await invoke({ auraluxe_product_id: PRODUCT_ID, name: 'Updated Kurti', price: 1 });
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('calls only the dedicated name-only RPC with the mapped Auraluxe product ID', async () => {
    const response = await invoke({ auraluxe_product_id: PRODUCT_ID, name: 'Updated Kurti' });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('apply_auraluxe_product_name', {
      _auraluxe_product_id: PRODUCT_ID, _name: 'Updated Kurti',
    });
  });
  it('fails closed when the mapping is not confirmed', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'missing or ambiguous mapping' } });
    const response = await invoke({ auraluxe_product_id: PRODUCT_ID, name: 'Updated Kurti' });
    expect(response.status).toBe(409);
  });
});
