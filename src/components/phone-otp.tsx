import { useEffect, useState } from 'react';
import { Smartphone, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeLoginPhone, phoneAuthError, requestPhoneCode, verifyPhoneCode } from '@/lib/phone-auth';

export function PhoneOtp({ mode, onVerified }: { mode: 'login' | 'link'; onVerified: () => void | Promise<void> }) {
  const [number, setNumber] = useState('');
  const [sentPhone, setSentPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  async function send(resend = false) {
    setError(''); setMessage('');
    try { normalizeLoginPhone(resend ? sentPhone : number); }
    catch (e) { setError(e instanceof Error ? e.message : 'Enter a valid mobile number.'); return; }
    setBusy(true);
    try {
      const phone = await requestPhoneCode(resend ? sentPhone : number, mode, resend);
      setSentPhone(phone); setCode(''); setRetryAt(Date.now() + 60000);
      setMessage('Code requested. Check your SMS.');
    } catch (e) { setError(phoneAuthError(e)); }
    finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setError(''); setMessage('');
    try {
      await verifyPhoneCode(sentPhone, code, mode);
      setCode(''); setSentPhone(''); setNumber('');
      setMessage(mode === 'link' ? 'Login mobile verified.' : 'Signed in.');
      await onVerified();
    } catch (e) { setError(phoneAuthError(e)); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (!busy) void (sentPhone ? verify() : send()); }}>
      {sentPhone ? <>
        <p className="break-words text-sm text-muted-foreground">SMS code for {sentPhone}</p>
        <label className="block text-sm">SMS code<Input className="mt-1 h-11" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" minLength={6} maxLength={8} required autoFocus /></label>
      </> : <label className="block text-sm">{mode === 'link' ? 'Login mobile number' : 'Mobile number'}<Input className="mt-1 h-11" type="tel" autoComplete="tel" placeholder="98XXXXXXXX" maxLength={30} value={number} onChange={e => setNumber(e.target.value)} required /></label>}
      <Button className="h-11 w-full" disabled={busy || (!sentPhone && remaining > 0)}>{sentPhone ? <ShieldCheck /> : <Smartphone />}{busy ? 'Please wait…' : sentPhone ? (mode === 'link' ? 'Verify mobile' : 'Verify & sign in') : 'Send SMS code'}</Button>
    </form>
    {sentPhone && <div className="flex flex-wrap justify-between gap-2">
      <Button variant="link" size="sm" disabled={busy || remaining > 0} onClick={() => void send(true)}>{remaining > 0 ? `Resend in ${remaining}s` : 'Resend code'}</Button>
      <Button variant="link" size="sm" disabled={busy} onClick={() => { setSentPhone(''); setCode(''); setError(''); setMessage(''); }}>Change number</Button>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}