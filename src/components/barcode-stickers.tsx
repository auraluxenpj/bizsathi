import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';
import { Printer, ScanBarcode } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { labelFormats, labelPages, stickerValue, initialLabelCopies, defaultLabelCopies, type LabelFormat, type LabelProduct } from '@/lib/barcode-labels';
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

function buildBarcodePdf(pages:(LabelProduct|null)[][],format:LabelFormat,price:boolean) {
  const f=labelFormats[format];
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:[f.pageWidth,f.pageHeight],compress:true});
  const drawLabel=(product:LabelProduct,x:number,y:number)=>{
    const inset=2;
    const barcodeCanvas=document.createElement('canvas');
    JsBarcode(barcodeCanvas,stickerValue(product),{format:'CODE128',displayValue:false,height:90,width:2,margin:0});
    const barcodeHeight=Math.min(10.5,Math.max(7.5,f.height*0.38));
    const barcodeWidth=Math.min(f.width-inset*2,barcodeHeight*(barcodeCanvas.width/barcodeCanvas.height));
    const barcodeX=x+(f.width-barcodeWidth)/2;
    const nameFont=f.width<45?6.5:7;
    doc.setTextColor(0,0,0);
    doc.setFont('helvetica','bold');
    doc.setFontSize(nameFont);
    const name=doc.splitTextToSize(product.name,f.width-inset*2)[0]||'';
    doc.text(name,x+f.width/2,y+3.1,{align:'center'});
    doc.addImage(barcodeCanvas.toDataURL('image/png'),'PNG',barcodeX,y+4.2,barcodeWidth,barcodeHeight,undefined,'FAST');
    doc.setFont('courier','normal');
    doc.setFontSize(6.3);
    doc.text(doc.splitTextToSize(product.sku,f.width-inset*2)[0]||'',x+f.width/2,y+barcodeHeight+6.1,{align:'center'});
    if(price){
      doc.setFont('helvetica','normal');
      doc.setFontSize(6.5);
      doc.text(formatNPR(product.price),x+f.width/2,y+barcodeHeight+9.1,{align:'center'});
    }
  };
  pages.forEach((page,pageIndex)=>{
    if(pageIndex>0)doc.addPage([f.pageWidth,f.pageHeight],'portrait');
    page.forEach((product,slot)=>{
      if(!product)return;
      const column=slot%f.columns;
      const row=Math.floor(slot/f.columns);
      const x=f.left+column*(f.width+f.gap);
      const y=f.top+row*f.height;
      drawLabel(product,x,y);
    });
  });
  return doc;
}

export function BarcodeStickers({products, autoOpen=false}:{products:LabelProduct[];autoOpen?:boolean}) {
  const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[copies,setCopies]=useState<Record<string,number>>({});
  const [format,setFormat]=useState<LabelFormat>('a4-40'),[start,setStart]=useState(1),[price,setPrice]=useState(false);
  const [printing,setPrinting]=useState(false),[error,setError]=useState('');
  const showDialog=()=>{setCopies(initialLabelCopies(products));setOpen(true);setError('');};
  useEffect(()=>{if(autoOpen&&products.length){setCopies(initialLabelCopies(products));setOpen(true);}},[autoOpen,products.length]);
  const filteredProducts=products.filter(p=>`${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase()));
  const selected=products.filter(p=>(copies[p.id]??0)>0);
  const selectVisible=()=>setCopies(current=>({...current,...Object.fromEntries(filteredProducts.map(p=>[p.id,Math.max(1,defaultLabelCopies(p.stock))]))}));
  const unselectVisible=()=>setCopies(current=>({...current,...Object.fromEntries(filteredProducts.map(p=>[p.id,0]))}));
  let pages:(LabelProduct|null)[][]=[];let validation='';
  try{pages=labelPages(selected.map(product=>({product,copies:copies[product.id]??0})),format,start);}catch(e){validation=e instanceof Error?e.message:'Check label quantities.';}
  const f=labelFormats[format];
  const invalid=selected.some(p=>!/^[\\x20-\\x7E]+$/.test(stickerValue(p)));
  const handlePrint=()=>{
    setError('');
    const popup=window.open('about:blank','_blank');
    if(!popup){setError('Allow pop-ups for BizSathi to open the print-ready PDF.');return;}
    try{
      const doc=buildBarcodePdf(pages,format,price);
      doc.setProperties({title:'BizSathi Barcode Labels',subject:`${selected.length} selected SKUs`});
      doc.autoPrint();
      const url=URL.createObjectURL(doc.output('blob'));
      popup.location.replace(url);
      setPrinting(true);
      window.setTimeout(()=>setPrinting(false),1200);
    }catch(e){
      popup.close();
      setError(e instanceof Error?e.message:'Unable to generate the barcode PDF.');
    }
  };
  return <><Button variant="outline" disabled={!products.length} onClick={showDialog}><ScanBarcode/>Print barcode labels</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto"><DialogTitle>Barcode sticker sheets</DialogTitle><DialogDescription>{selected.length} SKUs · {selected.reduce((n,p)=>n+(copies[p.id]??0),0)} labels · quantities prefilled from current stock</DialogDescription>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Label format<select aria-label="Label format" className="mt-1 h-11 w-full rounded-md border bg-card px-2" value={format} onChange={e=>{setFormat(e.target.value as LabelFormat);setStart(1);}}>{Object.entries(labelFormats).map(([key,v])=><option key={key} value={key}>{v.name}</option>)}</select></label>
        <label className="text-sm">Starting slot<Input aria-label="Starting label slot" type="number" min="1" max={f.columns*f.rows} disabled={f.rows===1} value={start} onChange={e=>setStart(Number(e.target.value))}/></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={price} onChange={e=>setPrice(e.target.checked)}/>Include selling price</label></div>
      <Input aria-label="Search label products" placeholder="Search product / SKU" value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{filteredProducts.length} products shown</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={!filteredProducts.length} onClick={selectVisible}>Select all</Button><Button type="button" size="sm" variant="ghost" disabled={!filteredProducts.some(p=>(copies[p.id]??0)>0)} onClick={unselectVisible}>Unselect all</Button></div></div>
      <div className="max-h-56 divide-y overflow-y-auto border-y">{filteredProducts.map(p=><div key={p.id} className="flex items-center gap-3 py-3"><label className="flex min-w-0 flex-1 items-center gap-3 text-sm"><input type="checkbox" checked={(copies[p.id]??0)>0} onChange={e=>setCopies({...copies,[p.id]:e.target.checked?Math.max(1,defaultLabelCopies(p.stock)):0})}/><span className="break-words">{p.name}<span className="block text-xs text-muted-foreground">{p.sku}</span></span></label><Input aria-label={`Label copies ${p.sku}`} className="w-20 shrink-0" type="number" min="0" max="2000" value={copies[p.id]??defaultLabelCopies(p.stock)} onChange={e=>setCopies({...copies,[p.id]:Number(e.target.value)})}/></div>)}</div>
      {(validation||invalid||error)&&<p role="alert" className="text-sm text-destructive">{validation||error||(invalid?'One selected SKU/barcode contains characters that Code 128 cannot encode.':'')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{pages.length} {f.rows===1?'stickers':'A4 sheets'} · {f.width} × {f.height} mm</p><Button disabled={!pages.length||!!validation||invalid||printing} onClick={handlePrint}><Printer/>{printing?'Preparing PDF…':'Print stickers'}</Button></div>
      {selected[0]&&<div aria-label="Barcode sticker preview" className="flex justify-center border-y py-4"><div className="sticker-preview"><Sticker product={selected[0]} price={price}/></div></div>}
    </DialogContent></Dialog>
  </>;
}
