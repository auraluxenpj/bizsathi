import Papa from 'papaparse';
import { extractSpreadsheetId } from './google-sheet-catalogue';

type Credentials = { gatewayKey?: string | undefined; connectionKey?: string | undefined };
const GATEWAY = 'https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets';
const quoted = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`;

/** Raw cell values of one tab (first row = headers). Uses the connector when configured, else public CSV sharing. */
export async function readSheetValues(spreadsheetIdOrUrl: string, sheetName: string, credentials: Credentials, request: typeof fetch = fetch): Promise<string[][]> {
  const id = extractSpreadsheetId(spreadsheetIdOrUrl); const options = { signal: AbortSignal.timeout(20000) };
  if (credentials.gatewayKey && credentials.connectionKey) {
    const url = new URL(`${GATEWAY}/${id}/values/${quoted(sheetName)}!A1:Z5002`);
    const response = await request(url, { ...options, redirect: 'error', headers: { Authorization: `Bearer ${credentials.gatewayKey}`, 'X-Connection-Api-Key': credentials.connectionKey } });
    if (response.ok) return ((await response.json() as { values?: unknown[][] }).values ?? []).map(row => row.map(c => (c === null || c === undefined ? '' : String(c))));
    if (![401, 403, 404].includes(response.status)) throw new Error(`Google Sheets could not be fetched (${response.status}). Try again later.`);
  }
  const url = new URL(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq`);
  url.searchParams.set('tqx', 'out:csv'); url.searchParams.set('sheet', sheetName);
  const response = await request(url, { ...options, redirect: 'follow' });
  if (!response.ok) throw new Error(`The sheet is private or unreachable (${response.status}). Check the sheet URL, tab name and Google Sheets access or link-sharing settings.`);
  const text = await response.text();
  if (text.length > 5_000_000) throw new Error('Sheet data must be smaller than 5 MB.');
  if (/^\s*</.test(text)) throw new Error('The sheet is private or unreachable. Check Google Sheets access or link-sharing settings.');
  return Papa.parse<string[]>(text, { skipEmptyLines: false }).data;
}

/** Best effort: writes the two "Applied" status cells. The BizSathi ledger, not the sheet, is the record of what was applied. Returns false when the connector cannot write. */
export async function writeStatusCells(spreadsheetIdOrUrl: string, sheetName: string, updates: { row: number; bizsathi?: string; website?: string }[], credentials: Credentials, request: typeof fetch = fetch): Promise<boolean> {
  if (!credentials.gatewayKey || !credentials.connectionKey || !updates.length) return false;
  const id = extractSpreadsheetId(spreadsheetIdOrUrl);
  const data = updates.flatMap(u => [
    ...(u.bizsathi ? [{ range: `${quoted(sheetName)}!I${u.row}`, values: [[u.bizsathi]] }] : []),
    ...(u.website ? [{ range: `${quoted(sheetName)}!J${u.row}`, values: [[u.website]] }] : []),
  ]);
  if (!data.length) return false;
  try {
    const response = await request(`${GATEWAY}/${id}/values:batchUpdate`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${credentials.gatewayKey}`, 'X-Connection-Api-Key': credentials.connectionKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ valueInputOption: 'RAW', data }) });
    return response.ok;
  } catch { return false; }
}
