import {PaymentQr} from './payment-qr';
import { formatNPR } from '@/lib/format';
import { earnedPoints, membershipNumber } from '@/lib/loyalty';

type ReceiptLine = { id: string; name: string; quantity: number; price: number; total: number };
export function CheckoutReceipt({ businessId, business, branch, reference, name, mobile, lines, total, tax, paid, loyalty }: {
  businessId?:string; business: string; branch: string; reference: string; name?:string; mobile: string; lines: ReceiptLine[]; total: number; tax: number; paid: number; loyalty?: { points: number; discount: number; remaining: number } | undefined;
}) {
  return <article aria-label="Receipt preview" className="mx-auto w-full max-w-sm border bg-card p-5 text-sm">
    <header className="border-b border-dashed pb-4 text-center">
      <img src="/brand/auraluxe-invoice-logo.jpg" alt="AURALUXE logo" width="400" height="400" loading="eager" decoding="sync" className="mx-auto mb-2 h-auto w-28 max-w-full object-contain mix-blend-multiply [filter:brightness(1.06)_contrast(1.08)]" />
      <h3 className="break-words text-lg font-semibold">AURALUXE</h3>
      <p className="mt-1 text-muted-foreground">{branch}</p>
      <p className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Unconfirmed · Preview</p>
      <p className="mt-1 break-all font-mono text-xs">{reference}</p>
    </header>
    {(name||mobile) && <div className="border-b border-dashed py-3">{name&&<p className="font-medium">{name}</p>}{mobile&&<><p>{mobile}</p><p className="text-xs text-muted-foreground">{membershipNumber(mobile)}</p></>}</div>}
    <ul className="space-y-3 py-4">{lines.map(l => <li key={l.id}><p className="break-words font-medium">{l.name}</p><div className="mt-1 flex justify-between gap-3 text-xs"><span className="text-muted-foreground">{l.quantity} × {formatNPR(l.price)}</span><span className="shrink-0 tabular-nums">{formatNPR(l.total)}</span></div></li>)}</ul>
    {!lines.length && <p className="pb-4 text-center text-muted-foreground">No items yet</p>}
    <dl className="space-y-2 border-t border-dashed pt-4">{[...(loyalty ? [[`Loyalty discount (${loyalty.points} points)`, -loyalty.discount]] : []), ['VAT', tax], ['Total', total], ['Paid', paid], ['Balance due', Math.max(0, total-paid)]].map(([label, value]) => <div key={String(label)} className={`flex justify-between gap-3 ${label==='Total'?'text-base font-semibold':''}`}><dt>{label}</dt><dd className="tabular-nums">{Number(value) < 0 ? `−${formatNPR(Math.abs(Number(value)))}` : formatNPR(Number(value))}</dd></div>)}</dl>
    {businessId&&<PaymentQr businessId={businessId}/>}
    {membershipNumber(mobile) && <p className="mt-4 border-t border-dashed pt-3 text-center text-xs text-muted-foreground">Points on confirmation · {earnedPoints(total)}{loyalty ? ` · ${loyalty.remaining} points left after redeeming` : ''}</p>}
  </article>;
}