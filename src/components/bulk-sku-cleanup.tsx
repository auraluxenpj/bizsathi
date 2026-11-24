import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Trash2, ShieldCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { previewUnusedProductSkus, deleteUnusedProductSkus } from '@/lib/inventory.functions';

type PreviewRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  stock_quantity: number;
  eligible: boolean;
  reasons: string[];
};

export function BulkSkuCleanup({businessId,onComplete}:{businessId:string;onComplete:()=>void}) {
  const previewFn=useServerFn(previewUnusedProductSkus);
  const deleteFn=useServerFn(deleteUnusedProductSkus);
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState<PreviewRow[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [status,setStatus]=useState('');

  const preview=useMutation({
    mutationFn:()=>previewFn({data:{businessId}}),
    onSuccess:(result)=>{setRows(result as PreviewRow[]);setSelected((result as PreviewRow[]).filter(r=>r.eligible).map(r=>r.variant_id));setStatus('');},
    onError:(error)=>setStatus(error instanceof Error?error.message:'Could not validate unused SKUs.'),
  });
  const remove=useMutation({
    mutationFn:()=>deleteFn({data:{businessId,variantIds:selected}}),
    onSuccess:(result)=>{setStatus(`${result.deleted} SKU(s) archived in BizSathi. Their inventory transaction history is preserved. Google Sheets and Auraluxe records were not changed.`);setRows([]);setSelected([]);onComplete();},
    onError:(error)=>setStatus(error instanceof Error?error.message:'Deletion was not completed. Refresh the preview and try again.'),
  });

  const eligible=rows.filter(r=>r.eligible);
  const allSelected=eligible.length>0&&eligible.every(r=>selected.includes(r.variant_id));
  const toggle=(id:string,checked:boolean)=>setSelected(current=>checked?[...current,id]:current.filter(x=>x!==id));
  const close=(value:boolean)=>{if(!preview.isPending&&!remove.isPending)setOpen(value);};

  return <>
    <Button variant="outline" onClick={()=>{setOpen(true);setRows([]);setSelected([]);setStatus('');preview.mutate();}}>
      <Trash2/> Clean unused SKUs
    </Button>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85dvh] max-w-4xl overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Clean unused SKUs · BizSathi only</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Stock quantity, purchases, receipts, adjustments, transfers, counts, reservations, purchase returns and sync history do not block archiving. Only a confirmed sale or sales return blocks it. All existing inventory movements and linked records are preserved in transaction history. Google Sheets and Auraluxe are not changed.</p>
        {preview.isPending&&<p role="status" className="text-sm">Checking every SKU and its linked records…</p>}
        {rows.length>0&&<>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Total SKUs checked</p><p className="text-xl font-semibold tabular-nums">{rows.length}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Eligible to archive</p><p className="text-xl font-semibold tabular-nums">{eligible.length}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Blocked by sales / sales returns</p><p className="text-xl font-semibold tabular-nums">{rows.length-eligible.length}</p></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={allSelected} onCheckedChange={value=>setSelected(value?eligible.map(r=>r.variant_id):[])}/>
              Select all eligible ({eligible.length})
            </label>
            <Button variant="outline" size="sm" disabled={preview.isPending||remove.isPending} onClick={()=>preview.mutate()}><RefreshCw/> Recheck</Button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-muted"><tr><th className="p-3">Select</th><th className="p-3">Product / variant</th><th className="p-3">SKU</th><th className="p-3">Stock</th><th className="p-3">Result</th></tr></thead>
              <tbody>{rows.map(row=><tr key={row.variant_id} className="border-t align-top">
                <td className="p-3"><Checkbox checked={selected.includes(row.variant_id)} disabled={!row.eligible||remove.isPending} onCheckedChange={value=>toggle(row.variant_id,Boolean(value))}/></td>
                <td className="p-3"><p className="font-medium">{row.product_name}</p><p className="text-xs text-muted-foreground">{row.variant_name}</p></td>
                <td className="p-3 font-mono text-xs">{row.sku}</td>
                <td className="p-3 tabular-nums">{Number(row.stock_quantity).toLocaleString()}</td>
                <td className="p-3">{row.eligible?<span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck size={14}/> Eligible</span>:<span className="text-xs text-muted-foreground">{row.reasons.join('; ')}</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
        {status&&<p role="status" className="text-sm">{status}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={remove.isPending} onClick={()=>close(false)}>Close</Button>
          <Button variant="destructive" disabled={selected.length===0||remove.isPending||preview.isPending} onClick={()=>{
            const chosen=rows.filter(r=>selected.includes(r.variant_id));
            if(window.confirm(`Archive ${chosen.length} SKU(s) in BizSathi? Sales and sales returns are protected. Other inventory movements and sync history will be retained. Google Sheets and Auraluxe will not be changed.`))remove.mutate();
          }}>{remove.isPending?'Archiving…':`Archive selected (${selected.length})`}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
