const URL = 'https://www.auraluxe.com.np/api/public/inventory-sync';
export async function callWebsite(request: Record<string, unknown>) {
  const secret = process.env['INVENTORY_SYNC_SECRET'];
  if (!secret) throw new Error('Website sync is not configured. Save INVENTORY_SYNC_SECRET in both apps.');
  let response: Response;
  try {
    response = await fetch(URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body: JSON.stringify(request) });
  } catch { throw new Error('Website could not be reached. Confirmed adjustments are retained; compare before retrying.'); }
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