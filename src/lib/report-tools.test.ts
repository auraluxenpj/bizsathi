import {describe,it,expect} from 'vitest';
import {presetRange,previousRange,compareRows,mainTotal} from './report-tools';
describe('report presets and comparison',()=>{
 it('this month starts on the 1st',()=>expect(presetRange('month','2026-11-12')).toEqual({from:'2026-11-01',to:'2026-11-12'}));
 it('last month covers the whole previous month',()=>expect(presetRange('lastmonth','2026-03-12')).toEqual({from:'2026-02-01',to:'2026-02-28'}));
 it('financial year starts 16 July',()=>{expect(presetRange('fy','2026-11-12').from).toBe('2026-07-16');expect(presetRange('fy','2026-05-01').from).toBe('2025-07-16');});
 it('last financial year ends 15 July',()=>expect(presetRange('lastfy','2026-11-12')).toEqual({from:'2025-07-16',to:'2026-07-15'}));
 it('previous period has the same length and ends the day before',()=>expect(previousRange('2026-11-01','2026-11-30')).toEqual({from:'2026-10-02',to:'2026-10-31'}));
 it('compares summary rows by item',()=>{const r=compareRows([{Item:'Net profit',Amount:'150.00'}],[{Item:'Net profit',Amount:'100.00'}]);expect(r?.[0]).toMatchObject({Previous:'100.00',Change:'50.00','Change %':'50.0%'});});
 it('totals the main money column ignoring total rows',()=>expect(mainTotal([{Total:'10'},{Total:'5.5'}])).toEqual({col:'Total',total:'15.50'}));
});
