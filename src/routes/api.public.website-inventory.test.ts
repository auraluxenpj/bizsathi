import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc: mocks.rpc } }));

import { Route } from './api.public.website-inventory';

const SECRET = 'isolated-test-secret-with-more-than-24-chars';
const OP = '11111111-1111-4111-8111-111111111111';
const RESERVATION = '22222222-2222-4222-8222-222222222222';
const BRANCH = '33333333-3333-4333-8333-333333333333';
const post = (body: unknown, token: string | null = SECRET) => new Request('https://bizsathi.test/api/public/website-inventory', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const handler = (Route as unknown as { options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } } }).options.server.handlers.POST;
const invoke = (body: unknown, token: string | null = SECRET) => handler({ request: post(body, token) });

beforeEach(() => {
  process.env['WEBSITE_INVENTORY_SYNC_SECRET'] = SECRET;
  process.env['AURALUXE_WEBSITE_INVENTORY_API_URL'] = 'https://auraluxe.test/api/public/bizsathi-inventory';
  process.env['WEBSITE_INVENTORY_SYNC_SECRET'] = SECRET;
  mocks.rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === 'website_inventory_branch') return { data: BRANCH, error: null };
    if (name === 'reserve_website_inventory') return { data: { ok: true, status: 'reserved', reservationId: OP }, error: null };
    if (name === 'finalize_website_inventory') return { data: { ok: true, status: 'committed' }, error: null };
    if (name === 'accept_website_inventory_return') return { data: { ok: true, status: 'accepted' }, error: null };
    if (name === 'website_inventory_status') return { data: { status: 'committed' }, error: null };
    if (name === 'claim_website_inventory_outbox') return { data: [], error: null };
    return { data: true, error: null };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env['WEBSITE_INVENTORY_SYNC_SECRET'];
  delete process.env['AURALUXE_WEBSITE_INVENTORY_API_URL'];
});

describe('BizSathi website inventory worker contract', () => {
  it('rejects unauthenticated and malformed requests before any database access', async () => {
    expect((await invoke({ action: 'reserve', operationId: OP, reference: 'WEB-1', items: [{ sku: 'SKU-1', quantity: 1 }] }, null)).status).toBe(401);
    expect((await invoke({ action: 'reserve', operationId: OP, reference: 'WEB-1', items: [{ sku: 'SKU-1', quantity: 0 }] })).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('reserves stock with the configured business branch and requested SKU quantities', async () => {
    const response = await invoke({ action: 'reserve', operationId: OP, reference: 'WEB-1001', items: [{ sku: 'AL-KURTI-01', quantity: 2 }] });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: 'reserved' });
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_website_inventory', {
      _business_id: 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01',
      _operation_id: OP,
      _branch_id: BRANCH,
      _reference: 'WEB-1001',
      _items: [{ sku: 'AL-KURTI-01', quantity: 2 }],
    });
  });

  it.each(['commit', 'cancel'] as const)('routes %s through the idempotent reservation finalizer', async (action) => {
    const response = await invoke({ action, operationId: OP, reference: 'WEB-1001' });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('finalize_website_inventory', {
      _business_id: 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01',
      _operation_id: OP,
      _action: action,
      _reference: 'WEB-1001',
    });
  });

  it('accepts only a return linked to its original reservation', async () => {
    const response = await invoke({
      action: 'accept_return', operationId: RESERVATION, reservationId: OP, reference: 'WEB-RET-1',
      items: [{ sku: 'AL-KURTI-01', quantity: 1, restockQuantity: 1 }],
    });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('accept_website_inventory_return', expect.objectContaining({
      _return_id: RESERVATION, _reservation_id: OP, _reference: 'WEB-RET-1',
    }));
  });

  it('does not publish legacy absolute stock snapshots after transactional movement events replace them', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await invoke({ action: 'reserve', operationId: OP, reference: 'WEB-1002', items: [{ sku: 'AL-KURTI-01', quantity: 1 }] });
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith('claim_website_inventory_outbox', expect.anything());
    expect(mocks.rpc).not.toHaveBeenCalledWith('ack_website_inventory_outbox_event', expect.anything());
  });

  it('skips the retired outbox publisher before requiring a branch binding', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'website_inventory_integration_enabled') return { data: false, error: null };
      return { data: null, error: null };
    });
    const response = await invoke({ action: 'publish_outbox' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, skipped: true, published: 0 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('website_inventory_integration_enabled', {
      _business_id: 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01',
    });
  });

  it('fails closed when the integration branch is not configured', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const response = await invoke({ action: 'status', operationId: OP });
    expect(response.status).toBe(503);
  });
});
