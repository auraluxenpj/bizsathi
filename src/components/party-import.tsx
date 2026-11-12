import { useCan } from './permission-checklist';
import { useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Upload } from 'lucide-react';
import { Button } from './ui/button';
import { saveParty } from '@/lib/inventory.functions';
import { parsePartyCsv, partyKey, type ImportedParty } from '@/lib/party-csv';

type Props = { businessId: string; kind: 'customer' | 'supplier'; existing: { name: string; phone: string }[]; onDone: () => void };

// Bulk import through the same saveParty function (administrator-only on the server) used by the form.
const readText = (file: File): Promise<string> => typeof file.text === 'function' ? file.text() : new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('File could not be read.')); r.readAsText(file); });

export function PartyImport({ businessId, kind, existing, onDone }: Props) {
  const can = useCan(businessId);
  const save = useServerFn(saveParty); const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ fresh: ImportedParty[]; known: number; blank: number; repeated: number } | null>(null);
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(0); const [message, setMessage] = useState('');

  async function choose(file?: File) {
    setMessage(''); setPreview(null); if (!file) return;
    try {
      const parsed = parsePartyCsv(await readText(file), businessId, kind);
      const have = new Set(existing.map(partyKey));
      const fresh = parsed.rows.filter(r => !have.has(partyKey(r)));
      setPreview({ fresh, known: parsed.rows.length - fresh.length, blank: parsed.blank, repeated: parsed.repeated });
    } catch (e) { setMessage(e instanceof Error ? e.message : 'File could not be read.'); }
    if (input.current) input.current.value = '';
  }
  async function run() {
    if (!preview) return; setBusy(true); setDone(0); setMessage('');
    let count = 0;
    try {
      for (const row of preview.fresh) { await save({ data: { ...row, businessId, kind, is_active: true } }); count++; setDone(count); }
      setMessage(`${count} ${kind}${count === 1 ? '' : 's'} imported.`); setPreview(null);
    } catch (e) { setMessage(`${e instanceof Error ? e.message : 'Import stopped.'} ${count} saved before stopping; importing again skips those.`); }
    finally { setBusy(false); onDone(); }
  }
  return <>
    <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Party CSV file" onChange={e => choose(e.target.files?.[0])} />
    {can('features.import') && <Button variant="outline" onClick={() => input.current?.click()}><Upload />Import CSV</Button>}
    {(preview || message) && <div className="basis-full rounded-lg border bg-card p-4 text-sm">
      {preview && <>
        <p className="font-medium">{preview.fresh.length} new {kind}{preview.fresh.length === 1 ? '' : 's'} ready to import</p>
        <p className="mt-1 text-muted-foreground">{preview.known} already exist · {preview.repeated} repeated in file · {preview.blank} without a name</p>
        {preview.fresh.slice(0, 5).map(r => <p key={partyKey(r)} className="mt-1 break-words">{r.name}{r.phone ? ` · ${r.phone}` : ''}</p>)}
        <div className="mt-3 flex gap-2"><Button disabled={busy || !preview.fresh.length} onClick={run}>{busy ? `Importing ${done} of ${preview.fresh.length}…` : `Import ${preview.fresh.length}`}</Button><Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>Cancel</Button></div>
      </>}
      {message && <p role="status" className="mt-2">{message}</p>}
    </div>}
  </>;
}
