import {describe,it,expect,vi} from 'vitest';
import {extractSpreadsheetId,googleSheetCatalogueInput,parseGoogleSheetValues} from './google-sheet-catalogue';
import {readGoogleSheetCatalogue} from './google-sheet-catalogue.server';
const businessId='10000000-0000-4000-8000-000000000001';
const input={businessId,spreadsheetIdOrUrl:'sheet_123',sheetName:'Inventory & Catalogue'};
describe('Google Sheets catalogue import',()=>{
 it.each([' sheet_123 ','https://docs.google.com/spreadsheets/d/sheet_123/edit#gid=0'])('extracts spreadsheet ID from %s',value=>expect(extractSpreadsheetId(value)).toBe('sheet_123'));
 it.each(['https://evil.example/spreadsheets/d/sheet_123/edit','http://docs.google.com/spreadsheets/d/sheet_123/edit','https://docs.google.com.evil.example/spreadsheets/d/sheet_123','../secret'])('rejects unsafe inputs %s',value=>expect(()=>extractSpreadsheetId(value)).toThrow());
 it('defaults to the master tab',()=>expect(googleSheetCatalogueInput.parse({businessId,spreadsheetIdOrUrl:'sheet_123'}).sheetName).toBe('Inventory & Catalogue'));
 it('normalizes ragged sheet rows using CSV aliases',()=>expect(parseGoogleSheetValues([['Item Name','Generated SKU','Selling Price','Primary Unit'],['Shirt','S1','NPR 1,250.50']],businessId)[0]).toMatchObject({product_name:'Shirt',sku:'S1',selling_price:1250.5,unit:'pcs'}));
 it('rejects missing required sheet data',()=>expect(()=>parseGoogleSheetValues([['Item Name','Generated SKU'],['Shirt']],businessId)).toThrow());
 it('uses authenticated gateway with a quoted tab and no encoded colon',async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValue(Response.json({values:[['Item Name','Generated SKU'],['Shirt','S1']]}));
  const rows=await readGoogleSheetCatalogue(input,{gatewayKey:'test-gateway',connectionKey:'test-connection'},request);
  expect(rows[0]?.sku).toBe('S1');
  const url=String(request.mock.calls[0]?.[0]);
  expect(url).toContain('A1:Z5002');expect(url).not.toContain('%3A');expect(url).toContain('Inventory%20&%20Catalogue');
  expect(request.mock.calls[0]?.[1]?.headers).toEqual({Authorization:'Bearer test-gateway','X-Connection-Api-Key':'test-connection'});
 });
 it('uses link-shared CSV without connector credentials',async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValue(new Response('Item Name,Generated SKU\nShirt,S1'));
  expect((await readGoogleSheetCatalogue(input,{},request))[0]?.sku).toBe('S1');
  const url=new URL(String(request.mock.calls[0]?.[0]));expect(url.hostname).toBe('docs.google.com');expect(url.searchParams.get('sheet')).toBe('Inventory & Catalogue');expect(request.mock.calls[0]?.[1]?.headers).toBeUndefined();
 });
 it('falls back for inaccessible connector sheets without forwarding credentials',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('Access denied',{status:403})).mockResolvedValueOnce(new Response('Item Name,Generated SKU\nShirt,S1'));
  expect((await readGoogleSheetCatalogue(input,{gatewayKey:'test',connectionKey:'test'},request))[0]?.sku).toBe('S1');expect(request.mock.calls[1]?.[1]?.headers).toBeUndefined();vi.restoreAllMocks();
 });
 it('does not bypass quota failures',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  const request=vi.fn<typeof fetch>().mockResolvedValue(new Response('Quota exceeded',{status:429}));
  await expect(readGoogleSheetCatalogue(input,{gatewayKey:'test',connectionKey:'test'},request)).rejects.toThrow('429');expect(request).toHaveBeenCalledTimes(1);vi.restoreAllMocks();
 });
 it('reports private workbook HTML clearly',async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>Sign in</html>'));
  await expect(readGoogleSheetCatalogue(input,{},request)).rejects.toThrow('private or unreachable');
 });
 it('rejects more than 5,000 product rows',()=>expect(()=>parseGoogleSheetValues([['Item Name','Generated SKU'],...Array.from({length:5001},(_,i)=>[`Product ${i}`,`S${i}`])],businessId)).toThrow());
});