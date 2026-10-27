import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { lovable } from '@/integrations/lovable';
import { supabase } from '@/integrations/supabase/client';
import kathmandu from '@/assets/kathmandu.jpg';
import '@lovable.dev/cloud-auth-js/styles.css';

export function SignIn() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user))); }, []);
  async function login(provider: 'google' | 'lovable') {
    setBusy(true); setError('');
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: `${window.location.origin}/auth` });
      if (result.error) throw result.error;
      if (result.redirected) return;
      const { data } = await supabase.auth.getUser();
      if (data.user) await navigate({ to: '/security' });
    } catch { setError('Sign-in could not be completed. Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-background">
    <header className="flex items-center justify-between border-b px-6 py-5 md:px-12"><span className="brand text-xl font-semibold">bizsathi<span className="text-primary">.</span> <span className="text-xs font-normal text-muted-foreground">NEPAL</span></span><span className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> Administrator workspace</span></header>
    <section className="relative isolate flex min-h-[460px] items-end overflow-hidden bg-primary px-6 py-12 md:px-12">
      <img src={kathmandu} alt="Kathmandu rooftops with the Himalayas beyond" width={1536} height={1024} className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-hero-scrim" />
      <div className="max-w-3xl text-primary-foreground"><p className="mb-4 text-sm">SECURITY & GOVERNANCE</p><h1 className="brand text-5xl font-medium md:text-6xl">BizSathi Nepal</h1><p className="mt-5 max-w-lg text-lg">Security reviews. Clear decisions. A stronger business.</p></div>
    </section>
    <section className="mx-auto grid max-w-6xl gap-8 px-6 py-10 md:grid-cols-2 md:px-12"><div><p className="mb-3 text-xs font-semibold text-primary">ADMINISTRATOR ACCESS</p><h2 className="brand text-3xl">Your security review desk</h2><p className="mt-4 text-sm text-muted-foreground">{signedIn ? 'Your account is signed in.' : 'Sign in with your business administrator account.'}</p></div><div className="max-w-sm space-y-3">{signedIn ? <><Button className="w-full" size="lg" onClick={() => navigate({ to: '/security' })}>Open security desk <ArrowUpRight /></Button><Button variant="outline" className="w-full" onClick={async () => { const { QueryClient } = await import('@tanstack/react-query'); void QueryClient; await supabase.auth.signOut(); setSignedIn(false); }}>Sign out</Button></> : <><Button className="w-full" size="lg" disabled={busy} onClick={() => login('google')}>Continue with Google <ArrowUpRight /></Button><Button className="lovable-auth-button w-full" variant="outline" size="lg" disabled={busy} onClick={() => login('lovable')}>Continue with Lovable</Button></>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<p className="pt-2 text-xs text-muted-foreground">Access is restricted to active business owners and administrators.</p></div></section>
  </main>;
}