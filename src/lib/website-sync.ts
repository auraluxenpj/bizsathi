import { z } from 'zod';

export const AURALUXE_BUSINESS_ID = '985f4fd7-edcd-41a9-beec-8148fcb29818';
const key = (sku: string) => sku.trim().toLowerCase();
const stock = z.number().int().min(0).max(1_000_000);
export const localSnapshot = z.array(z.object({ id: z.string().uuid(), sku: z.string(), stock: z.string() })).max(2000);
export const websiteState = z.object({ items: z.array(z.object({ sku: z.string(), match: z.enum(['variant','product','none','ambiguous']), current: stock.nullable(), last: stock.nullable(), pending: z.number().int() })).max(2000) });
export const websiteAcks = z.object({ acks: z.array(z.object({ id: z.string().uuid(), sku: z.string(), delta: z.number().int().min(-1_000_000).max(1_000_000).refine(n => n !== 0) })).max(2000) });
export const websiteResults = z.object({ results: z.array(z.object({ sku: z.string(), result: z.enum(['applied','no-match','pending','changed']) })).max(2000) });
export type LocalStock = z.infer<typeof localSnapshot>[number];
export type WebsiteStock = z.infer<typeof websiteState>['items'][number];
export type SyncReport = { compared: number; recorded: number; updated: number; issues: string[]; error: string | null };
export function eligibleStock(rows: LocalStock[]) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(key(r.sku), (counts.get(key(r.sku)) ?? 0) + 1);
  const valid: LocalStock[] = []; const issues: string[] = [];
  for (const r of rows) {
    if (!/^\S{1,64}$/.test(r.sku.trim()) || counts.get(key(r.sku)) !== 1) issues.push(`${r.sku}: invalid or ambiguous SKU`);
    else if (!stock.safeParse(Number(r.stock)).success) issues.push(`${r.sku}: stock must be a whole number between 0 and 1,000,000`);
    else valid.push({ ...r, sku: r.sku.trim() });
  }
  return { valid, issues };
}
export function compareStock(local: LocalStock[], remote: WebsiteStock[]) {
  const remoteBySku = new Map(remote.map(r => [key(r.sku), r]));
  if (remoteBySku.size !== remote.length) throw new Error('Website returned duplicate SKUs. No counts were pushed.');
  return local.map(r => {
    const website = remoteBySku.get(key(r.sku));
    return { sku: r.sku, local: Number(r.stock), website: website?.current ?? null, firstAgreement: website?.last === null, matched: !!website && ['variant','product'].includes(website.match) && website.current !== null, pending: website?.pending ?? 0 };
  });
}
type Dependencies = {
  snapshot: () => Promise<LocalStock[]>;
  call: (request: Record<string, unknown>) => Promise<unknown>;
  record: (ack: z.infer<typeof websiteAcks>['acks'][number]) => Promise<boolean>;
};
export async function runWebsiteSync(d: Dependencies): Promise<SyncReport> {
  const report: SyncReport = { compared: 0, recorded: 0, updated: 0, issues: [], error: null };
  try {
    const initial = eligibleStock(await d.snapshot()); report.issues.push(...initial.issues);
    if (!initial.valid.length) return report;
    const skus = initial.valid.map(r => r.sku);
    const before = websiteState.parse(await d.call({ action: 'state', skus }));
    const comparison = compareStock(initial.valid, before.items); report.compared = comparison.length;
    const matched = comparison.filter(r => r.matched).map(r => r.sku);
    report.issues.push(...comparison.filter(r => !r.matched).map(r => `${r.sku}: missing or ambiguous website match`));
    if (!matched.length) return report;
    const allowed = new Set(matched.map(key));
    const acks = websiteAcks.parse(await d.call({ action: 'ack', skus: matched })).acks;
    const blocked = new Set<string>(); const ids = new Set<string>();
    for (const ack of acks) {
      if (!allowed.has(key(ack.sku)) || ids.has(ack.id)) throw new Error('Website returned an unexpected acknowledgement. Sync stopped.');
      ids.add(ack.id);
      try {
        if (await d.record(ack)) report.recorded++;
      } catch {
        blocked.add(key(ack.sku)); report.issues.push(`${ack.sku}: adjustment not confirmed; check available stock and SKU mapping`); continue;
      }
      // Completion failures must stop the run, not allow stock to overwrite an uncompleted acknowledgement.
      z.object({ count: z.number().int().min(0).max(1) }).parse(await d.call({ action: 'recorded', ids: [ack.id] }));
    }
    const current = eligibleStock(await d.snapshot()); report.issues.push(...current.issues);
    const latest = websiteState.parse(await d.call({ action: 'state', skus: matched }));
    const items = compareStock(current.valid.filter(r => allowed.has(key(r.sku))), latest.items)
      .filter(r => r.matched && !blocked.has(key(r.sku)) && r.pending === 0)
      .map(r => ({ sku: r.sku, stock: r.local, expected: r.website }));
    if (items.length) {
      const results = websiteResults.parse(await d.call({ action: 'push', items })).results;
      const wanted = new Set(items.map(r => key(r.sku)));
      if (results.length !== items.length || new Set(results.map(r => key(r.sku))).size !== items.length || results.some(r => !wanted.has(key(r.sku)))) throw new Error('Website update confirmation was incomplete. Compare again before retrying.');
      for (const r of results) if (r.result === 'applied') report.updated++; else report.issues.push(`${r.sku}: ${r.result}; compare and sync again`);
    }
    report.issues.push(...latest.items.filter(r => r.pending !== 0 && !blocked.has(key(r.sku))).map(r => `${r.sku}: website adjustments still pending`));
  } catch (error) { report.error = error instanceof Error ? error.message : 'Website sync stopped. Compare again before retrying.'; }
  return report;
}