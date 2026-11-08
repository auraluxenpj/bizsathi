import Papa from 'papaparse';
import { z } from 'zod';
import { parseCatalogueCsv } from './inventory-csv';

export const defaultCatalogueSpreadsheet = '1I4kUw4XJaENcx91RsAjRtjWgER2Iu4AUALhcsb56KDg';
export const googleSheetCatalogueInput = z.object({
 businessId: z.string().uuid(),
 spreadsheetIdOrUrl: z.string().trim().min(1).max(2048),
 sheetName: z.string().trim().min(1).max(100).default('Inventory & Catalogue'),
});
export function extractSpreadsheetId(input: string): string {
 const value = input.trim();
 if (/^[A-Za-z0-9_-]+$/.test(value)) return value;
 try {
  const url = new URL(value);
  const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
  if (url.protocol === 'https:' && url.hostname === 'docs.google.com' && !url.username && !url.password && !url.port && match?.[1]) return match[1];
 } catch { /* Report invalid input below. */ }
 throw new Error('Enter a valid Google Sheets URL or spreadsheet ID.');
}
export function parseGoogleSheetValues(values: unknown, businessId: string) {
 const rows = z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).parse(values);
 const header = rows[0];
 if (!header?.length) throw new Error('The sheet tab is empty.');
 const width = header.length;
 return parseCatalogueCsv(Papa.unparse(rows.map(row => Array.from({length:width}, (_, i) => row[i] ?? ''))), businessId);
}