import { useEffect, useState } from 'react';

/** Like useState, but the choice is kept on this device (for example a list's sort order). */
export function useRemembered<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => { try { const v = localStorage.getItem(`bizsathi.${key}`); if (v && (allowed as readonly string[]).includes(v)) setValue(v as T); } catch { /* storage unavailable */ } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (v: T) => { setValue(v); try { localStorage.setItem(`bizsathi.${key}`, v); } catch { /* storage unavailable */ } };
  return [value, set];
}
