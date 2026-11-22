import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc: mocks.rpc, from: mocks.from } }));

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
  process.env['AURALUXE_SUPABASE_URL'] = 'https://auraluxe.test';
  process.env['AURALUXE_SUPABASE_PUBLISHABLE_KEY'] = 'public-test-key';
  process.env['WEBSITE_INVENTORY_SYNC_SECRET'] = SECRET;
  mocks.from.mockReset();
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
  delete process.env['AURALUXE_SUPABASE_URL'];
  delete process.env['AURALUXE_SUPABASE_PUBLISHABLE_KEY'];
  delete process.env['WEBSITE_INVENTORY_SELF_TEST_ENABLED'];
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

  it('publishes a stock projection with bearer authentication and acknowledges only after success', async () => {
    let claim = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'website_inventory_branch') return { data: BRANCH, error: null };
      if (name === 'reserve_website_inventory') return { data: { ok: true, status: 'reserved' }, error: null };
      if (name === 'claim_website_inventory_outbox') {
        claim += 1;
        return { data: claim === 1 ? [{ id: 17, payload: { items: [{ sku: 'AL-KURTI-01', available: 4 }] } }] : [], error: null };
      }
      if (name === 'ack_website_inventory_outbox_event') return { data: true, error: null };
      return { data: true, error: null };
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${SECRET}`);
      expect(JSON.parse(String(init?.body))).toEqual({ items: [{ sku: 'AL-KURTI-01', stock: 4 }] });
      return Response.json({ ok: true, applied: 1 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await invoke({ action: 'reserve', operationId: OP, reference: 'WEB-1002', items: [{ sku: 'AL-KURTI-01', quantity: 1 }] });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('ack_website_inventory_outbox_event', {
      _business_id: 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01', _event_id: '17', _lease_token: expect.any(String),
    });
  });

  it('runs the fixed one-unit reserve/cancel self-test and verifies stock restoration', async () => {
    process.env['WEBSITE_INVENTORY_SELF_TEST_ENABLED'] = 'true';
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(true)));
    const queryResults = [
      { data: { business_id: 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01', branch_id: BRANCH, enabled: false }, error: null },
      { data: { id: '44444444-4444-4444-8444-444444444444' }, error: null },
      { data: { enabled: true }, error: null },
      { data: { enabled: false }, error: null },
    ];
    mocks.from.mockImplementation(() => {
      type MockQuery = {
        select: (columns?: string) => MockQuery;
        update: (values: Record<string, unknown>) => MockQuery;
        eq: (column: string, value: unknown) => MockQuery;
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
      };
      const query: MockQuery = {
        select: () => query,
        update: () => query,
        eq: () => query,
        maybeSingle: async () => queryResults.shift() ?? { data: null, error: null },
      };
      return query;
    });
    let stockRead = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'read_website_inventory_outbox') return { data: [], error: null };
      if (name === 'commerce_stock_balance') {
        stockRead += 1;
        return { data: 6, error: null };
      }
      if (name === 'website_inventory_branch') return { data: BRANCH, error: null };
      if (name === 'reserve_website_inventory') return { data: { ok: true, status: 'reserved' }, error: null };
      if (name === 'finalize_website_inventory') return { data: { ok: true, status: 'cancelled' }, error: null };
      if (name === 'website_inventory_status') return { data: { status: 'cancelled' }, error: null };
      if (name === 'claim_website_inventory_outbox') return { data: [], error: null };
      return { data: true, error: null };
    });

    const response = await invoke({ action: 'self_test' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      test: 'reserve_then_cancel',
      sku: 'AL-KURTI-121',
      quantity: 1,
      stockBefore: 6,
      stockAfter: 6,
      reservationStatus: 'cancelled',
      integrationDisabled: true,
    });
    expect(stockRead).toBe(2);
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_website_inventory', expect.objectContaining({
      _branch_id: BRANCH,
      _items: [{ sku: 'AL-KURTI-121', quantity: 1 }],
    }));
    expect(mocks.rpc).toHaveBeenCalledWith('finalize_website_inventory', expect.objectContaining({
      _action: 'cancel',
    }));
  });

  it('refuses the self-test before database access when Auraluxe authority is disabled', async () => {
    process.env['WEBSITE_INVENTORY_SELF_TEST_ENABLED'] = 'true';
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(false)));
    const response = await invoke({ action: 'self_test' });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Auraluxe inventory authority must be enabled before the self-test',
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('keeps the controlled self-test disabled unless its explicit server flag is enabled', async () => {
    delete process.env['WEBSITE_INVENTORY_SELF_TEST_ENABLED'];
    const response = await invoke({ action: 'self_test' });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('fails closed when the integration branch is not configured', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const response = await invoke({ action: 'status', operationId: OP });
    expect(response.status).toBe(503);
  });
});
