import {Select,SelectTrigger,SelectContent,SelectItem,SelectValue} from './ui/select';
import {presets,presetRange,type Preset} from '@/lib/report-tools';
import {reportToday} from '@/lib/report-filters';

export function ReportRangeFilters({branch,from,to,branches,onChange}:{branch:string;from:string;to:string;branches:{id:string;name:string}[];onChange:(next:{branch?:string;from?:string;to?:string})=>void}){
 const preset=presets.find(([id])=>{const range=presetRange(id,reportToday());return range.from===from&&range.to===to;})?.[0]??'custom';
 return <>
 <label className="min-w-0 text-sm">Branch<Select value={branch} onValueChange={value=>onChange({branch:value})}><SelectTrigger aria-label="Branch" className="mt-2 w-full bg-card"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All authorized branches</SelectItem>{branches.map(b=><SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></label>
 <label className="min-w-0 text-sm">Quick dates<Select value={preset} onValueChange={value=>{if(value!=='custom')onChange(presetRange(value as Preset,reportToday()));}}><SelectTrigger aria-label="Quick dates" className="mt-2 w-full bg-card"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="custom">Custom range</SelectItem>{presets.map(([id,name])=><SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></label>
 <label className="min-w-0 text-sm">From<input aria-label="From date" type="date" value={from} className="mt-2 h-9 w-full min-w-0 rounded-md border bg-card px-2" onChange={e=>onChange({from:e.target.value})}/></label>
 <label className="min-w-0 text-sm">Through<input aria-label="Through date" type="date" value={to} className="mt-2 h-9 w-full min-w-0 rounded-md border bg-card px-2" onChange={e=>onChange({to:e.target.value})}/></label>
 </>;
}