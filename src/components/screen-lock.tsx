import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Lock, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

type LockConfig = { salt: string; hash: string; idleMinutes: number };
type LockContextValue = {
  config: LockConfig | null;
  locked: boolean;
  savePin: (pin: string, currentPin?: string) => Promise<string | null>;
  disablePin: (currentPin: string) => Promise<string | null>;
  updateIdle: (minutes: number) => void;
  lock: () => void;
  unlock: (pin: string) => Promise<boolean>;
};
const ScreenLockContext = createContext<LockContextValue | null>(null);
const storageKey = (userId: string) => `sutra.screen-lock.v1.${userId}`;
const lockSignalKey = (userId: string) => `sutra.screen-lock.signal.v1.${userId}`;
function signalOtherTabs(userId: string) {
  if (!userId) return;
  try { localStorage.setItem(lockSignalKey(userId), `${Date.now()}-${Math.random()}`); } catch { /* Cross-tab signalling is best-effort. */ }
}
const encoder = new TextEncoder();
const toHex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (value: string) => new Uint8Array(value.match(/.{1,2}/g)?.map(part => Number.parseInt(part, 16)) ?? []);
async function hashPin(pin: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 180000, hash: 'SHA-256' }, key, 256);
  return toHex(new Uint8Array(bits));
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
async function matchesPin(pin: string, config: LockConfig) {
  try { return safeEqual(await hashPin(pin, fromHex(config.salt)), config.hash); }
  catch { return false; }
}
function useScreenLock() {
  const value = useContext(ScreenLockContext);
  if (!value) throw new Error('ScreenLockProvider is missing');
  return value;
}

export function ScreenLockProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState('');
  const [config, setConfig] = useState<LockConfig | null>(null);
  const [locked, setLocked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [failures, setFailures] = useState(0);
  const [retryAt, setRetryAt] = useState(0);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => { if (active) setUserId(data.user?.id ?? ''); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserId(session?.user?.id ?? '');
      setPin('');
      setMessage('');
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    setLoaded(false);
    setPin('');
    setMessage('');
    if (!userId) { setConfig(null); setLocked(false); setLoaded(true); return; }
    try {
      const raw = localStorage.getItem(storageKey(userId));
      const parsed = raw ? JSON.parse(raw) as LockConfig : null;
      if (parsed && typeof parsed.salt === 'string' && typeof parsed.hash === 'string' && [1, 5, 10, 15].includes(parsed.idleMinutes)) {
        setConfig(parsed);
        setLocked(true);
      } else {
        setConfig(null);
        setLocked(false);
      }
    } catch {
      setConfig(null);
      setLocked(false);
    }
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === lockSignalKey(userId) && config) {
        setLocked(true);
        setPin('');
        setMessage('');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId, config]);

  const persist = useCallback((next: LockConfig | null) => {
    if (!userId) return;
    try {
      if (next) localStorage.setItem(storageKey(userId), JSON.stringify(next));
      else localStorage.removeItem(storageKey(userId));
    } catch { /* The setting remains active for this tab if persistent storage is unavailable. */ }
    setConfig(next);
  }, [userId]);

  const savePin = useCallback(async (nextPin: string, currentPin?: string) => {
    if (!/^\d{6}$/.test(nextPin)) return 'Choose a six-digit PIN.';
    if (config && (!currentPin || !(await matchesPin(currentPin, config)))) return 'Your current PIN is incorrect.';
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const next: LockConfig = { salt: toHex(salt), hash: await hashPin(nextPin, salt), idleMinutes: config?.idleMinutes ?? 5 };
    persist(next);
    setLocked(false);
    setFailures(0);
    return null;
  }, [config, persist]);

  const disablePin = useCallback(async (currentPin: string) => {
    if (!config || !(await matchesPin(currentPin, config))) return 'Your current PIN is incorrect.';
    persist(null);
    setLocked(false);
    setFailures(0);
    return null;
  }, [config, persist]);

  const updateIdle = useCallback((minutes: number) => {
    if (!config || ![1, 5, 10, 15].includes(minutes)) return;
    persist({ ...config, idleMinutes: minutes });
  }, [config, persist]);

  const unlock = useCallback(async (candidate: string) => {
    if (!config || Date.now() < retryAt || !/^\d{6}$/.test(candidate)) return false;
    if (await matchesPin(candidate, config)) {
      setLocked(false); setPin(''); setMessage(''); setFailures(0); setRetryAt(0);
      return true;
    }
    const nextFailures = failures + 1;
    setFailures(nextFailures);
    setMessage(nextFailures >= 5 ? 'Too many incorrect attempts. Wait 30 seconds.' : 'Incorrect PIN. Try again.');
    if (nextFailures >= 5) { setRetryAt(Date.now() + 30000); setFailures(0); }
    setPin('');
    return false;
  }, [config, failures, retryAt]);

  const lock = useCallback(() => { if (config) { setLocked(true); setPin(''); setMessage(''); signalOtherTabs(userId); } }, [config, userId]);

  useEffect(() => {
    if (!retryAt) return;
    const timer = setTimeout(() => { setRetryAt(0); setMessage(''); }, Math.max(0, retryAt - Date.now()));
    return () => clearTimeout(timer);
  }, [retryAt]);

  useEffect(() => {
    if (!config || locked || !loaded) return;
    let timer: ReturnType<typeof setTimeout>;
    let hiddenAt: number | null = null;
    const timeout = config.idleMinutes * 60 * 1000;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { setLocked(true); signalOtherTabs(userId); }, timeout);
    };
    const onVisibility = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt !== null && Date.now() - hiddenAt >= timeout) { setLocked(true); signalOtherTabs(userId); }
      else reset();
      hiddenAt = null;
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart', 'mousemove'];
    events.forEach(event => window.addEventListener(event, reset, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, reset));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [config, locked, loaded, userId]);

  const resetDeviceLock = () => {
    if (userId) {
      try { localStorage.removeItem(storageKey(userId)); } catch { /* Sign-out still protects the account. */ }
    }
    setConfig(null);
    setLocked(false);
    void supabase.auth.signOut();
  };

  const value = useMemo(() => ({ config, locked, savePin, disablePin, updateIdle, lock, unlock }), [config, locked, savePin, disablePin, updateIdle, lock, unlock]);

  return (
    <ScreenLockContext.Provider value={value}>
      {loaded ? children : <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Securing your Sutra session…</div>}
      {loaded && locked && config && (
        <div className="fixed inset-0 z-[100] flex min-h-dvh items-center justify-center overflow-y-auto bg-[#0B1B3A] px-5 py-10 text-white">
          <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void unlock(pin); }} className="w-full max-w-sm text-center">
            <img src="/brand/sutra-logo.svg" alt="Sutra by Auraluxe" className="mx-auto mb-10 h-9 w-auto brightness-0 invert" />
            <span className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10"><LockKeyhole className="size-8" /></span>
            <h1 className="mt-6 text-2xl font-semibold">Sutra is locked</h1>
            <p className="mt-2 text-sm text-white/65">Enter your personal six-digit PIN to continue.</p>
            <Input autoFocus type="password" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-7 h-14 border-white/20 bg-white/10 text-center text-2xl tracking-[0.65em] text-white placeholder:text-white/40" placeholder="••••••" aria-label="Six-digit screen lock PIN" />
            {message && <p role="alert" className="mt-3 text-sm text-rose-200">{message}</p>}
            {retryAt > Date.now() && <p className="mt-2 text-xs text-white/60">Try again in 30 seconds.</p>}
            <Button type="submit" disabled={pin.length !== 6 || Date.now() < retryAt} className="mt-5 h-12 w-full bg-white text-[#0B1B3A] hover:bg-white/90">Unlock Sutra</Button>
            <p className="mt-5 text-xs text-white/50">Forgot your PIN? Reset this device's lock and sign in again. You will need your normal account credentials.</p>
            <Button type="button" variant="ghost" className="mt-2 text-white/70 hover:bg-white/10 hover:text-white" onClick={resetDeviceLock}>Forgot PIN? Reset device lock</Button>
            <Button type="button" variant="ghost" className="mt-1 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => void supabase.auth.signOut()}>Sign out</Button>
          </form>
        </div>
      )}
    </ScreenLockContext.Provider>
  );
}

export function ScreenLockButton() {
  const { config, lock } = useScreenLock();
  if (!config) return null;
  return <Button type="button" variant="ghost" size="icon" aria-label="Lock Sutra screen" title="Lock Sutra screen" onClick={lock}><Lock className="size-4" /></Button>;
}

export function ScreenLockSettings() {
  const { config, savePin, disablePin, updateIdle } = useScreenLock();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (newPin !== confirmPin) { setMessage('The new PINs do not match.'); return; }
    setBusy(true);
    const result = await savePin(newPin, config ? currentPin : undefined);
    setMessage(result ?? 'Screen lock PIN saved on this device.');
    if (!result) { setCurrentPin(''); setNewPin(''); setConfirmPin(''); }
    setBusy(false);
  }
  async function remove() {
    setBusy(true);
    const result = await disablePin(currentPin);
    setMessage(result ?? 'Screen lock disabled on this device.');
    if (!result) setCurrentPin('');
    setBusy(false);
  }

  return (
    <section className="rounded-xl border bg-card p-5 sm:p-7">
      <div className="mb-5 flex items-center gap-3"><ShieldCheck className="size-5 text-primary" /><div><h2 className="font-semibold">Sutra screen lock</h2><p className="text-sm text-muted-foreground">Protect your open Sutra session with a personal PIN on this device.</p></div></div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-4">
        <div><p className="text-sm font-medium">{config ? 'Screen lock is enabled' : 'Screen lock is not enabled'}</p><p className="mt-1 text-xs text-muted-foreground">{config ? 'You can lock immediately from the top bar.' : 'Set a PIN to enable manual and automatic locking.'}</p></div>
        <span className={config ? 'rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700' : 'rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground'}>{config ? 'Enabled' : 'Disabled'}</span>
      </div>
      {config && <label className="mb-5 block text-sm font-medium">Auto-lock after<select className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3" value={config.idleMinutes} onChange={event => updateIdle(Number(event.target.value))}><option value={1}>1 minute</option><option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={15}>15 minutes</option></select></label>}
      <form className="space-y-3" onSubmit={submit}>
        {config && <label className="block text-sm font-medium">Current PIN<Input className="mt-2 h-11" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} pattern="[0-9]{6}" required value={currentPin} onChange={event => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>}
        <label className="block text-sm font-medium">{config ? 'New six-digit PIN' : 'Create six-digit PIN'}<Input className="mt-2 h-11" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} pattern="[0-9]{6}" required value={newPin} onChange={event => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
        <label className="block text-sm font-medium">Confirm PIN<Input className="mt-2 h-11" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} pattern="[0-9]{6}" required value={confirmPin} onChange={event => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
        <div className="flex flex-wrap gap-2"><Button disabled={busy || newPin.length !== 6 || confirmPin.length !== 6 || (config && currentPin.length !== 6)}>{busy ? 'Saving…' : config ? 'Change screen lock PIN' : 'Enable screen lock'}</Button>{config && <Button type="button" variant="outline" disabled={busy || currentPin.length !== 6} onClick={() => void remove()}>Disable screen lock</Button>}</div>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </form>
      <p className="mt-5 text-xs leading-5 text-muted-foreground">Your PIN is stored only as a salted, one-way hash in this browser profile. It is separate for each employee account and device. Clearing browser data removes this device's screen-lock setting; your Sutra login and server permissions remain unchanged.</p>
    </section>
  );
}
