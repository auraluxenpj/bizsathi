import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { lovable } from '@/integrations/lovable';
import { supabase } from '@/integrations/supabase/client';
import kathmandu from '@/assets/kathmandu.jpg';
import '@lovable.dev/cloud-auth-js/styles.css';
import { Input } from '@/components/ui/input';
import { credentialsInput } from '@/lib/business-schemas';

export function SignIn() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [mode, setMode] = useState<'login'|'signup'|'recovery'>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user))); }, []);
  async function login(provider: 'google' | 'lovable') {
    setBusy(true); setError('');
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: `${window.location.origin}/auth` });
      if (result.error) throw result.error;
      if (result.redirected) return;
      const { data } = await supabase.auth.getUser();
      if (data.user) await navigate({ to: sessionStorage.getItem('bizsathi-invite') ? '/invite' : '/businesses' });
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
        await navigate({ to: sessionStorage.getItem('bizsathi-invite') ? '/invite' : '/businesses' });
      }
    } catch { setError('This request could not be completed. Check your details and try again.'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-background">
    <header className="flex items-center justify-between border-b px-6 py-5 md:px-12"><span className="brand text-xl font-semibold">bizsathi<span className="text-primary">.</span> <span className="text-xs font-normal text-muted-foreground">NEPAL</span></span><span className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> Administrator workspace</span></header>
    <section className="relative isolate flex min-h-[460px] items-end overflow-hidden bg-primary px-6 py-12 md:px-12">
      <img src={kathmandu} alt="Kathmandu rooftops with the Himalayas beyond" width={1536} height={1024} className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-hero-scrim" />
      <div className="max-w-3xl text-primary-foreground"><p className="mb-4 text-sm">SECURITY & GOVERNANCE</p><h1 className="brand text-5xl font-medium md:text-6xl">BizSathi Nepal</h1><p className="mt-5 max-w-lg text-lg">Security reviews. Clear decisions. A stronger business.</p></div>
    </section>
    <section className="mx-auto grid max-w-6xl gap-8 px-6 py-10 md:grid-cols-2 md:px-12"><div><p className="mb-3 text-xs font-semibold text-primary">BUSINESS ACCESS</p><h2 className="brand text-3xl">Your business account</h2><p className="mt-4 text-sm text-muted-foreground">{signedIn ? 'Your account is signed in.' : 'Sign in to your BizSathi Nepal account.'}</p></div><div className="max-w-sm space-y-3">{signedIn ? <><Button className="w-full" size="lg" onClick={() => navigate({ to: '/businesses' })}>Open businesses <ArrowUpRight /></Button><Button asChild variant="outline" className="w-full"><Link to="/security">Open security desk</Link></Button><Button variant="outline" className="w-full" onClick={async () => { await queryClient.cancelQueries(); queryClient.clear(); await supabase.auth.signOut(); setSignedIn(false); await navigate({ to: '/auth', replace: true }); }}>Sign out</Button></> : <><Button className="w-full" size="lg" disabled={busy} onClick={() => login('google')}>Continue with Google <ArrowUpRight /></Button><Button className="lovable-auth-button w-full" variant="outline" size="lg" disabled={busy} onClick={() => login('lovable')}>Continue with Lovable</Button><form className="space-y-4 border-t pt-5" onSubmit={e => { e.preventDefault(); emailLogin(); }}><h3 className="font-medium">{mode === 'recovery' ? 'Recover account' : mode === 'signup' ? 'Create account' : 'Email sign-in'}</h3><label className="block text-sm">Email<Input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>{mode !== 'recovery' && <label className="block text-sm">Password<Input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>}<Button className="w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'recovery' ? 'Send recovery link' : mode === 'signup' ? 'Create account' : 'Sign in'}</Button><div className="flex flex-wrap gap-2"><Button type="button" variant="link" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setMessage(''); }}>{mode === 'signup' ? 'Already have an account?' : 'Create account'}</Button><Button type="button" variant="link" onClick={() => { setMode(mode === 'recovery' ? 'login' : 'recovery'); setError(''); setMessage(''); }}>{mode === 'recovery' ? 'Back to sign-in' : 'Forgot password?'}</Button></div></form></>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}<p className="pt-2 text-xs text-muted-foreground">Security reviews remain restricted to active business owners and administrators.</p></div></section>
  </main>;
}