// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callWebsite, callWebsiteCatalogue, probeWebsiteCatalogueAuth, validateAuraluxeCatalogueSnapshot, websiteUrl } from './website-sync.server';

const SECRET = 'shared-secret-with-enough-length-1234';
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
beforeEach(() => { process.env['INVENTORY_SYNC_SECRET'] = SECRET; delete process.env['WEBSITE_SYNC_URL']; delete process.env['WEBSITE_CATALOGUE_SYNC_URL']; delete process.env['WEBSITE_INVENTORY_SYNC_SECRET']; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env['INVENTORY_SYNC_SECRET']; delete process.env['WEBSITE_SYNC_URL']; delete process.env['WEBSITE_CATALOGUE_SYNC_URL']; });


describe('read-only Auraluxe catalogue validation client', () => {
  it('posts only validate_snapshot with the server-side credential', async () => {
    process.env['WEBSITE_INVENTORY_SYNC_SECRET'] = 'validation-secret-with-enough-length-123';
    const fetchMock = vi.fn(async () => json({ ok: true, valid: true, row_count: 395, unique_skus: 395, issues: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(validateAuraluxeCatalogueSnapshot()).resolves.toMatchObject({ valid: true, row_count: 395, unique_skus: 395 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://bizsathi-migration.auraluxe26.workers.dev/api/public/auraluxe-catalogue-validate');
    expect(init.method).toBe('POST'); expect(init.redirect).toBe('manual');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer validation-secret-with-enough-length-123');
    expect(JSON.parse(String(init.body))).toEqual({ action: 'validate_snapshot' });
  });
  it('does not call the endpoint when the credential is missing', async () => {
    delete process.env['WEBSITE_INVENTORY_SYNC_SECRET'];
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(validateAuraluxeCatalogueSnapshot()).rejects.toThrow('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not follow redirects', async () => {
    process.env['WEBSITE_INVENTORY_SYNC_SECRET'] = 'validation-secret-with-enough-length-123';
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/api' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(validateAuraluxeCatalogueSnapshot()).rejects.toThrow(/redirected; the secret was not forwarded/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

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
  it('sends catalogue drafts to the dedicated HTTPS endpoint', async () => {
    const fetchMock = vi.fn(async (_u: string, _i: RequestInit) => json({ result: { products_published: false } }));
    vi.stubGlobal('fetch', fetchMock);
    const payload = { items: [{ product_id: '00000000-0000-4000-8000-000000000001' }] };
    expect(await callWebsiteCatalogue(payload)).toEqual({ result: { products_published: false } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://www.auraluxe.com.np/api/public/bizsathi-catalogue');
    expect(init.redirect).toBe('manual');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(String(init.body))).toEqual(payload);
  });
  it('rejects catalogue redirects without following them or forwarding the secret', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 301, headers: { location: 'https://auraluxe.com.np/api/public/bizsathi-catalogue' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(callWebsiteCatalogue({ items: [] })).rejects.toThrow(/redirects to auraluxe\.com\.np.*shared secret was not forwarded/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1].redirect).toBe('manual');
  });
  it('reports an invalid catalogue URL separately from a network failure', async () => {
    process.env['WEBSITE_CATALOGUE_SYNC_URL'] = 'http://auraluxe.com.np/api/public/bizsathi-catalogue';
    await expect(callWebsiteCatalogue({ items: [] })).rejects.toThrow(/WEBSITE_CATALOGUE_SYNC_URL must be an https address/);
  });
  it('probes Auraluxe with a read-only GET and the catalogue secret', async () => {
    const fetchMock = vi.fn(async (_u: string, _i: RequestInit) => json({ ok: true, authenticated: true }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await probeWebsiteCatalogueAuth()).toEqual({ ok: true, status: 200, message: 'Auraluxe accepted the secret stored in the BizSathi Worker.' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://www.auraluxe.com.np/api/public/bizsathi-inventory-auth');
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('manual');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SECRET}`);
  });
  it('reports a rejected BizSathi secret without exposing it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
    expect(await probeWebsiteCatalogueAuth()).toEqual({ ok: false, status: 401, message: 'Auraluxe rejected the secret stored in the BizSathi Worker.' });
  });
  it('does not make a request when the BizSathi catalogue secret is missing', async () => {
    delete process.env['INVENTORY_SYNC_SECRET'];
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await probeWebsiteCatalogueAuth()).toEqual({ ok: false, status: 0, message: 'BizSathi INVENTORY_SYNC_SECRET is missing or too short.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('requires the shared secret', async () => {
    delete process.env['INVENTORY_SYNC_SECRET'];
    await expect(callWebsite({})).rejects.toThrow('not configured');
  });
});
