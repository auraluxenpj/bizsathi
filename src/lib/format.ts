import NepaliDate from 'nepali-date-converter';

// Presentation helpers only. Nothing here touches posting, stock or totals logic.

const nepaliNumber = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** NPR with lakh/crore grouping, e.g. रू 1,23,456.00. Null/invalid values show an em dash. */
export function formatNPR(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n < 0 ? '-' : ''}रू ${nepaliNumber.format(Math.abs(n))}`;
}

const AD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseLocal(ad: string): Date | null {
  const m = AD_PATTERN.exec(ad);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** AD (YYYY-MM-DD) to BS (YYYY-MM-DD), or null if outside the supported calendar range. */
export function adToBs(ad: string): string | null {
  const d = parseLocal(ad);
  if (!d) return null;
  try { return new NepaliDate(d).format('YYYY-MM-DD'); } catch { return null; }
}

/** BS (YYYY-MM-DD) to AD (YYYY-MM-DD), or null if it is not a real BS date. */
export function bsToAd(bs: string): string | null {
  if (!AD_PATTERN.test(bs)) return null;
  try {
    const n = new NepaliDate(bs);
    return n.format('YYYY-MM-DD') === bs ? toIso(n.toJsDate()) : null;
  } catch { return null; }
}

export function formatBsAd(ad: string): string {
  const bs = adToBs(ad);
  return bs ? `${bs} BS · ${ad} AD` : ad;
}

export function todayAd(): string {
  return toIso(new Date());
}
