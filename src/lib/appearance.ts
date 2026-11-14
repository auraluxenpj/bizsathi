export type Appearance = { dark: boolean; size: 'small' | 'normal' | 'large' };
const KEY = 'bizsathi.appearance';
const SIZE = { small: '14px', normal: '16px', large: '18px' } as const;
export function readAppearance(): Appearance {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Appearance>; return { dark: v.dark === true, size: v.size === 'small' || v.size === 'large' ? v.size : 'normal' }; } catch { return { dark: false, size: 'normal' }; }
}
export function applyAppearance(a: Appearance) {
  document.documentElement.classList.toggle('dark', a.dark);
  document.documentElement.style.fontSize = SIZE[a.size];
}
export function saveAppearance(a: Appearance) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage unavailable */ } applyAppearance(a); }
