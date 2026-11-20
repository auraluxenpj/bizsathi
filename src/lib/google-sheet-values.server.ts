import Papa from 'papaparse';
import { extractSpreadsheetId } from './google-sheet-catalogue';
import { GoogleSheetsApiError, readGoogleSheetRange, writeGoogleSheetRanges, type GoogleSheetsCredentials } from './google-sheets-api.server';

const quoted = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`;

/** One quick retry for transient network failures. */
async function attempt<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'TypeError')) return run();
    throw error;
  }
}

/** Raw cell values of one tab (first row = headers). Private sheets use a service account; public sheets use CSV sharing. */
export async function readSheetValues(
  spreadsheetIdOrUrl: string,
  sheetName: string,
  credentials: GoogleSheetsCredentials,
  request: typeof fetch = fetch,
): Promise<string[][]> {
  const id = extractSpreadsheetId(spreadsheetIdOrUrl);
  if (credentials.serviceAccountJson) {
    try {
      const values = await readGoogleSheetRange(id, `${quoted(sheetName)}!A1:Z5002`, credentials, request);
      return values.map(row => row.map(cell => cell === null || cell === undefined ? '' : String(cell)));
    } catch (error) {
      if (error instanceof GoogleSheetsApiError && ![401, 403, 404].includes(error.status)) {
        throw new Error(`Google Sheets could not be fetched (${error.status}). Try again later.`);
      }
      if (!(error instanceof GoogleSheetsApiError) && !(error instanceof TypeError) && !(error instanceof Error && error.name === 'TimeoutError')) throw error;
      console.error('Google Sheets API access unavailable; trying link-shared CSV');
    }
  }

  const url = new URL(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq`);
  url.searchParams.set('tqx', 'out:csv');
  url.searchParams.set('sheet', sheetName);
  const response = await attempt(() => request(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' }));
  if (!response.ok) throw new Error(`The sheet is private or unreachable (${response.status}). Check the sheet URL, tab name and Google Sheets access or link-sharing settings.`);
  const text = await response.text();
  if (text.length > 5_000_000) throw new Error('Sheet data must be smaller than 5 MB.');
  if (/^\s*</.test(text)) throw new Error('The sheet is private or unreachable. Check Google Sheets access or link-sharing settings.');
  return Papa.parse<string[]>(text, { skipEmptyLines: false }).data;
}

/** Best effort status writeback. BizSathi's ledger, not the sheet, remains the record of applied stock. */
export async function writeStatusCells(
  spreadsheetIdOrUrl: string,
  sheetName: string,
  updates: { row: number; bizsathi?: string; website?: string }[],
  credentials: GoogleSheetsCredentials,
  request: typeof fetch = fetch,
): Promise<boolean> {
  if (!credentials.serviceAccountJson || !updates.length) return false;
  const id = extractSpreadsheetId(spreadsheetIdOrUrl);
  const data = updates.flatMap(update => [
    ...(update.bizsathi ? [{ range: `${quoted(sheetName)}!I${update.row}`, values: [[update.bizsathi]] }] : []),
    ...(update.website ? [{ range: `${quoted(sheetName)}!J${update.row}`, values: [[update.website]] }] : []),
  ]);
  return writeGoogleSheetRanges(id, data, credentials, request);
}
