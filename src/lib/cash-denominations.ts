// Presentation helpers for counting physical cash by note/coin.
// Whole-number counts times whole-rupee denominations, so plain integer maths is exact.
// Nothing here touches posting: the counter still sends a single total to post_cash_counter_event.

/** Nepali rupee notes/coins, largest first. Edit this list if the till uses other values. */
export const NPR_DENOMINATIONS = [1000, 500, 100, 50, 20, 10, 5, 2, 1] as const;

/** Raw text typed per denomination, kept as strings so an empty box stays empty. */
export type DenominationCounts = Partial<Record<number, string>>;

/** Keep digits only, drop leading zeros ("007" -> "7", "0" stays "0"), cap at 6 digits. */
export function sanitizeCount(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 6);
}

/** True once any box has been filled in (a typed "0" counts as filled). */
export function hasAnyCount(counts: DenominationCounts): boolean {
  return Object.values(counts).some((v) => v !== undefined && v !== '');
}

/** Total rupees for the counts entered; empty or invalid boxes count as zero. */
export function countedTotal(counts: DenominationCounts): number {
  return NPR_DENOMINATIONS.reduce((sum, d) => sum + d * (Number(counts[d]) || 0), 0);
}
