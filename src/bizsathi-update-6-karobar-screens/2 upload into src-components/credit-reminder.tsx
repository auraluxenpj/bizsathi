import { useMemo } from 'react';
import { MessageCircle, MessageSquare, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Screen } from './screen';
import { useCommerce } from './commerce-workspace';
import { allBalances } from '@/lib/party-ledger';
import { reminderMessage, smsLink, whatsappLink } from '@/lib/reminders';
import { formatNPR } from '@/lib/format';

// Lists customers who owe money and opens WhatsApp / SMS / call with a ready message.
// Nothing is sent from the server; the person taps send in their own app.
export function CreditReminder() {
  const w = useCommerce();
  const business = w.commerce.data?.business.name || 'our shop';
  const due = useMemo(() => {
    const d = w.commerce.data; const inv = w.inventory.data;
    if (!d || !inv) return [];
    const balances = allBalances(d.documents, d.payments);
    return inv.parties.filter(p => (balances.get(p.id) ?? 0) > 0).map(p => ({ ...p, amount: balances.get(p.id)! })).sort((a, b) => b.amount - a.amount);
  }, [w.commerce.data, w.inventory.data]);
  const total = due.reduce((s, p) => s + p.amount, 0);
  return <Screen title="Credit Reminder" w={w}>{() => <>
    <section className="mt-5 rounded-2xl bg-emerald-50 p-5"><p className="text-sm text-foreground/70">Total to collect</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatNPR(total)}</p><p className="mt-1 text-xs text-muted-foreground">{due.length} {due.length === 1 ? 'party' : 'parties'} with a pending balance</p></section>
    <ul className="mt-5 divide-y rounded-2xl border bg-card">{due.map(p => { const msg = reminderMessage(p.name, business, p.amount); const wa = p.phone ? whatsappLink(p.phone, msg) : null; return <li key={p.id} className="px-4 py-4"><div className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="block break-words font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{p.phone || 'No phone number'}</span></span><span className="shrink-0 font-semibold tabular-nums text-emerald-600">{formatNPR(p.amount)}</span></div>
      {p.phone ? <div className="mt-3 flex flex-wrap gap-2">{wa && <Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a></Button>}<Button asChild size="sm" variant="outline"><a href={smsLink(p.phone, msg)}><MessageSquare />SMS</a></Button><Button asChild size="sm" variant="outline"><a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}><Phone />Call</a></Button></div> : null}</li>; })}
      {!due.length && <li className="px-4 py-12 text-center text-sm text-muted-foreground">Nobody owes you anything right now.</li>}</ul>
  </>}</Screen>;
}
