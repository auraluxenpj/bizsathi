import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { acceptTeamInvitation, previewTeamInvitation } from '@/lib/team-access.functions';
import { supabase } from '@/integrations/supabase/client';
import { pageHead } from '@/lib/head';

export const Route = createFileRoute('/join')({
  head: () => pageHead('Join team', 'Accept your BizSathi Nepal team invitation.'),
  component: Join,
});

function Join() {
  const navigate = useNavigate();
  const previewFn = useServerFn(previewTeamInvitation);
  const acceptFn = useServerFn(acceptTeamInvitation);

  const [token, setToken] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState<{
    businessName: string;
    branchName: string;
    roleName: string;
    jobTitle: string | null;
    inviterName: string;
    seatsLeft: number;
  } | null>(null);

  useEffect(() => {
    const hashToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
    const stored = sessionStorage.getItem('bizsathi-team-token');
    const activeToken = hashToken || stored || '';

    if (hashToken) {
      sessionStorage.setItem('bizsathi-team-token', hashToken);
      history.replaceState(null, '', '/join');
    }

    setToken(activeToken);

    if (activeToken) {
      previewFn({ data: { token: activeToken } })
        .then((res) => {
          if (res.invitation) setDetails(res.invitation);
          else setMessage('This invitation link is invalid or has expired.');
        })
        .catch(() => setMessage('Could not verify invitation.'));
    }

    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, [previewFn]);

  const handleAccept = async () => {
    if (!token) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await acceptFn({ data: { token } });
      sessionStorage.removeItem('bizsathi-team-token');
      setMessage('Invitation accepted! Redirecting...');
      setTimeout(() => navigate({ to: '/businesses' }), 1200);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Invitation could not be accepted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="brand text-3xl">BizSathi Nepal</h1>
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Team Invitation</CardTitle>
          <CardDescription>
            {details
              ? `You are invited to join ${details.businessName} (${details.branchName}) as ${details.roleName}.`
              : 'Open your invitation link to join the business.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {details && (
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <p><strong>Invited by:</strong> {details.inviterName}</p>
              {details.jobTitle && <p><strong>Position:</strong> {details.jobTitle.replace('_', ' ')}</p>}
              <p><strong>Remaining uses:</strong> {details.seatsLeft}</p>
            </div>
          )}

          {signedIn ? (
            <Button className="w-full" disabled={busy || !token || !details} onClick={handleAccept}>
              {busy ? 'Accepting…' : 'Accept & Join'}
            </Button>
          ) : (
            <Button asChild className="w-full">
              <Link to="/auth">Sign in or verify mobile to accept</Link>
            </Button>
          )}

          {message && <p role="status" className="text-sm text-center text-muted-foreground">{message}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
