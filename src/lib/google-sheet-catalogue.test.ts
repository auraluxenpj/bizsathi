import { webcrypto } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { defaultCatalogueSheetName, extractSpreadsheetId, googleSheetCatalogueInput, parseGoogleSheetValues } from './google-sheet-catalogue';
import { readGoogleSheetCatalogue } from './google-sheet-catalogue.server';
import { writeStatusCells } from './google-sheet-values.server';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const businessId = '10000000-0000-4000-8000-000000000001';
const input = { businessId, spreadsheetIdOrUrl: 'sheet_123', sheetName: defaultCatalogueSheetName };

async function serviceAccountJson(email: string) {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey));
  let binary = '';
  for (const byte of pkcs8) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const pem = `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----\n`;
  return JSON.stringify({ client_email: email, private_key: pem });
}

describe('Google Sheets catalogue import', () => {
  it.each([' sheet_123 ', 'https://docs.google.com/spreadsheets/d/sheet_123/edit#gid=0'])('extracts spreadsheet ID from %s', value => expect(extractSpreadsheetId(value)).toBe('sheet_123'));
  it.each(['https://evil.example/spreadsheets/d/sheet_123/edit', 'http://docs.google.com/spreadsheets/d/sheet_123/edit', 'https://docs.google.com.evil.example/spreadsheets/d/sheet_123', '../secret'])('rejects unsafe inputs %s', value => expect(() => extractSpreadsheetId(value)).toThrow());
  it('defaults to the master tab', () => expect(googleSheetCatalogueInput.parse({ businessId, spreadsheetIdOrUrl: 'sheet_123' }).sheetName).toBe('aura final'));
  it('normalizes ragged sheet rows using CSV aliases', () => expect(parseGoogleSheetValues([['Item Name', 'Generated SKU', 'Selling Price', 'Primary Unit'], ['Shirt', 'S1', 'NPR 1,250.50']], businessId)[0]).toMatchObject({ product_name: 'Shirt', sku: 'S1', selling_price: 1250.5, unit: 'pcs' }));
  it('rejects missing required sheet data', () => expect(() => parseGoogleSheetValues([['Item Name', 'Generated SKU'], ['Shirt']], businessId)).toThrow());

  it('uses service-account OAuth and the Google Sheets API for private catalogues', async () => {
    const credentials = { serviceAccountJson: await serviceAccountJson(`catalogue-${crypto.randomUUID()}@example.iam.gserviceaccount.com`) };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'test-access-token', expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ values: [['Item Name', 'Generated SKU', 'Master Qty'], ['Shirt', 'S1', '2']] }));
    const rows = await readGoogleSheetCatalogue(input, credentials, request);
    expect(rows[0]?.sku).toBe('S1');
    expect(String(request.mock.calls[0]?.[0])).toContain('oauth2.googleapis.com/token');
    const apiUrl = new URL(String(request.mock.calls[1]?.[0]));
    expect(apiUrl.hostname).toBe('sheets.googleapis.com');
    expect(decodeURIComponent(apiUrl.pathname)).toContain("'aura final'!A1:Z5002");
    expect(new Headers(request.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe('Bearer test-access-token');
  });

  it('identifies outbound OAuth network failures', async () => {
    const credentials = { serviceAccountJson: await serviceAccountJson(`oauth-network-${crypto.randomUUID()}@example.iam.gserviceaccount.com`) };
    const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(readGoogleSheetCatalogue(input, credentials, request)).rejects.toThrow('could not connect to Google OAuth');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('identifies outbound Sheets API network failures after OAuth succeeds', async () => {
    const credentials = { serviceAccountJson: await serviceAccountJson(`sheets-network-${crypto.randomUUID()}@example.iam.gserviceaccount.com`) };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'test-access-token', expires_in: 3600 }))
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(readGoogleSheetCatalogue(input, credentials, request)).rejects.toThrow('could not connect to the Google Sheets API');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('uses link-shared CSV without service-account credentials', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('Item Name,Generated SKU,Master Qty\nShirt,S1,2'));
    expect((await readGoogleSheetCatalogue(input, {}, request))[0]?.sku).toBe('S1');
    const url = new URL(String(request.mock.calls[0]?.[0]));
    expect(url.hostname).toBe('docs.google.com');
    expect(url.searchParams.get('sheet')).toBe('aura final');
    expect(request.mock.calls[0]?.[1]?.headers).toBeUndefined();
  });

  it('does not fall back to public CSV when service-account access is denied', async () => {
    const credentials = { serviceAccountJson: await serviceAccountJson(`private-${crypto.randomUUID()}@example.iam.gserviceaccount.com`) };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'test-access-token', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response('Access denied', { status: 403 }));
    await expect(readGoogleSheetCatalogue(input, credentials, request)).rejects.toThrow('Google Sheets API denied the service account (HTTP 403)');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not bypass Google API quota failures', async () => {
    const credentials = { serviceAccountJson: await serviceAccountJson(`quota-${crypto.randomUUID()}@example.iam.gserviceaccount.com`) };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'test-access-token', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response('Quota exceeded', { status: 429 }));
    await expect(readGoogleSheetCatalogue(input, credentials, request)).rejects.toThrow('429');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('writes BizSathi and website status cells through Sheets batchUpdate', async () => {
    const credentials = { serviceAccountJson: await serviceAccountJson(`writeback-${crypto.randomUUID()}@example.iam.gserviceaccount.com`) };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'test-access-token', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const ok = await writeStatusCells('sheet_123', 'Stock In', [{ row: 2, bizsathi: '2026-11-19 08:00 UTC', website: '2026-11-19 08:00 UTC' }], credentials, { bizsathi: 8, website: 9 }, request);
    expect(ok).toEqual({ updated: true, issue: null });
    expect(String(request.mock.calls[1]?.[0])).toContain('sheets.googleapis.com/v4/spreadsheets/sheet_123/values:batchUpdate');
    const body = JSON.parse(String(request.mock.calls[1]?.[1]?.body));
    expect(body.valueInputOption).toBe('RAW');
    expect(body.data).toEqual([
      { range: "'Stock In'!I2", values: [['2026-11-19 08:00 UTC']] },
      { range: "'Stock In'!J2", values: [['2026-11-19 08:00 UTC']] },
    ]);
  });

  it('writes status cells to their actual reordered header columns', async () => {
    const credentials = { serviceAccountJson: await serviceAccountJson(`reordered-${crypto.randomUUID()}@example.iam.gserviceaccount.com`) };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'test-access-token', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const ok = await writeStatusCells('sheet_123', 'Stock In', [{ row: 7, bizsathi: 'done', website: 'synced' }], credentials, { bizsathi: 2, website: 0 }, request);
    expect(ok).toBe(true);
    const body = JSON.parse(String(request.mock.calls[1]?.[1]?.body));
    expect(body.data).toEqual([
      { range: "'Stock In'!C7", values: [['done']] },
      { range: "'Stock In'!A7", values: [['synced']] },
    ]);
  });

  it('returns a clear issue when status columns are absent', async () => {
    const credentials = { serviceAccountJson: await serviceAccountJson(`missing-columns-${crypto.randomUUID()}@example.iam.gserviceaccount.com`) };
    const request = vi.fn<typeof fetch>();
    const ok = await writeStatusCells('sheet_123', 'Stock In', [{ row: 2, bizsathi: 'done', website: 'synced' }], credentials, { bizsathi: -1, website: -1 }, request);
    expect(ok).toMatchObject({ updated: false, issue: expect.stringContaining('Applied in BizSathi') });
    expect(request).not.toHaveBeenCalled();
  });

  it('does not require Master Qty for catalogue-only imports', () => {
    expect(parseGoogleSheetValues([['Item Name', 'Generated SKU', 'Selling Price'], ['Kurti', 'AL-KURTI-001', '1200']], businessId))
      .toMatchObject([{ product_name: 'Kurti', sku: 'AL-KURTI-001', opening_stock: 0 }]);
  });

  it('requires Master Qty only when stock reconciliation is explicitly requested', () => {
    expect(() => parseGoogleSheetValues([['Item Name', 'Generated SKU'], ['Kurti', 'AL-KURTI-001']], businessId, true))
      .toThrow(/Master Qty/);
  });

  it('reports private workbook HTML clearly', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>Sign in</html>'));
    await expect(readGoogleSheetCatalogue(input, {}, request)).rejects.toThrow('private or unreachable');
  });

  it('rejects more than 5,000 product rows', () => expect(() => parseGoogleSheetValues([['Item Name', 'Generated SKU'], ...Array.from({ length: 5001 }, (_, i) => [`Product ${i}`, `S${i}`])], businessId)).toThrow());
});
