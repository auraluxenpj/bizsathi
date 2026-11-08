const DEFAULT_URL = 'https://www.auraluxe.com.np/api/public/inventory-sync';
const PATH = '/api/public/inventory-sync';

/** The website address. Save WEBSITE_SYNC_URL to point at the final (non-redirecting) address; it must be https and end with the API path. */
export function websiteUrl(): string {
  const raw = process.env['WEBSITE_SYNC_URL']?.trim() || DEFAULT_URL;
  let address: URL;
  try { address = new URL(raw); } catch { throw new Error('WEBSITE_SYNC_URL is not a valid address.'); }
  if (address.protocol !== 'https:' || !address.pathname.endsWith(PATH) || address.username || address.password) throw new Error(`WEBSITE_SYNC_URL must be an https address ending in ${PATH}.`);
  return address.toString();
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