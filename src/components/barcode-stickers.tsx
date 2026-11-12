import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import { Printer, ScanBarcode } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { labelFormats, labelPages, stickerValue, type LabelFormat, type LabelProduct } from '@/lib/barcode-labels';
import { formatNPR } from '@/lib/format';
function Barcode({value,onReady}:{value:string;onReady?:(ok:boolean)=>void}) {
  const ref=useRef<SVGSVGElement>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{if(!ref.current)return;try{JsBarcode(ref.current,value,{format:'CODE128',displayValue:false,height:38,width:1.5,margin:10});setError(false);onReady?.(true);}catch{setError(true);onReady?.(false);}},[value,onReady]);
  return <>{error&&<p className="text-xs text-destructive">Code cannot be printed</p>}<svg ref={ref} aria-label={`Barcode ${value}`} className="sticker-barcode"/></>;
}
function Sticker({product,price}:{product:LabelProduct;price:boolean}) {
  return <div className="barcode-sticker"><p className="sticker-name">{product.name}</p><Barcode value={stickerValue(product)}/><p className="sticker-code">{product.sku}</p>{price&&<p className="sticker-price">{formatNPR(product.price)}</p>}</div>;
}
export function BarcodeStickers({products}:{products:LabelProduct[]}) {
  const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[copies,setCopies]=useState<Record<string,number>>({});
  const [format,setFormat]=useState<LabelFormat>('a4-24'),[start,setStart]=useState(1),[price,setPrice]=useState(false);
  const [printing,setPrinting]=useState(false),[error,setError]=useState('');
  const selected=products.filter(p=>(copies[p.id]??0)>0);
  let pages:(LabelProduct|null)[][]=[];let validation='';
  try{pages=labelPages(selected.map(product=>({product,copies:copies[product.id]??0})),format,start);}catch(e){validation=e instanceof Error?e.message:'Check label quantities.';}
  const f=labelFormats[format];
  const invalid=selected.some(p=>!/^[\x20-\x7E]+$/.test(stickerValue(p)));
  useEffect(()=>{if(!printing)return;const done=()=>setPrinting(false);window.addEventListener('afterprint',done);const timer=setTimeout(()=>{try{window.print();}catch{setError('Printing is not available in this browser.');setPrinting(false);}},400);return()=>{clearTimeout(timer);window.removeEventListener('afterprint',done);};},[printing]);
  const sheetStyle=`.barcode-label-pages .barcode-label-page{width:${f.pageWidth}mm;height:${f.pageHeight}mm;padding:${f.top}mm 0 0 ${f.left}mm;grid-template-columns:repeat(${f.columns},${f.width}mm);grid-template-rows:repeat(${f.rows},${f.height}mm);column-gap:${f.gap}mm;} @media print{@page{size:${f.pageWidth}mm ${f.pageHeight}mm;margin:0;}}`;
  return <><Button variant="outline" disabled={!products.length} onClick={()=>{setOpen(true);setError('');}}><ScanBarcode/>Print barcode labels</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto"><DialogTitle>Barcode sticker sheets</DialogTitle><DialogDescription>{selected.length} SKUs · {selected.reduce((n,p)=>n+(copies[p.id]??0),0)} labels</DialogDescription>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Label format<select aria-label="Label format" className="mt-1 h-11 w-full rounded-md border bg-card px-2" value={format} onChange={e=>{setFormat(e.target.value as LabelFormat);setStart(1);}}>{Object.entries(labelFormats).map(([key,v])=><option key={key} value={key}>{v.name}</option>)}</select></label>
        <label className="text-sm">Starting slot<Input aria-label="Starting label slot" type="number" min="1" max={f.columns*f.rows} disabled={f.rows===1} value={start} onChange={e=>setStart(Number(e.target.value))}/></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={price} onChange={e=>setPrice(e.target.checked)}/>Include selling price</label></div>
      <Input aria-label="Search label products" placeholder="Search product / SKU" value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="max-h-56 divide-y overflow-y-auto border-y">{products.filter(p=>`${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase())).map(p=><div key={p.id} className="flex items-center gap-3 py-3"><label className="flex min-w-0 flex-1 items-center gap-3 text-sm"><input type="checkbox" checked={(copies[p.id]??0)>0} onChange={e=>setCopies({...copies,[p.id]:e.target.checked?1:0})}/><span className="break-words">{p.name}<span className="block text-xs text-muted-foreground">{p.sku}</span></span></label><Input aria-label={`Label copies ${p.sku}`} className="w-20 shrink-0" type="number" min="0" max="1000" value={copies[p.id]??0} onChange={e=>setCopies({...copies,[p.id]:Number(e.target.value)})}/></div>)}</div>
      {(validation||invalid||error)&&<p role="alert" className="text-sm text-destructive">{validation||error||(invalid?'One selected SKU/barcode contains characters that Code 128 cannot encode.':'')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{pages.length} {f.rows===1?'stickers':'A4 sheets'} · {f.width} × {f.height} mm</p><Button disabled={!pages.length||!!validation||invalid||printing} onClick={()=>{setError('');setPrinting(true);}}><Printer/>{printing?'Printing…':'Print stickers'}</Button></div>
      {selected[0]&&<div aria-label="Barcode sticker preview" className="flex justify-center border-y py-4"><div className="sticker-preview"><Sticker product={selected[0]} price={price}/></div></div>}
    </DialogContent></Dialog>
    {printing&&typeof document!=='undefined'&&createPortal(<div className="barcode-print-root"><style>{sheetStyle}</style><div aria-label="Barcode label print" className="barcode-label-pages">{pages.map((page,i)=><section className="barcode-label-page" key={i}>{page.map((p,j)=>p?<Sticker key={j} product={p} price={price}/>:<div key={j}/>)}</section>)}</div></div>,document.body)}
  </>;
}