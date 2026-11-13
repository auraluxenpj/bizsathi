import Decimal from 'decimal.js';
import type {ReportRow} from './accounting';
export type Preset='today'|'yesterday'|'week'|'month'|'lastmonth'|'fy'|'lastfy';
export const presets:[Preset,string][]=[['today','Today'],['yesterday','Yesterday'],['week','This week'],['month','This month'],['lastmonth','Last month'],['fy','This financial year'],['lastfy','Last financial year']];
const iso=(d:Date)=>d.toISOString().slice(0,10);
const utc=(y:number,m:number,d:number)=>new Date(Date.UTC(y,m,d));
/** Nepal financial year starts 1 Shrawan, approximated as 16 July (AD). */
export function presetRange(p:Preset,today:string):{from:string;to:string}{
 const t=new Date(today+'T00:00:00Z');const y=t.getUTCFullYear(),m=t.getUTCMonth(),d=t.getUTCDate();
 if(p==='today')return{from:today,to:today};
 if(p==='yesterday'){const x=iso(utc(y,m,d-1));return{from:x,to:x};}
 if(p==='week'){const dow=t.getUTCDay();return{from:iso(utc(y,m,d-dow)),to:today};}
 if(p==='month')return{from:iso(utc(y,m,1)),to:today};
 if(p==='lastmonth')return{from:iso(utc(y,m-1,1)),to:iso(utc(y,m,0))};
 const start=today>=`${y}-07-16`?y:y-1;
 if(p==='fy')return{from:`${start}-07-16`,to:today};
 return{from:`${start-1}-07-16`,to:`${start}-07-15`};
}
/** Same-length window ending the day before `from`. */
export function previousRange(from:string,to:string){const f=Date.parse(from+'T00:00:00Z'),t=Date.parse(to+'T00:00:00Z');if(!Number.isFinite(f)||!Number.isFinite(t)||f>t)return{from,to};const days=Math.round((t-f)/86400000);const pTo=new Date(f-86400000);const pFrom=new Date(pTo.getTime()-days*86400000);return{from:iso(pFrom),to:iso(pTo)};}
const num=(v:string|undefined)=>{if(v==null||v==='')return null;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:null;};
const key=(r:ReportRow)=>r['Item']??r['Staff member']??r['Product']??'';
const valueCol=(r:ReportRow)=>['Amount','Value','Sales amount','In stock'].find(c=>c in r);
/** Adds Previous and Change columns for summary reports keyed by Item/Staff/Product. */
export function compareRows(cur:ReportRow[],prev:ReportRow[]):ReportRow[]|null{
 const first=cur[0];if(!first)return null;const col=valueCol(first);if(!col||!key(first))return null;
 return cur.map(r=>{const p=prev.find(x=>key(x)===key(r)&&(x['Section']??'')===(r['Section']??''));const a=num(r[col]),b=num(p?.[col]);const change=a!=null&&b!=null?new Decimal(a).minus(b):null;const pct=change&&b?change.div(Math.abs(b)).times(100).toFixed(1)+'%':'';return{...r,Previous:p?.[col]??'—',Change:change?change.toFixed(2):'—','Change %':pct};});
}
/** Sum of the main money column for list reports. */
export function mainTotal(rows:ReportRow[]){const col=['Total','Net','Amount','Money in'].find(c=>rows.some(r=>c in r));if(!col)return null;return{col,total:rows.filter(r=>r['Type']!=='TOTAL').reduce((n,r)=>n.plus(num(r[col])??0),new Decimal(0)).toFixed(2)};}
