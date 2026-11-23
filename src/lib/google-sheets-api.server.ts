export type GoogleSheetsCredentials = { serviceAccountJson?: string | undefined };

export class GoogleSheetsApiError extends Error {
  constructor(
    readonly status: number,
    readonly stage: 'credentials' | 'signing' | 'oauth' | 'sheets' | 'oauth-network' | 'sheets-network' = 'sheets',
  ) {
    super(`Google Sheets ${stage} request failed (${status}).`);
    this.name = 'GoogleSheetsApiError';
  }
}

type ServiceAccount = { client_email: string; private_key: string };
type CachedToken = { email: string; accessToken: string; expiresAt: number };
let cachedToken: CachedToken | undefined;

function parseServiceAccount(json: string): ServiceAccount {
  try {
    const value = JSON.parse(json) as Partial<ServiceAccount>;
    if (typeof value.client_email !== 'string' || typeof value.private_key !== 'string') throw new Error('missing fields');
    return { client_email: value.client_email, private_key: value.private_key };
  } catch {
    throw new GoogleSheetsApiError(400, 'credentials');
  }
}

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function createAssertion(account: ServiceAccount): Promise<string> {
  const pem = account.private_key.replace(/\\n/g, '\n');
  const encoded = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(encoded);
  const keyBytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${base64Url(signature)}`;
}

export async function getGoogleAccessToken(serviceAccountJson: string, request: typeof fetch = fetch): Promise<string> {
  const account = parseServiceAccount(serviceAccountJson);
  const now = Date.now();
  if (cachedToken?.email === account.client_email && cachedToken.expiresAt > now + 60_000) return cachedToken.accessToken;

  let assertion: string;
  try {
    assertion = await createAssertion(account);
  } catch {
    throw new GoogleSheetsApiError(0, 'signing');
  }
  let response: Response;
  try {
    response = await request('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GoogleSheetsApiError(0, 'oauth-network');
  }
  if (!response.ok) throw new GoogleSheetsApiError(response.status, 'oauth');
  const token = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof token.access_token !== 'string') throw new GoogleSheetsApiError(502);
  const expiresIn = typeof token.expires_in === 'number' ? token.expires_in : 3600;
  cachedToken = { email: account.client_email, accessToken: token.access_token, expiresAt: now + expiresIn * 1000 };
  return token.access_token;
}

export async function readGoogleSheetRange(
  spreadsheetId: string,
  range: string,
  credentials: GoogleSheetsCredentials,
  request: typeof fetch = fetch,
): Promise<unknown[][]> {
  if (!credentials.serviceAccountJson) throw new GoogleSheetsApiError(403);
  const token = await getGoogleAccessToken(credentials.serviceAccountJson, request);
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`);
  url.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');
  let response: Response;
  try {
    response = await request(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GoogleSheetsApiError(0, 'sheets-network');
  }
  if (!response.ok) throw new GoogleSheetsApiError(response.status);
  const result = await response.json() as { values?: unknown[][] };
  return result.values ?? [];
}

export async function writeGoogleSheetRanges(
  spreadsheetId: string,
  data: { range: string; values: string[][] }[],
  credentials: GoogleSheetsCredentials,
  request: typeof fetch = fetch,
): Promise<boolean> {
  if (!credentials.serviceAccountJson || !data.length) return false;
  try {
    const token = await getGoogleAccessToken(credentials.serviceAccountJson, request);
    const response = await request(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'RAW', data }),
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
