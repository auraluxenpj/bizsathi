import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc: mocks.rpc } }));

import { Route } from './api.public.auraluxe-stock-publish';

const SECRET = 'isolated-test-secret-with-more-than-24-chars';
const EVENT = {
  eventId: '11111111-1111-4111-8111-111111111111',
  sourceTable: 'stock_movements',
  sourceId: '22222222-2222-4222-8222-222222222222',
  businessId: 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01',
  branchId: '33333333-3333-4333-8333-333333333333',
  sku: 'AL-STOCK-001',
  skuVersion: 1,
  delta: -1,
  bizsathiProductId: '44444444-4444-4444-8444-444444444444',
  bizsathiVariantId: '55555555-5555-4555-8555-555555555555',
  auraluxeProductId: '66666666-6666-4666-8666-666666666666',
  auraluxeVariantId: '77777777-7777-4777-8777-777777777777',
  occurredAt: '2026-11-23T08:00:00.000Z',
};
const post = (body: unknown, token: string | null = SECRET) => new Request('https://bizsathi.test/api/public/auraluxe-stock-publish', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const handler = (Route as unknown as { options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } } }).options.server.handlers.POST;
const invoke = (body: unknown, token: string | null = SECRET) => handler({ request: post(body, token) });

beforeEach(() => {
  process.env['WEBSITE_INVENTORY_SYNC_SECRET'] = SECRET;
  process.env['AURALUXE_STOCK_EVENT_URL'] = 'https://auraluxe.test/api/public/bizsathi-stock-event';
  mocks.rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === 'claim_auraluxe_stock_outbox') return { data: [{ id: 19, payload: EVENT }], error: null };
    if (name === 'ack_auraluxe_stock_outbox') return { data: true, error: null };
    if (name === 'fail_auraluxe_stock_outbox') return { data: true, error: null };
    return { data: null, error: null };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env['WEBSITE_INVENTORY_SYNC_SECRET'];
  delete process.env['AURALUXE_STOCK_EVENT_URL'];
});

describe('Auraluxe stock event publisher', () => {
  it('rejects callers without the shared service secret', async () => {
    const response = await invoke({ action: 'publish_outbox' }, null);
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('delivers a signed immutable event and acknowledges only after receiver success', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${SECRET}`);
      expect(JSON.parse(String(init?.body))).toEqual(EVENT);
      return Response.json({ ok: true, result: { duplicate: false } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await invoke({ action: 'publish_outbox' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, delivered: 1, blocked: false });
    expect(mocks.rpc).toHaveBeenCalledWith('claim_auraluxe_stock_outbox', {
      _business_id: 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01',
      _lease: expect.any(String),
      _limit: 25,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('ack_auraluxe_stock_outbox', {
      _id: 19,
      _lease: expect.any(String),
    });
  });

  it('returns a blocked result and schedules retry when the receiver fails', async () => {
    const fetchMock = vi.fn(async () => new Response('unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await invoke({ action: 'publish_outbox' });
    expect(response.status).toBe(503);
    expect(mocks.rpc).toHaveBeenCalledWith('fail_auraluxe_stock_outbox', {
      _id: 19,
      _lease: expect.any(String),
      _error: 'Auraluxe stock event HTTP 503',
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith('ack_auraluxe_stock_outbox', expect.anything());
  });
});
