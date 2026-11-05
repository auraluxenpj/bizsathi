import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { createTradingPeriod } from '@/lib/commerce.functions';
import { fiscalYearFor, formatBsAd } from '@/lib/format';

// Periods are chosen automatically from the document date. This only appears when none is open for
// that date, and creates the Nepal fiscal year through the existing accountant-only function.
export function PeriodNotice({ businessId, date }: { businessId: string; date: string }) {
  const client = useQueryClient(); const create = useServerFn(createTradingPeriod);
  const fy = fiscalYearFor(date); const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: () => create({ data: { businessId, name: fy!.name, start: fy!.start, end: fy!.end } }),
    onSuccess: () => { setError(''); return client.invalidateQueries(); },
    onError: e => setError(e instanceof Error ? e.message : 'Period could not be created.'),
  });
  if (!fy) return null;
  return <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
    <p>No open financial year covers {formatBsAd(date)}.</p>
    <Button className="mt-2" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Creating…' : `Create ${fy.name}`}</Button>
    <span className="ml-2 text-xs text-muted-foreground">{formatBsAd(fy.start)} to {formatBsAd(fy.end)}</span>
    {error && <p className="mt-2 text-destructive">{error}</p>}
  </div>;
}
