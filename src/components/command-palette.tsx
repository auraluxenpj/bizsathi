import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

type Entry = { label: string; to: string; search?: { new: '1' } };
const create: Entry[] = [
  { label: 'New sale', to: '/sales', search: { new: '1' } },
  { label: 'New purchase', to: '/purchases', search: { new: '1' } },
  { label: 'Add expense', to: '/expenses' },
  { label: 'Add item', to: '/products' },
  { label: 'Add party', to: '/contacts' },
];
const pages: Entry[] = [
  { label: 'Dashboard', to: '/dashboard' }, { label: 'Parties', to: '/parties' }, { label: 'Receive / give payment', to: '/parties' }, { label: 'Inventory', to: '/products' },
  { label: 'Sales', to: '/sales' }, { label: 'Quick POS', to: '/pos' }, { label: 'Purchases', to: '/purchases' },
  { label: 'Expenses', to: '/expenses' }, { label: 'Reports', to: '/reports' }, { label: 'Transactions', to: '/transactions' }, { label: 'Cash & Bank accounts', to: '/cash-bank' }, { label: 'Credit reminder', to: '/credit-reminder' }, { label: 'Calculators', to: '/calculators' }, { label: 'Stock ledger', to: '/inventory' },
  { label: 'Cash counters', to: '/cash-counters' }, { label: 'Manage staff', to: '/businesses' }, { label: 'My account', to: '/profile' },
  { label: 'Notebook', to: '/notebook' }, { label: 'Bill Gallery', to: '/bill-gallery' }, { label: 'Item Categories', to: '/categories' },
];

// Only one instance should own the keyboard shortcut; the mobile icon passes shortcut={false}.
export function CommandPalette({ className = '', variant = 'bar', shortcut = true }: { className?: string; variant?: 'bar' | 'icon'; shortcut?: boolean }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen(o => !o); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);
  const go = (e: Entry) => { setOpen(false); navigate({ to: e.to, ...(e.search ? { search: e.search } : {}) } as never); };
  return <>
    {variant === 'icon' ? <button type="button" aria-label="Search or create" title="Search" onClick={() => setOpen(true)} className={`flex size-10 items-center justify-center rounded-md hover:bg-secondary ${className}`}><Search className="size-5" /></button> : <button type="button" onClick={() => setOpen(true)} className={`flex h-10 items-center gap-2 rounded-lg border bg-secondary/40 px-3 text-sm text-muted-foreground ${className}`}><Search className="size-4" /><span className="flex-1 text-left">Search or create anything...</span><kbd className="text-xs">⌘ + K</kbd></button>}
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages or create something..." />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Create">{create.map(e => <CommandItem key={e.label} value={`create ${e.label}`} onSelect={() => go(e)}>{e.label}</CommandItem>)}</CommandGroup>
        <CommandGroup heading="Go to">{pages.map(e => <CommandItem key={e.label} value={`go ${e.label}`} onSelect={() => go(e)}>{e.label}</CommandItem>)}</CommandGroup>
      </CommandList>
    </CommandDialog>
  </>;
}
