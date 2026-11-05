import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { addVat, discountPrice, margin, removeVat } from '@/lib/calculators';
import { formatNPR } from '@/lib/format';

const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));
function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="block text-sm">{label}<Input aria-label={label} className="mt-1 h-11" type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={e => onChange(e.target.value)} /></label>;
}
const Out = ({ label, value }: { label: string; value: string }) => <div className="flex justify-between border-b py-2 text-sm last:border-0"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{value}</span></div>;

export function Calculators() {
  const [amount, setAmount] = useState(''); const [rate, setRate] = useState('13');
  const [price, setPrice] = useState(''); const [pct, setPct] = useState('');
  const [cost, setCost] = useState(''); const [sell, setSell] = useState('');
  const a = num(amount); const r = num(rate) ?? 13; const p = num(price); const d = num(pct); const c = num(cost); const s = num(sell);
  return <main className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-7">
    <h1 className="text-2xl font-bold">Calculators</h1>
    <section className="mt-5 rounded-2xl border bg-card p-5"><h2 className="font-semibold">VAT</h2>
      <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Amount" value={amount} onChange={setAmount} /><Field label="VAT rate %" value={rate} onChange={setRate} /></div>
      {a !== null && <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-medium text-muted-foreground">Add VAT</p><Out label="VAT" value={formatNPR(addVat(a, r).vat)} /><Out label="Total" value={formatNPR(addVat(a, r).total)} /></div><div><p className="text-xs font-medium text-muted-foreground">Amount includes VAT</p><Out label="Price without VAT" value={formatNPR(removeVat(a, r).base)} /><Out label="VAT" value={formatNPR(removeVat(a, r).vat)} /></div></div>}</section>
    <section className="mt-5 rounded-2xl border bg-card p-5"><h2 className="font-semibold">Discount</h2>
      <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Price" value={price} onChange={setPrice} /><Field label="Discount %" value={pct} onChange={setPct} /></div>
      {p !== null && d !== null && <div className="mt-4"><Out label="You save" value={formatNPR(discountPrice(p, d).discount)} /><Out label="Final price" value={formatNPR(discountPrice(p, d).final)} /></div>}</section>
    <section className="mt-5 rounded-2xl border bg-card p-5"><h2 className="font-semibold">Profit margin</h2>
      <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Cost price" value={cost} onChange={setCost} /><Field label="Selling price" value={sell} onChange={setSell} /></div>
      {c !== null && s !== null && <div className="mt-4"><Out label="Profit" value={formatNPR(margin(c, s).profit)} /><Out label="Margin" value={`${margin(c, s).marginPct}%`} /><Out label="Markup" value={`${margin(c, s).markupPct}%`} /></div>}</section>
  </main>;
}
