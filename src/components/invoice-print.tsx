import {PaymentQr} from './payment-qr';
import { useEffect, useState, type ReactNode } from 'react';
import { MessageCircle, MessageSquare, Printer, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBsAd, formatNPR } from '@/lib/format';
import { invoiceMessage, invoiceTitle, type InvoiceLine } from '@/lib/invoice-message';
import { smsLink, whatsappLink } from '@/lib/reminders';

export type InvoiceLayout = 'a4' | 'thermal';
const KEY = 'bizsathi.invoice-layout';

/** Remembers the last print layout on this device. Storage can be unavailable, so every access is guarded. */
export function useInvoiceLayout(): [InvoiceLayout, (l: InvoiceLayout) => void] {
  const [layout, setLayout] = useState<InvoiceLayout>('a4');
  useEffect(() => { try { if (localStorage.getItem(KEY) === 'thermal') setLayout('thermal'); } catch { /* ignore */ } }, []);
  return [layout, (l: InvoiceLayout) => { setLayout(l); try { localStorage.setItem(KEY, l); } catch { /* ignore */ } }];
}

export type InvoiceData = {
  business: string; pan: string; reference: string; date: string; status: string; kind: string; branch: string;
  businessId?:string; address?:string; partyPan?:string; party: string; phone: string; lines: InvoiceLine[]; subtotal: number; tax: number; total: number; paid: number; returned: number; outstanding: number; docId: string;
};
export const messageFor = (d: InvoiceData) => invoiceMessage({ business: d.business, reference: d.reference, date: d.date, kind: d.kind, party: d.party, lines: d.lines, total: d.total, paid: d.paid, outstanding: d.outstanding });

export function InvoiceActions({ data, layout, onLayout, onStatus }: { data: InvoiceData; layout: InvoiceLayout; onLayout: (l: InvoiceLayout) => void; onStatus: (m: string) => void }) {
  const text = messageFor(data);
  const wa = whatsappLink(data.phone, text) ?? `https://wa.me/?text=${encodeURIComponent(text)}`;
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: data.reference, text });
      else { await navigator.clipboard.writeText(text); onStatus('Invoice text copied.'); }
    } catch { onStatus('Sharing was cancelled or is unavailable.'); }
  }
  return <div className="flex flex-wrap items-center gap-2">
    <span role="group" aria-label="Print layout" className="flex rounded-md border text-sm">
      {([['a4', 'A4'], ['thermal', '80mm']] as const).map(([k, label]) => <button key={k} type="button" aria-pressed={layout === k} onClick={() => onLayout(k)} className={`px-3 py-2 ${layout === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{label}</button>)}
    </span>
    <Button variant="outline" onClick={() => window.print()}><Printer />Print</Button>
    <Button asChild variant="outline" className="text-emerald-700"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a></Button>
    {data.phone && <Button asChild variant="outline"><a href={smsLink(data.phone, text)}><MessageSquare />SMS</a></Button>}
    <Button variant="outline" onClick={share}><Share2 />Share</Button>
  </div>;
}

function Totals({ d, compact }: { d: InvoiceData; compact?: boolean }) {
  const rows: [string, number][] = [['Subtotal', d.subtotal], ['VAT', d.tax], ['Total', d.total]];
  const isReturn = d.kind === 'sale_return' || d.kind === 'purchase_return';
  if (d.paid > 0) rows.push([isReturn ? 'Refund recorded' : 'Paid', d.paid]);
  if (d.returned > 0) rows.push(['Returned', d.returned]);
  if (d.outstanding > 0) rows.push([isReturn ? 'Refund due' : 'Balance due', d.outstanding]);
  return <dl className={`space-y-1 ${compact ? 'text-xs' : 'ml-auto max-w-xs text-sm'}`}>{rows.map(([label, value]) => <div key={label} className={`flex justify-between gap-4 ${label === 'Total' ? 'border-t pt-1 font-semibold' : ''}`}><dt>{label}</dt><dd className="tabular-nums">{formatNPR(value)}</dd></div>)}</dl>;
}

export function InvoiceSheet({ data: d, layout, extra }: { data: InvoiceData; layout: InvoiceLayout; extra?: ReactNode }) {
  const thermal = layout === 'thermal';
  return <>
    {/* Sets the paper size only while an invoice is on screen. */}
    <style>{`@media print { @page { size: ${thermal ? '80mm auto' : 'A4'}; margin: ${thermal ? '3mm' : '12mm'}; } }`}</style>
    {thermal ? (
      <article aria-label="Invoice receipt" data-layout="thermal" className="mx-auto w-[76mm] max-w-full border bg-white p-3 font-mono text-xs text-black">
        <div className="text-center"><h2 className="text-sm font-bold">{d.business}</h2>{d.pan && <p>PAN/VAT {d.pan}</p>}{d.branch && <p>{d.branch}</p>}</div>
        <div className="my-2 border-y border-dashed py-1"><p className="font-semibold">{invoiceTitle(d.kind)} {d.reference}</p><p>{formatBsAd(d.date)}</p>{d.party && <p>{d.party}</p>}</div>
        <ul className="space-y-1">{d.lines.map(l => <li key={l.sku + l.name}><p className="break-words">{l.name}</p><p className="flex justify-between"><span>{l.quantity} × {l.price.toFixed(2)}</span><span className="tabular-nums">{l.total.toFixed(2)}</span></p></li>)}</ul>
        <div className="my-2 border-t border-dashed pt-2"><Totals d={d} compact /></div>
        {extra}
        {d.kind==='sale'&&d.businessId&&<PaymentQr businessId={d.businessId}/>}
        <p className="mt-3 text-center">Thank you! Visit again.</p>
      </article>
    ) : (
      <article aria-label="Invoice receipt" data-layout="a4" className="mx-auto max-w-3xl border-y bg-white py-7 text-black">
        <div className="flex flex-wrap justify-between gap-4 border-b pb-6">
          <div><h2 className="brand text-2xl">{d.business}</h2>{d.pan && <p className="mt-2 text-sm text-neutral-600">PAN/VAT {d.pan}</p>}{d.branch && <p className="text-sm text-neutral-600">{d.branch}</p>}</div>
          <div className="text-right text-sm"><p className="text-lg font-semibold uppercase tracking-wide">{invoiceTitle(d.kind)}</p><p className="font-semibold">{d.reference}</p><p>{formatBsAd(d.date)}</p><p className="capitalize">{d.status}</p></div>
        </div>
        <div className="my-5 text-sm"><p className="text-xs uppercase text-neutral-500">{d.kind.startsWith('purchase') ? 'Supplier' : 'Bill to'}</p><p className="font-medium">{d.party || 'Walk-in customer'}</p>{d.phone && <p>{d.phone}</p>}{d.address&&<p>{d.address}</p>}{d.partyPan&&<p>PAN/VAT {d.partyPan}</p>}</div>
        {extra}
        {d.kind==='sale'&&d.businessId&&<PaymentQr businessId={d.businessId}/>}
        <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-neutral-500"><th className="py-2">Item</th><th>Qty</th><th>Rate</th><th className="text-right">Amount</th></tr></thead>
          <tbody>{d.lines.map(l => <tr key={l.sku + l.name} className="border-b"><td className="py-3">{l.name}<span className="block text-xs text-neutral-500">{l.sku}</span></td><td>{l.quantity}</td><td className="tabular-nums">{l.price.toFixed(2)}</td><td className="text-right tabular-nums">{l.total.toFixed(2)}</td></tr>)}</tbody></table></div>
        <div className="mt-6"><Totals d={d} /></div>
        <p className="mt-10 text-center text-sm text-neutral-600">Thank you for your business.</p>
        <p className="mt-4 break-all text-[10px] text-neutral-400">Document {d.docId}</p>
      </article>
    )}
  </>;
}
