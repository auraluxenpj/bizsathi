import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { adToBs, bsToAd } from '@/lib/format';

/** Date entry in AD or BS. The value is always AD (YYYY-MM-DD), exactly what the database already stores. */
export function DualDateInput({ value, onChange, label = 'Date' }: { value: string; onChange: (ad: string) => void; label?: string }) {
  const [mode, setMode] = useState<'AD' | 'BS'>('AD');
  const [draft, setDraft] = useState('');
  const bs = adToBs(value);
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span role="group" aria-label="Calendar" className="flex rounded-md border text-xs">
          {(['AD', 'BS'] as const).map(m => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setDraft(bs ?? ''); }} className={`px-2 py-0.5 ${mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{m}</button>
          ))}
        </span>
      </div>
      {mode === 'AD'
        ? <Input aria-label={`${label} (AD)`} className="mt-1 h-11" type="date" value={value} onChange={e => onChange(e.target.value)} />
        : <Input aria-label={`${label} (BS)`} className="mt-1 h-11" inputMode="numeric" placeholder="2083-07-18" maxLength={10} value={draft || bs || ''} onChange={e => { setDraft(e.target.value); const ad = bsToAd(e.target.value); if (ad) onChange(ad); }} />}
      <p className="mt-1 text-xs text-muted-foreground">{mode === 'AD' ? (bs ? `${bs} BS` : 'BS date unavailable') : `${value || '—'} AD`}</p>
    </div>
  );
}
