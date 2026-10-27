import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { acceptInvitation } from '@/lib/business.functions';
import { supabase } from '@/integrations/supabase/client';
import { pageHead } from '@/lib/head';
export const Route = createFileRoute('/invite')({ head: () => pageHead('Accept staff invitation', 'Accept your email-bound BizSathi Nepal business invitation.'), component: Invite });
function Invite() {
 const accept = useServerFn(acceptInvitation); const [token, setToken] = useState(''); const [signedIn, setSignedIn] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
 useEffect(() => { const value = new URLSearchParams(window.location.hash.slice(1)).get('token'); if (value) { sessionStorage.setItem('bizsathi-invite', value); history.replaceState(null, '', '/invite'); } setToken(value || sessionStorage.getItem('bizsathi-invite') || ''); supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user))); }, []);
 return <main className="mx-auto max-w-lg px-6 py-16"><h1 className="brand text-3xl">BizSathi Nepal</h1><h2 className="mt-8 text-xl">Staff invitation</h2><p className="my-5 text-sm text-muted-foreground">Use the verified email account named in your invitation.</p>{signedIn ? <Button disabled={busy || !token} onClick={async () => { setBusy(true); try { await accept({ data: { token } }); sessionStorage.removeItem('bizsathi-invite'); setToken(''); setMessage('Invitation accepted.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Invitation could not be accepted.'); } finally { setBusy(false); } }}>{busy ? 'Accepting…' : 'Accept invitation'}</Button> : <Button asChild><Link to="/auth">Sign in or create account</Link></Button>}<p role="status" className="my-5 text-sm">{message || (!token ? 'No invitation link is available.' : '')}</p><Button asChild variant="link"><Link to="/businesses">Open businesses</Link></Button></main>;
}