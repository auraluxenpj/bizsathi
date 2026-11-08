import { extractSpreadsheetId, parseGoogleSheetValues } from './google-sheet-catalogue';
import { parseCatalogueCsv } from './inventory-csv';

export async function readGoogleSheetCatalogue(input: {businessId:string;spreadsheetIdOrUrl:string;sheetName:string}, credentials: {gatewayKey?:string | undefined;connectionKey?:string | undefined}, request: typeof fetch = fetch) {
 const id = extractSpreadsheetId(input.spreadsheetIdOrUrl);
 const options = {signal:AbortSignal.timeout(20000)};
 if (credentials.gatewayKey && credentials.connectionKey) {
  // Read one extra data row so the 1,000-row limit cannot silently truncate imports.
  const range = `'${input.sheetName.replace(/'/g, "''")}'!A1:Z1002`;
  const url = new URL(`https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${id}/values/${range}`);
  const response = await request(url, {...options,redirect:'error',headers:{Authorization:`Bearer ${credentials.gatewayKey}`,'X-Connection-Api-Key':credentials.connectionKey}});
  if (response.ok) {
   const result = await response.json() as {values?:unknown};
   return parseGoogleSheetValues(result.values ?? [], input.businessId);
  }
  const body = await response.text();
  console.error(`Google Sheets request failed [${response.status}]: ${body}`);
  // Only access/not-found failures can benefit from public sharing. Never bypass quota or billing failures.
  if (![401,403,404].includes(response.status)) throw new Error(`Google Sheets could not be fetched (${response.status}). Try again later.`);
 }
 const url = new URL(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq`);
 url.searchParams.set('tqx','out:csv');
 url.searchParams.set('sheet', input.sheetName);
 const response = await request(url, {...options,redirect:'follow'});
 if (!response.ok) throw new Error(`The sheet is private or unreachable (${response.status}). Check the sheet URL, tab name and Google Sheets access or link-sharing settings.`);
 const text = await response.text();
 if (text.length > 2_000_000) throw new Error('Sheet data must be smaller than 2 MB.');
 if (/^\s*</.test(text)) throw new Error('The sheet is private or unreachable. Check Google Sheets access or link-sharing settings.');
 return parseCatalogueCsv(text, input.businessId);
}