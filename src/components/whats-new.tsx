const releases = [
  { title: 'Latest', notes: ['Karobar-style home screen and bottom tabs on phones', 'Dark mode and font size settings', 'Discount as Rs or % on each invoice line', 'Purchase price hidden from staff, also in the data sent to their phone', 'Party PAN/VAT number in Sales and Purchase reports', 'Party categories with a filter', 'Close, reopen and lock a financial year; archive a business', 'Items listed under each invoice in party statements, with a print header', 'Parties list remembers your sort order'] },
];
export function WhatsNew() {
  return <section className="mt-6"><h2 className="mb-2 text-sm font-medium text-muted-foreground">What’s new</h2>
    <div className="divide-y rounded-2xl border bg-card">{releases.map(r => <details key={r.title} className="group px-4 py-3" open><summary className="cursor-pointer list-none text-base font-medium">{r.title}</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{r.notes.map(n => <li key={n}>{n}</li>)}</ul></details>)}</div></section>;
}
