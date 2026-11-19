import { extractSpreadsheetId, parseGoogleSheetValues } from './google-sheet-catalogue';
import { parseCatalogueCsv } from './inventory-csv';
import { GoogleSheetsApiError, readGoogleSheetRange, type GoogleSheetsCredentials } from './google-sheets-api.server';

export async function readGoogleSheetCatalogue(
  input: { businessId: string; spreadsheetIdOrUrl: string; sheetName: string },
  credentials: GoogleSheetsCredentials,
  request: typeof fetch = fetch,
) {
  const id = extractSpreadsheetId(input.spreadsheetIdOrUrl);
  if (credentials.serviceAccountJson) {
    const range = `'${input.sheetName.replace(/'/g, "''")}'!A1:Z5002`;
    try {
      const values = await readGoogleSheetRange(id, range, credentials, request);
      return parseGoogleSheetValues(values, input.businessId);
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
  url.searchParams.set('sheet', input.sheetName);
  const response = await request(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' });
  if (!response.ok) throw new Error(`The sheet is private or unreachable (${response.status}). Check the sheet URL, tab name and Google Sheets access or link-sharing settings.`);
  const text = await response.text();
  if (/^\s*</.test(text)) throw new Error('The sheet is private or unreachable. Check Google Sheets access or link-sharing settings.');
  if (text.length > 5_000_000) throw new Error('Sheet data must be smaller than 5 MB.');
  return parseCatalogueCsv(text, input.businessId);
}
