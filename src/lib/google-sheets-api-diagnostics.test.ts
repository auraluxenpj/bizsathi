import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGoogleSheetRange } from './google-sheets-api.server';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

async function serviceAccountJson() {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey));
  let binary = '';
  for (const byte of pkcs8) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const pem = `-----BEGIN PRIVATE KEY-----\\n${base64.match(/.{1,64}/g)?.join('\\n')}\\n-----END PRIVATE KEY-----\\n`;
  return JSON.stringify({ client_email: 'diagnostic@example.iam.gserviceaccount.com', private_key: pem });
}

afterEach(() => vi.restoreAllMocks());

describe('Google Sheets outbound diagnostics', () => {
  it('logs the Sheets fetch failure category, cause code and elapsed time without credentials', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cause = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    const networkError = new TypeError('fetch failed', { cause });
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'do-not-log-this-token', expires_in: 3600 }))
      .mockRejectedValueOnce(networkError);

    await expect(readGoogleSheetRange('private-spreadsheet-id', 'Master!A1:Z5002', {
      serviceAccountJson: await serviceAccountJson(),
    }, request)).rejects.toMatchObject({ stage: 'sheets-network', status: 0 });

    expect(log).toHaveBeenCalledWith('[GoogleSheets] outbound request failed', expect.objectContaining({
      provider: 'google',
      stage: 'sheets',
      category: 'fetch-error',
      errorName: 'TypeError',
      errorMessage: 'fetch failed',
      causeCode: 'ECONNRESET',
      causeMessage: 'socket hang up',
      elapsedMs: expect.any(Number),
    }));
    const serializedLog = JSON.stringify(log.mock.calls);
    expect(serializedLog).not.toContain('private-spreadsheet-id');
    expect(serializedLog).not.toContain('diagnostic@example.iam.gserviceaccount.com');
    expect(serializedLog).not.toContain('do-not-log-this-token');
  });

  it('classifies a timeout separately from other fetch errors', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'test-token', expires_in: 3600 }))
      .mockRejectedValueOnce(timeout);

    await expect(readGoogleSheetRange('sheet-id', 'Master!A1:Z5002', {
      serviceAccountJson: await serviceAccountJson(),
    }, request)).rejects.toMatchObject({ stage: 'sheets-network', status: 0 });

    expect(log).toHaveBeenCalledWith('[GoogleSheets] outbound request failed', expect.objectContaining({
      stage: 'sheets',
      category: 'timeout',
      errorName: 'TimeoutError',
    }));
  });
});
