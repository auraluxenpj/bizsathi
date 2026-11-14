import { useEffect, useState } from 'react';
import { Moon, Type } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { applyAppearance, readAppearance, saveAppearance, type Appearance } from '@/lib/appearance';

export function useApplyAppearance() { useEffect(() => { applyAppearance(readAppearance()); }, []); }

export function AppearanceSettings() {
  const [a, setA] = useState<Appearance>({ dark: false, size: 'normal' });
  useEffect(() => { setA(readAppearance()); }, []);
  const set = (next: Appearance) => { setA(next); saveAppearance(next); };
  return <section className="mt-6"><h2 className="mb-2 text-sm font-medium text-muted-foreground">Appearance</h2>
    <div className="divide-y rounded-2xl border bg-card">
      <label className="flex min-h-14 items-center gap-4 px-4 py-3 text-base"><Moon className="size-5 text-muted-foreground" /><span className="flex-1">Dark mode</span><Switch checked={a.dark} onCheckedChange={v => set({ ...a, dark: v })} aria-label="Dark mode" /></label>
      <div className="flex min-h-14 items-center gap-4 px-4 py-3 text-base"><Type className="size-5 text-muted-foreground" /><span className="flex-1">Font size</span>
        <div role="group" aria-label="Font size" className="flex gap-1">{(['small', 'normal', 'large'] as const).map(s => <button key={s} type="button" aria-pressed={a.size === s} onClick={() => set({ ...a, size: s })} className={`rounded-md border px-3 py-1 text-sm capitalize ${a.size === s ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'}`}>{s}</button>)}</div></div>
    </div></section>;
}
