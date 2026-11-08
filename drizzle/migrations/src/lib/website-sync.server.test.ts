// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callWebsite, websiteUrl } from './website-sync.server';

const SECRET = 'shared-secret-with-enough-length-1234';
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
beforeEach(() => { process.env['INVENTORY_SYNC_SECRET'] = SECRET; delete process.env['WEBSITE_SYNC_URL']; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env['INVENTORY_SYNC_SECRET']; delete process.env['WEBSITE_SYNC_URL']; });

describe('website client', () => {
  it('uses the saved address when one is set, otherwise the default', () => {
    expect(websiteUrl()).toBe('https://www.auraluxe.com.np/api/public/inventory-sync');
    process.env['WEBSITE_SYNC_URL'] = 'https://auraluxe.com.np/api/public/inventory-sync';
    expect(websiteUrl()).toBe('https://auraluxe.com.np/api/public/inventory-sync');
  });
  it('refuses unsafe or malformed saved addresses', () => {
    for (const bad of ['http://auraluxe.com.np/api/public/inventory-sync', 'https://auraluxe.com.np/other', 'not a url', 'https://user:pw@auraluxe.com.np/api/public/inventory-sync']) {
      process.env['WEBSITE_SYNC_URL'] = bad; expect(() => websiteUrl()).toThrow(/WEBSITE_SYNC_URL/);
    }
  });
  it('sends the secret, never follows redirects, and returns the data', async () => {
    const fetchMock = vi.fn(async (_u: string, _i: RequestInit) => json({ items: [] })); vi.stubGlobal('fetch', fetchMock);
    expect(await callWebsite({ action: 'state', skus: ['A'] })).toEqual({ items: [] });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.redirect).toBe('manual'); expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SECRET}`);
  });
  it('explains a redirect and says which address to save, without following it', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 301, headers: { location: 'https://auraluxe.com.np/api/public/inventory-sync' } })); vi.stubGlobal('fetch', fetchMock);
    await expect(callWebsite({ action: 'state', skus: ['A'] })).rejects.toThrow(/redirects to auraluxe\.com\.np.*WEBSITE_SYNC_URL as https:\/\/auraluxe\.com\.np\/api\/public\/inventory-sync/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('keeps the existing messages for network failures, rejected secrets and server pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(callWebsite({})).rejects.toThrow('Website could not be reached');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })));
    await expect(callWebsite({})).rejects.toThrow('Website rejected the connection');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })));
    await expect(callWebsite({})).rejects.toThrow('returned a page');
  });
  it('requires the shared secret', async () => {
    delete process.env['INVENTORY_SYNC_SECRET'];
    await expect(callWebsite({})).rejects.toThrow('not configured');
  });
});
