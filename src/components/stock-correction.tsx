import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { SlidersHorizontal, PackageMinus } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { postStock } from '@/lib/inventory.functions';
import { correctionRequest } from '@/lib/stock-corrections';
import { stockBalances, type stockInput } from '@/lib/inventory-schemas';
import type { z } from 'zod';
import type { Workspace } from './inventory-workspace';
export function StockCorrection({w,branch,onStatus}:{w:Workspace;branch:string;onStatus:(s:string)=>void}) {
  const post=useServerFn(postStock);
  const [mode,setMode]=useState<'adjust'|'dispose'|null>(null);
  const [branchId,setBranch]=useState(''),[variantId,setVariant]=useState(''),[quantity,setQuantity]=useState('');
  const [classification,setClassification]=useState<'damaged'|'expired'>('damaged');
  const [notes,setNotes]=useState(''),[reference,setReference]=useState(''),[error,setError]=useState('');
  const [request,setRequest]=useState<z.infer<typeof stockInput>|null>(null);
  const branches=w.access.data?.branches.filter(b=>b.is_active)??[];
  const variants=w.inventory.data?.variants.filter(v=>v.is_active&&v.products?.is_active)??[];
  const onHand=stockBalances(w.inventory.data?.movements??[]).get(`${branchId}:${variantId}`)??0;
  const delta=mode==='dispose'?-Number(quantity):Number(quantity);
  const mutation=useMutation({mutationFn:(r:z.infer<typeof stockInput>)=>post({data:r}),onSuccess:()=>{onStatus(mode==='dispose'?'Disposal confirmed and logged.':'Stock adjustment confirmed and logged.');setMode(null);setRequest(null);w.inventory.refetch();},onError:e=>setError(e.message)});
  function open(m:'adjust'|'dispose') {setMode(m);setBranch(branch||branches[0]?.id||'');setVariant('');setQuantity('');setNotes('');setReference('');setClassification('damaged');setError('');setRequest(null);}
  function submit(){try{if(!mode)return;const r=request??correctionRequest({businessId:w.businessId,id:crypto.randomUUID(),branchId,variantId,reference},{mode,quantity:Number(quantity),classification,notes});if(onHand+r.quantity<0&&!request)throw new Error('The resulting stock cannot be negative.');setRequest(r);mutation.mutate(r);}catch(e){setError(e instanceof Error?e.message:'Check adjustment details.');}}
  const locked=!!request;
  return <><Button variant="outline" disabled={!branches.length||!variants.length} onClick={()=>open('adjust')}><SlidersHorizontal/>Adjust stock</Button><Button variant="outline" disabled={!branches.length||!variants.length} onClick={()=>open('dispose')}><PackageMinus/>Dispose stock</Button>
    <Dialog open={!!mode} onOpenChange={value=>{if(!value&&!mutation.isPending&&!locked)setMode(null);}}><DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto"><DialogTitle>{mode==='dispose'?'Dispose damaged or expired stock':'Adjust stock'}</DialogTitle><DialogDescription>Quantity correction · {reference||'New reference'}</DialogDescription>
      <form className="grid gap-4" onSubmit={e=>{e.preventDefault();submit();}}>
        <label className="text-sm">Branch<select aria-label="Correction branch" className="mt-1 h-11 w-full rounded-md border bg-card px-3" value={branchId} disabled={locked} onChange={e=>setBranch(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="text-sm">Product<select aria-label="Correction product" required disabled={locked} className="mt-1 h-11 w-full rounded-md border bg-card px-3" value={variantId} onChange={e=>setVariant(e.target.value)}><option value="">Select product / SKU</option>{variants.map(v=><option key={v.id} value={v.id}>{v.products?.name} · {v.name} · {v.sku}</option>)}</select></label>
        <label className="text-sm">{mode==='dispose'?'Quantity to dispose':'Quantity change (+ / −)'}<Input aria-label="Correction quantity" required disabled={locked} type="number" step="0.001" min={mode==='dispose'?'0.001':undefined} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        {mode==='dispose'&&<label className="text-sm">Disposal reason<select aria-label="Disposal reason" disabled={locked} className="mt-1 h-11 w-full rounded-md border bg-card px-3" value={classification} onChange={e=>setClassification(e.target.value as typeof classification)}><option value="damaged">Damaged</option><option value="expired">Expired</option></select></label>}
        <label className="text-sm">Reason / notes<Input aria-label="Correction reason" required disabled={locked} maxLength={450} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
        <label className="text-sm">Reference<Input aria-label="Correction reference" required disabled={locked} maxLength={200} value={reference} onChange={e=>setReference(e.target.value)}/></label>
        {variantId&&<dl className="flex justify-between gap-4 border-y py-3 text-sm"><div><dt className="text-muted-foreground">Current stock</dt><dd>{onHand}</dd></div><div><dt className="text-muted-foreground">Resulting stock</dt><dd className={onHand+delta<0?'text-destructive':''}>{Math.round((onHand+delta)*1000)/1000}</dd></div></dl>}
        {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={mutation.isPending||(!locked&&(!variantId||!quantity||onHand+delta<0))}>{mutation.isPending?'Confirming…':locked?'Retry same correction':mode==='dispose'?'Confirm disposal':'Confirm adjustment'}</Button>
        {locked&&!mutation.isPending&&<Button variant="outline" type="button" onClick={()=>{setMode(null);w.inventory.refetch();onStatus(`Check ledger for ${request.reference} before starting another correction.`);}}>Check ledger</Button>}
      </form>
    </DialogContent></Dialog></>;
}