const DEFAULT_URL = 'https://www.auraluxe.com.np/api/public/inventory-sync';
const PATH = '/api/public/inventory-sync';
const DEFAULT_CATALOGUE_URL = 'https://www.auraluxe.com.np/api/public/bizsathi-catalogue';
const CATALOGUE_PATH = '/api/public/bizsathi-catalogue';

/** The legacy stock-sync address. */
export function websiteUrl(): string {
  const raw = process.env['WEBSITE_SYNC_URL']?.trim() || DEFAULT_URL;
  let address: URL;
  try { address = new URL(raw); } catch { throw new Error('WEBSITE_SYNC_URL is not a valid address.'); }
  if (address.protocol !== 'https:' || address.pathname !== PATH || address.username || address.password || address.search || address.hash) throw new Error(`WEBSITE_SYNC_URL must be an https address ending in ${PATH}.`);
  return address.toString();
}

/** Dedicated catalogue endpoint remains available when legacy stock sync is disabled. */
function websiteCatalogueUrl(): string {
  const raw = process.env['WEBSITE_CATALOGUE_SYNC_URL']?.trim() || DEFAULT_CATALOGUE_URL;
  let address: URL;
  try { address = new URL(raw); } catch { throw new Error('WEBSITE_CATALOGUE_SYNC_URL is not a valid address.'); }
  if (address.protocol !== 'https:' || address.pathname !== CATALOGUE_PATH || address.username || address.password || address.search || address.hash) {
    throw new Error(`WEBSITE_CATALOGUE_SYNC_URL must be an https address ending in ${CATALOGUE_PATH}.`);
  }
  return address.toString();
}

async function postWebsite(url: string, request: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const secret = process.env['INVENTORY_SYNC_SECRET'];
  if (!secret || secret.length < 24) throw new Error('Website sync is not configured. Save the shared INVENTORY_SYNC_SECRET in both apps.');
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error('Website could not be reached. Check the configured HTTPS API address and shared secret.');
  }
  if (!response.ok) throw new Error(response.status === 401 ? 'Website rejected the connection. Re-enter the same shared secret in both apps.' : `Website sync failed with HTTP ${response.status}.`);
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Website returned a non-JSON response. Check that the API route is deployed.');
  const result: unknown = await response.json().catch(() => null);
  if (!result || typeof result !== 'object') throw new Error('Website returned invalid JSON.');
  return result;
}

export async function callWebsite(request: Record<string, unknown>) {
  return postWebsite(websiteUrl(), request, 15000);
}

export async function callWebsiteCatalogue(request: Record<string, unknown>) {
  return postWebsite(websiteCatalogueUrl(), request, 20000);
}
