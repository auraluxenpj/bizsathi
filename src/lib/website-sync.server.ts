const DEFAULT_URL = 'https://www.auraluxe.com.np/api/public/inventory-sync';
const PATH = '/api/public/inventory-sync';
const DEFAULT_CATALOGUE_URL = 'https://www.auraluxe.com.np/api/public/bizsathi-catalogue';
const CATALOGUE_PATH = '/api/public/bizsathi-catalogue';

/** The website address. Save WEBSITE_SYNC_URL to point at the final (non-redirecting) address; it must be https and end with the API path. */
export function websiteUrl(): string {
  const raw = process.env['WEBSITE_SYNC_URL']?.trim() || DEFAULT_URL;
  let address: URL;
  try { address = new URL(raw); } catch { throw new Error('WEBSITE_SYNC_URL is not a valid address.'); }
  if (address.protocol !== 'https:' || !address.pathname.endsWith(PATH) || address.username || address.password) throw new Error(`WEBSITE_SYNC_URL must be an https address ending in ${PATH}.`);
  return address.toString();
}

/** The dedicated catalogue address; it is separate from the legacy stock endpoint. */
function websiteCatalogueUrl(): string {
  const raw = process.env['WEBSITE_CATALOGUE_SYNC_URL']?.trim() || DEFAULT_CATALOGUE_URL;
  let address: URL;
  try { address = new URL(raw); } catch { throw new Error('WEBSITE_CATALOGUE_SYNC_URL is not a valid address.'); }
  if (address.protocol !== 'https:' || address.pathname !== CATALOGUE_PATH || address.username || address.password || address.search || address.hash) {
    throw new Error(`WEBSITE_CATALOGUE_SYNC_URL must be an https address ending in ${CATALOGUE_PATH}.`);
  }
  return address.toString();
}

/** Read-only preflight: tests the exact secret used by the catalogue caller against Auraluxe's auth-only endpoint. */
export async function probeWebsiteCatalogueAuth() {
  const secret = process.env['INVENTORY_SYNC_SECRET'];
  if (!secret || secret.length < 24) {
    return { ok: false, status: 0, message: 'BizSathi INVENTORY_SYNC_SECRET is missing or too short.' };
  }
  const url = new URL('/api/public/bizsathi-inventory-auth', websiteCatalogueUrl()).toString();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json', Authorization: `Bearer ${secret}` },
    });
  } catch {
    return { ok: false, status: 0, message: 'Could not reach Auraluxe authentication probe over HTTPS.' };
  }
  await response.body?.cancel();
  if (response.status === 200) return { ok: true, status: 200, message: 'Auraluxe accepted the secret stored in the BizSathi Worker.' };
  if (response.status === 401) return { ok: false, status: 401, message: 'Auraluxe rejected the secret stored in the BizSathi Worker.' };
  if (response.status === 503) return { ok: false, status: 503, message: 'Auraluxe authentication probe is not configured.' };
  if (response.status >= 300 && response.status < 400) return { ok: false, status: response.status, message: 'Auraluxe authentication probe redirected; the secret was not forwarded.' };
  return { ok: false, status: response.status, message: `Auraluxe authentication probe returned HTTP ${response.status}.` };
}

export async function callWebsite(request: Record<string, unknown>) {
  const secret = process.env['INVENTORY_SYNC_SECRET'];
  if (!secret) throw new Error('Website sync is not configured. Save INVENTORY_SYNC_SECRET in both apps.');
  let response: Response;
  try {
    // Redirects are never followed, so the shared secret cannot be sent to another address.
    response = await fetch(websiteUrl(), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body: JSON.stringify(request) });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('WEBSITE_SYNC_URL')) throw error;
    throw new Error('Website could not be reached. Confirmed adjustments are retained; compare before retrying.');
  }
  if (response.status >= 300 && response.status < 400) {
    let host = 'another address';
    try { host = new URL(response.headers.get('location') ?? '', websiteUrl()).host; } catch { /* keep the generic wording */ }
    await response.body?.cancel();
    throw new Error(`The website address redirects to ${host}. Save WEBSITE_SYNC_URL as https://${host}${PATH} in this project's secrets and try again.`);
  }
  if (!response.ok) throw new Error(response.status === 401 ? 'Website rejected the connection. Re-enter the same shared secret in both apps.' : 'Website sync is unavailable. Confirmed adjustments are retained; compare before retrying.');
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Website returned a page instead of inventory data. Check that its stock API is published.');
  if (!response.body) throw new Error('Website returned no inventory data.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 1_000_000) { await reader.cancel(); throw new Error('Website inventory response is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; } catch { throw new Error('Website returned invalid inventory data.'); }
}

export async function callWebsiteCatalogue(request: Record<string, unknown>) {
  const secret = process.env['INVENTORY_SYNC_SECRET'];
  if (!secret || secret.length < 24) throw new Error('Website catalogue sync is not configured. Save the shared INVENTORY_SYNC_SECRET in both apps.');
  // Resolve configuration before the network try/catch so URL errors remain actionable.
  const url = websiteCatalogueUrl();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      // Cloudflare Workers supports manual/follow; manual prevents forwarding the secret on redirects.
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(request),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'UnknownError';
    throw new Error(`Website catalogue network request failed (${reason}). Check that the website is reachable over HTTPS.`);
  }
  if (response.status >= 300 && response.status < 400) {
    let host = 'another address';
    try { host = new URL(response.headers.get('location') ?? '', url).host; } catch { /* keep generic wording */ }
    await response.body?.cancel();
    throw new Error(`Website catalogue address redirects to ${host}. Set WEBSITE_CATALOGUE_SYNC_URL to its final HTTPS API address; the shared secret was not forwarded.`);
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error('Website rejected the catalogue connection (HTTP 401). Check that INVENTORY_SYNC_SECRET matches in both apps.');
    const body = await response.text().catch(() => '');
    let detail = '';
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === 'string') detail = parsed.error.slice(0, 240);
    } catch { /* Do not surface non-JSON response bodies. */ }
    throw new Error(detail
      ? `Website catalogue import failed with HTTP ${response.status}: ${detail}`
      : `Website catalogue import failed with HTTP ${response.status}.`);
  }
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Website returned a non-JSON catalogue response.');
  const result: unknown = await response.json().catch(() => null);
  if (!result || typeof result !== 'object') throw new Error('Website returned invalid catalogue data.');
  return result;
}


/** Read-only validation call; credential remains in the Worker environment. */
export async function validateAuraluxeCatalogueSnapshot() {
  const secret = process.env['WEBSITE_INVENTORY_SYNC_SECRET'];
  if (!secret || secret.length < 24) throw new Error('Catalogue validation is not configured in the BizSathi Worker.');
  const url = 'https://admin.auraluxe.com.np/api/public/auraluxe-catalogue-validate';
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + secret }, body: JSON.stringify({ action: 'validate_snapshot' }) });
  } catch { throw new Error('Could not reach the Auraluxe catalogue validation endpoint over HTTPS.'); }
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error('Auraluxe catalogue validation endpoint redirected; the secret was not forwarded.'); }
  if (response.status === 401) throw new Error('Auraluxe rejected the validation credential. Check the server-side secret binding.');
  if (!response.ok) { await response.body?.cancel(); throw new Error('Auraluxe catalogue validation failed with HTTP ' + response.status + '.'); }
  if (!(response.headers.get('content-type') || '').includes('application/json')) { await response.body?.cancel(); throw new Error('Auraluxe returned a non-JSON validation response.'); }
  const body = await response.text();
  if (body.length > 65536) throw new Error('Catalogue validation report exceeded the allowed response size.');
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new Error('Auraluxe returned invalid validation data.'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('Auraluxe returned invalid validation data.');
  const value = parsed as Record<string, unknown>;
  if (value.ok !== true || typeof value.valid !== 'boolean' || !Number.isInteger(value.row_count) || !Number.isInteger(value.unique_skus) || !Array.isArray(value.issues) || !value.issues.every(issue => typeof issue === 'string')) throw new Error('Auraluxe returned an unexpected validation report.');
  return value as { ok: true; valid: boolean; row_count: number; unique_skus: number; issues: string[] };
}
