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
      if (error instanceof GoogleSheetsApiError) {
        const detail = error.stage === 'credentials'
          ? 'The Cloudflare Google service-account JSON is invalid or missing required fields.'
          : error.stage === 'oauth'
            ? `Google rejected the service-account key during OAuth authentication (HTTP ${error.status}). Check that the active JSON key matches the service account.`
            : error.status === 401 || error.status === 403
              ? `Google Sheets API denied the service account (HTTP ${error.status}). Check that the Sheets API is enabled and this exact service account has access to the spreadsheet.`
              : error.status === 404
                ? 'Google Sheets could not find the spreadsheet or requested tab (HTTP 404). Check the spreadsheet ID and tab name.'
                : `Google Sheets API request failed (HTTP ${error.status}).`;
        throw new Error(detail);
      }
      if (!(error instanceof TypeError) && !(error instanceof Error && error.name === 'TimeoutError')) throw error;
      throw new Error('Could not reach Google authentication or Sheets API. Check the Worker network request and try again.');
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
