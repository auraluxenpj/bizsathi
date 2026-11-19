import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { isEmailLoginIdentifier } from '@/lib/login-identifier';
import { validateSignup } from '@/lib/signup-validation';

export function SignIn() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [mode, setMode] = useState<'login'|'signup'|'recovery'>('login'); const [hasInvite, setHasInvite] = useState(false);
  const [email, setEmail] = useState(''); const [mobile, setMobile] = useState(''); const [fullName, setFullName] = useState(''); const [identifier, setIdentifier] = useState(''); const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { if (isSupabaseConfigured()) { supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user))).catch(() => setSignedIn(false)); } setHasInvite(Boolean(sessionStorage.getItem('bizsathi-invite') || sessionStorage.getItem('bizsathi-team-token'))); }, []);
  async function loginWithGoogle() {
    if (!isSupabaseConfigured()) return;
    setBusy(true); setError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw error;
    } catch { setError('Google sign-in could not be completed. Please try again.'); }
    finally { setBusy(false); }
  }
  async function emailLogin() {
    if (!isSupabaseConfigured()) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'recovery') {
        if (!isEmailLoginIdentifier(identifier)) throw new Error('invalid email');
        const { error } = await supabase.auth.resetPasswordForEmail(identifier.trim().toLowerCase(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setMessage('If this account exists, a recovery link will be sent to its email.');
      } else {
        if (mode === 'signup') {
          if (!hasInvite) throw new Error('invitation required');
          const values = validateSignup({ fullName, email, mobile, password, confirmPassword });
          const teamToken = sessionStorage.getItem('bizsathi-team-token');
          const emailRedirectTo = teamToken ? `${window.location.origin}/join#token=${encodeURIComponent(teamToken)}` : `${window.location.origin}/auth`;
          const { error } = await supabase.auth.signUp({ email: values.email, password, options: { data: { full_name: values.full_name, mobile: values.mobile }, emailRedirectTo } });
          if (error) throw error;
          setPendingEmail(values.email); setPassword(''); setConfirmPassword('');
          setMessage('Check your email and confirm it, then sign in to verify your mobile number and accept your invitation.');
          return;
        } else {
          if (!isEmailLoginIdentifier(identifier)) throw new Error('Enter a valid email address.');
          const { error } = await supabase.auth.signInWithOtp({
            email: identifier.trim().toLowerCase(),
            options: {
              emailRedirectTo: `${window.location.origin}/auth`,
              shouldCreateUser: false,
            },
          });
          if (error) throw error;
          setMessage('A secure sign-in link has been sent to your email. Open it on this device to access Sutra.');
          return;
        }
        await navigate({ to: sessionStorage.getItem('bizsathi-team-token') ? '/join' : sessionStorage.getItem('bizsathi-invite') ? '/invite' : '/dashboard' });
      }
    } catch (e) { setError(mode === 'signup' && e instanceof Error && !(e as { status?: number }).status ? e.message : 'This request could not be completed. Check your details and try again.'); }
    finally { setBusy(false); }
  }
  const title = mode === 'recovery' ? 'Recover account' : mode === 'signup' ? 'Create account' : 'Sign in';
  return <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-10">
    <div className="w-full max-w-sm">
      <img src="/brand/sutra-logo.svg" alt="Sutra by Auraluxe" className="mx-auto mb-6 h-14 w-auto max-w-full" />
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        {signedIn ? <div className="space-y-3">
          <h1 className="brand text-xl font-semibold">You are signed in</h1>
          <Button className="w-full" size="lg" onClick={() => navigate({ to: '/dashboard' })}>Open dashboard <ArrowUpRight /></Button>
          <Button variant="outline" className="w-full" onClick={async () => { await queryClient.cancelQueries(); queryClient.clear(); await supabase.auth.signOut(); setSignedIn(false); await navigate({ to: '/auth', replace: true }); }}>Sign out</Button>
        </div> : <>
          <h1 className="brand text-xl font-semibold">{title}</h1>
          {pendingEmail ? <div className="mt-5 space-y-4"><p className="text-sm">Confirmation email requested for {pendingEmail}.</p><Button className="w-full" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const token = sessionStorage.getItem('bizsathi-team-token'); const { error } = await supabase.auth.resend({ type: 'signup', email: pendingEmail, options: { emailRedirectTo: token ? `${window.location.origin}/join#token=${encodeURIComponent(token)}` : `${window.location.origin}/auth` } }); if(error) throw error; setMessage('Confirmation email requested again. Check your inbox and spam folder.'); } catch { setError('Could not resend the confirmation email. Please wait before trying again.'); } finally { setBusy(false); } }}>Resend confirmation email</Button><Button variant="outline" className="w-full" onClick={() => { setIdentifier(pendingEmail); setPendingEmail(''); setMode('login'); setMessage(''); }}>Back to sign-in</Button></div> : <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); emailLogin(); }}>
            {mode === 'signup' ? <>
              <label className="block text-sm">Full name<Input className="mt-1 h-11" type="text" autoComplete="name" required minLength={2} maxLength={120} value={fullName} onChange={e => setFullName(e.target.value)} /></label>
              <label className="block text-sm">Email<Input className="mt-1 h-11" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
              <label className="block text-sm">Mobile number<Input className="mt-1 h-11" type="tel" inputMode="numeric" autoComplete="tel" required maxLength={20} placeholder="98XXXXXXXX" value={mobile} onChange={e => setMobile(e.target.value)} /></label>
            </> : <label className="block text-sm">{mode === 'recovery' ? 'Email' : 'Email address'}<Input className="mt-1 h-11" type={mode === 'recovery' ? 'email' : 'text'} autoComplete="username" required maxLength={254} value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="you@example.com" /></label>}
            {mode === 'signup' && <label className="block text-sm">Password<Input className="mt-1 h-11" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>}
            {mode === 'signup' && <label className="block text-sm">Confirm password<Input className="mt-1 h-11" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>}
            {mode === 'signup' && password && confirmPassword && password !== confirmPassword && <p className="text-sm text-destructive">Passwords do not match.</p>}
            <Button className="h-11 w-full" disabled={busy || !isSupabaseConfigured()}>{busy ? 'Please wait…' : mode === 'recovery' ? 'Send recovery link' : mode === 'signup' ? 'Create account' : 'Email me a sign-in link'}</Button>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              {(hasInvite || mode === 'signup') && <Button type="button" variant="link" className="h-auto p-0" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setMessage(''); }}>{mode === 'signup' ? 'Already have an account?' : 'Create account'}</Button>}
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => { setMode(mode === 'recovery' ? 'login' : 'recovery'); setError(''); setMessage(''); }}>{mode === 'recovery' ? 'Back to sign-in' : 'Forgot password?'}</Button>
            </div>
          </form>}
          {mode !== 'recovery' && !pendingEmail && <>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
            <div className="grid gap-2">
              <Button variant="outline" className="h-11" disabled={busy || !isSupabaseConfigured()} onClick={loginWithGoogle}>Continue with Google</Button>
            </div>
          </>}
        </>}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="mt-4 text-sm">{message}</p>}
      </div>
    </div>
  </main>;
}
