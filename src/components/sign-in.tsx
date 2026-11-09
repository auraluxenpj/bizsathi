import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { lovable } from '@/integrations/lovable';
import { supabase } from '@/integrations/supabase/client';
import '@lovable.dev/cloud-auth-js/styles.css';
import { Input } from '@/components/ui/input';
import { credentialsInput } from '@/lib/business-schemas';
import { PhoneOtp } from '@/components/phone-otp';

export function SignIn() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [mode, setMode] = useState<'login'|'signup'|'recovery'>('login');
  const [legacy, setLegacy] = useState(false);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user))); }, []);
  async function login(provider: 'google' | 'lovable') {
    setBusy(true); setError('');
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: `${window.location.origin}/auth` });
      if (result.error) throw result.error;
      if (result.redirected) return;
      const { data } = await supabase.auth.getUser();
      if (data.user) await navigate({ to: sessionStorage.getItem('bizsathi-invite') ? '/invite' : '/dashboard' });
    } catch { setError('Sign-in could not be completed. Please try again.'); }
    finally { setBusy(false); }
  }
  async function emailLogin() {
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'recovery') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setMessage('If this account exists, a recovery link will be sent to its email.');
      } else {
        const credentials = credentialsInput.parse({ email, password });
        if (mode === 'signup') {
          const { data, error } = await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: `${window.location.origin}/auth` } });
          if (error) throw error;
          if (!data.session) { setMessage('Check your email to confirm your account before signing in.'); return; }
        } else {
          const { error } = await supabase.auth.signInWithPassword(credentials);
          if (error) throw error;
        }
        await navigate({ to: sessionStorage.getItem('bizsathi-invite') ? '/invite' : '/dashboard' });
      }
    } catch { setError('This request could not be completed. Check your details and try again.'); }
    finally { setBusy(false); }
  }
  const title = mode === 'recovery' ? 'Recover account' : mode === 'signup' ? 'Create account' : 'Sign in';
  return <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-10">
    <div className="w-full max-w-sm">
      <p className="brand mb-6 text-center text-3xl font-semibold">Auraluxe<span className="text-primary">.</span></p>
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        {signedIn ? <div className="space-y-3">
          <h1 className="brand text-xl font-semibold">You are signed in</h1>
          <Button className="w-full" size="lg" onClick={() => navigate({ to: '/dashboard' })}>Open dashboard <ArrowUpRight /></Button>
          <Button variant="outline" className="w-full" onClick={async () => { await queryClient.cancelQueries(); queryClient.clear(); await supabase.auth.signOut(); setSignedIn(false); await navigate({ to: '/auth', replace: true }); }}>Sign out</Button>
        </div> : <>
          <h1 className="brand text-xl font-semibold">{legacy ? title : 'Sign in with mobile'}</h1>
          {!legacy ? <div className="mt-5 space-y-4"><PhoneOtp mode="login" onVerified={async () => { await navigate({ to: sessionStorage.getItem('bizsathi-invite') ? '/invite' : '/dashboard', replace: true }); }} /><Button variant="link" className="h-auto whitespace-normal text-center" onClick={() => setLegacy(true)}>Existing account — verify your login mobile</Button></div> : <>
          <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); emailLogin(); }}>
            <label className="block text-sm">Email<Input className="mt-1 h-11" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
            {mode !== 'recovery' && <label className="block text-sm">Password<Input className="mt-1 h-11" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>}
            <Button className="h-11 w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'recovery' ? 'Send recovery link' : mode === 'signup' ? 'Create account' : 'Sign in'}</Button>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <button type="button" className="text-primary hover:underline" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setMessage(''); }}>{mode === 'signup' ? 'Already have an account?' : 'Create account'}</button>
              <button type="button" className="text-muted-foreground hover:underline" onClick={() => { setMode(mode === 'recovery' ? 'login' : 'recovery'); setError(''); setMessage(''); }}>{mode === 'recovery' ? 'Back to sign-in' : 'Forgot password?'}</button>
            </div>
          </form>
          {mode !== 'recovery' && <>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
            <div className="grid gap-2">
              <Button variant="outline" className="h-11" disabled={busy} onClick={() => login('google')}>Continue with Google</Button>
              <Button className="lovable-auth-button h-11" variant="outline" disabled={busy} onClick={() => login('lovable')}>Continue with Lovable</Button>
            </div>
          </>}
          <Button variant="link" className="mt-4 w-full" onClick={() => { setLegacy(false); setError(''); setMessage(''); }}>Back to mobile sign-in</Button>
          </>}
        </>}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="mt-4 text-sm">{message}</p>}
      </div>
    </div>
  </main>;
}
