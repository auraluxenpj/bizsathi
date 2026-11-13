import {reportViews} from './business-reports';
import type {ReportInput} from './accounting';

export type ReportSearch={view?:ReportInput['view'];business?:string;branch?:string;from?:string;to?:string};
export function validateReportSearch(s:Record<string,unknown>):ReportSearch{
 const text=(key:string)=>typeof s[key]==='string'?s[key] as string:undefined;
 const view=reportViews.find(([id])=>id===s['view'])?.[0];
 return{view,business:text('business'),branch:text('branch'),from:text('from'),to:text('to')};
}
export function reportToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kathmandu',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function validReportDates(from:string,to:string){const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;return valid(from)&&valid(to)&&from<=to;}