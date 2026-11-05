import { Link } from '@tanstack/react-router';
import { Banknote, Landmark, Smartphone } from 'lucide-react';
import Decimal from 'decimal.js';
import { Button } from '@/components/ui/button';
import { Screen } from './screen';
import { useCommerce } from './commerce-workspace';
import { formatNPR } from '@/lib/format';

export function CashBank() {
  const w = useCommerce();
  return <Screen title="Cash & Bank Accounts" w={w}>{({ commerce }) => {
    const balance = (code: string) => commerce.journals.filter(j => j.account_code === code).reduce((s, j) => s.plus(j.debit).minus(j.credit), new Decimal(0)).toNumber();
    const rows = [{ name: 'Cash', value: balance('cash'), icon: Banknote }, { name: 'Bank', value: balance('bank'), icon: Landmark }, { name: 'Wallet', value: balance('wallet'), icon: Smartphone }];
    const total = rows.reduce((s, r) => s + r.value, 0);
    return <>
      <section className="mt-5 rounded-2xl border bg-card p-5"><p className="text-sm text-muted-foreground">Overall Account Balance</p><p className="mt-1 text-3xl font-semibold tabular-nums text-emerald-600">{formatNPR(total)}</p></section>
      <h2 className="mb-2 mt-6 text-lg font-semibold">All Accounts</h2>
      <ul className="divide-y rounded-2xl border bg-card">{rows.map(r => <li key={r.name} className="flex items-center gap-4 px-4 py-4"><span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary"><r.icon className="size-5" /></span><span className="flex-1 text-base">{r.name}</span><span className={`font-semibold tabular-nums ${r.value < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{formatNPR(r.value)}</span></li>)}</ul>
      <div className="mt-5 flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/accounting" search={{ view: 'cashbook' }}>Open cash book</Link></Button><Button asChild variant="outline"><Link to="/cash-counters">Cash counters</Link></Button></div>
    </>;
  }}</Screen>;
}
