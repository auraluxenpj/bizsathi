import NepaliDate from 'nepali-date-converter';

// Presentation helpers only. Nothing here touches posting, stock or totals logic.

const nepaliNumber = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** NPR with lakh/crore grouping, e.g. Rs. 1,23,456.00. Null/invalid values show an em dash. */
export function formatNPR(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n < 0 ? '-' : ''}Rs. ${nepaliNumber.format(Math.abs(n))}`;
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

/** 12.5k / 1.2L / 3.4Cr style axis labels. */
export function compactNPR(value: number): string {
  const n = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const trim = (x: number) => String(Math.round(x * 10) / 10);
  if (n >= 1e7) return `${sign}${trim(n / 1e7)}Cr`;
  if (n >= 1e5) return `${sign}${trim(n / 1e5)}L`;
  if (n >= 1e3) return `${sign}${trim(n / 1e3)}k`;
  return `${sign}${trim(n)}`;
}

const BS_MONTHS = ['Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
const BS_SHORT = ['Bai', 'Jes', 'Asa', 'Shr', 'Bha', 'Asw', 'Kar', 'Man', 'Pou', 'Mag', 'Fal', 'Cha'];

/** Short BS label such as "Kar 18" for chart axes. */
export function bsShort(ad: string): string {
  const d = parseLocal(ad);
  if (!d) return ad;
  try { const n = new NepaliDate(d); return `${BS_SHORT[n.getMonth()] ?? ""} ${n.getDate()}`; } catch { return ad; }
}

/** The BS month that contains an AD date, with its AD start and end dates. */
export function bsMonthInfo(ad: string): { name: string; fromAd: string; toAd: string } | null {
  const d = parseLocal(ad);
  if (!d) return null;
  try {
    const n = new NepaliDate(d);
    const y = n.getYear(); const m = n.getMonth();
    const from = new NepaliDate(y, m, 1).toJsDate();
    const next = (m === 11 ? new NepaliDate(y + 1, 0, 1) : new NepaliDate(y, m + 1, 1)).toJsDate();
    const to = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
    return { name: BS_MONTHS[m] ?? "", fromAd: toIso(from), toAd: toIso(to) };
  } catch { return null; }
}

export function addDaysAd(ad: string, days: number): string {
  const d = parseLocal(ad) ?? new Date();
  return toIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}
