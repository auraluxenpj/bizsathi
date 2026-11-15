import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { searchWorkspaceRecords } from '@/lib/command-search.functions';
import { Search } from 'lucide-react';
import { filterCommandEntries, type CommandEntry } from '@/lib/command-palette';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

type Entry = CommandEntry;
const create: Entry[] = [
  { label: 'New sale', to: '/sales', search: { new: '1' }, permission: 'sales.create' },
  { label: 'New purchase', to: '/purchases', search: { new: '1' }, permission: 'purchases.create' },
  { label: 'Add expense', to: '/expenses', permission: 'expenses.create' },
  { label: 'Add item', to: '/products', permission: 'inventory.create' },
  { label: 'Add party', to: '/contacts', anyPermission: ['customers.create', 'suppliers.create'] },
];
const pages: Entry[] = [
  { label: 'Dashboard', to: '/dashboard' }, { label: 'Parties', to: '/parties' }, { label: 'Receive / give payment', to: '/parties' }, { label: 'Inventory', to: '/products' },
  { label: 'Sales', to: '/sales' }, { label: 'Quick POS', to: '/pos' }, { label: 'Purchases', to: '/purchases' },
  { label: 'Expenses', to: '/expenses' }, { label: 'Reports', to: '/reports' }, { label: 'Transactions', to: '/transactions' }, { label: 'Cash & Bank accounts', to: '/cash-bank' }, { label: 'Credit reminder', to: '/credit-reminder' }, { label: 'Calculators', to: '/calculators' }, { label: 'Stock ledger', to: '/inventory' },
  { label: 'Cash counters', to: '/cash-counters' }, { label: 'Manage staff', to: '/businesses' }, { label: 'My account', to: '/profile' },
  { label: 'Notebook', to: '/notebook' }, { label: 'Bill Gallery', to: '/bill-gallery' }, { label: 'Item Categories', to: '/categories' }, { label: 'Scan Receipts', to: '/expense-receipts' },
];

// Only one instance should own the keyboard shortcut; the mobile icon passes shortcut={false}.
export function CommandPalette({ className = '', variant = 'bar', shortcut = true, visible = () => true, can = () => true, businessId }: { className?: string; variant?: 'bar' | 'icon'; shortcut?: boolean; visible?: (to: string) => boolean; can?: (permission: string) => boolean; businessId?: string }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const navigate = useNavigate();
  const searchRecords = useServerFn(searchWorkspaceRecords);
  const recordSearch = useQuery({ queryKey: ['command-record-search', businessId, term.trim()], queryFn: () => searchRecords({ data: { businessId: businessId!, query: term.trim() } }), enabled: open && !!businessId && term.trim().length >= 2, staleTime: 15000, retry: false });
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen(o => !o); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);
  const availableCreate = filterCommandEntries(create, visible, can);
  const availablePages = filterCommandEntries(pages, visible);
  const go = (e: Entry) => { setOpen(false); navigate({ to: e.to, ...(e.search ? { search: e.search } : {}) } as never); };
  return <>
    {variant === 'icon' ? <button type="button" aria-label="Search or create" title="Search" onClick={() => setOpen(true)} className={`flex size-10 shrink-0 items-center justify-center rounded-md hover:bg-secondary ${className}`}><Search className="size-5" /></button> : <button type="button" onClick={() => setOpen(true)} className={`flex h-10 min-w-0 items-center gap-2 whitespace-nowrap rounded-lg border bg-secondary/40 px-3 text-sm text-muted-foreground ${className}`}><Search className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate whitespace-nowrap text-left">Search or create…</span><kbd className="hidden shrink-0 whitespace-nowrap text-xs 2xl:inline-flex">⌘ / Ctrl + K</kbd></button>}
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search products, parties, vouchers or pages..." value={term} onValueChange={setTerm} />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {recordSearch.data?.products.length ? <CommandGroup heading="Products">{recordSearch.data.products.map(p => <CommandItem key={p.id} value={`product ${p.name} ${p.detail}`} onSelect={() => go({ label: p.name, to: '/products' })}><span className="min-w-0"><span className="block truncate">{p.name}</span><span className="block truncate text-xs text-muted-foreground">{p.detail}</span></span></CommandItem>)}</CommandGroup> : null}
        {recordSearch.data?.parties.length ? <CommandGroup heading="Parties">{recordSearch.data.parties.map(p => <CommandItem key={p.id} value={`party ${p.name} ${p.detail}`} onSelect={() => go({ label: p.name, to: '/parties' })}><span className="min-w-0"><span className="block truncate">{p.name}</span><span className="block truncate text-xs text-muted-foreground">{p.detail}</span></span></CommandItem>)}</CommandGroup> : null}
        {recordSearch.data?.vouchers.length ? <CommandGroup heading="Vouchers">{recordSearch.data.vouchers.map(v => <CommandItem key={v.id} value={`voucher ${v.name} ${v.detail}`} onSelect={() => go({ label: v.name, to: '/transactions' })}><span className="min-w-0"><span className="block truncate">{v.name}</span><span className="block truncate text-xs text-muted-foreground">{v.detail}</span></span></CommandItem>)}</CommandGroup> : null}
        {recordSearch.isFetching && term.trim().length >= 2 ? <div className="px-3 py-2 text-xs text-muted-foreground">Searching workspace records…</div> : null}
        {recordSearch.isError ? <div className="px-3 py-2 text-xs text-destructive">Record search is unavailable. You can still search pages below.</div> : null}
        <CommandGroup heading="Create">{availableCreate.map(e => <CommandItem key={e.label} value={`create ${e.label}`} onSelect={() => go(e)}>{e.label}</CommandItem>)}</CommandGroup>
        <CommandGroup heading="Go to">{availablePages.map(e => <CommandItem key={e.label} value={`go ${e.label}`} onSelect={() => go(e)}>{e.label}</CommandItem>)}</CommandGroup>
      </CommandList>
    </CommandDialog>
  </>;
}
