import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { acceptTeamInvitation, previewTeamInvitation } from '@/lib/team-access.functions';
import { normalizeLoginMobile, normalizeVerifiedNepalMobile } from '@/lib/login-identifier';
import { supabase } from '@/integrations/supabase/client';
import { pageHead } from '@/lib/head';

export const Route = createFileRoute('/join')({
  head: () => pageHead('Join team', 'Accept your BizSathi Nepal team invitation.'),
  component: Join,
});

export function Join() {
  const navigate = useNavigate();
  const previewFn = useServerFn(previewTeamInvitation);
  const acceptFn = useServerFn(acceptTeamInvitation);

  const [token, setToken] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [currentPhone, setCurrentPhone] = useState('');
  const [currentPhoneConfirmed, setCurrentPhoneConfirmed] = useState(false);
  const [mobile, setMobile] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');\n  const [assignedEmployeeId, setAssignedEmployeeId] = useState('');\n  const [assignedEmployeeId, setAssignedEmployeeId] = useState('');
  const [details, setDetails] = useState<{
    businessName: string;
    branchName: string;
    roleName: string;
    jobTitle: string | null;
    inviterName: string;
    expiresAt: string;
    seatsLeft: number;
    inviteeMobileMasked: string | null;
    inviteeEmailMasked: string | null;
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

    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      setSignedIn(Boolean(user));
      setEmailConfirmed(Boolean(user?.email_confirmed_at));
      setCurrentPhone(user?.phone ?? '');
      setCurrentPhoneConfirmed(Boolean(user?.phone_confirmed_at));
      const signupMobile = typeof user?.user_metadata?.mobile === 'string' ? user.user_metadata.mobile : '';
      if (signupMobile) setMobile(signupMobile);
    });
  }, [previewFn]);

  const normalizedMobile = normalizeVerifiedNepalMobile(mobile);
  const validNepalMobile = Boolean(normalizedMobile);

  const sendPhoneCode = async () => {
    if (!validNepalMobile || !normalizedMobile) {
      setMessage('Enter the Nepal mobile number that received this invitation.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      if (currentPhoneConfirmed && normalizeLoginMobile(currentPhone) === normalizedMobile) {
        setPhoneVerified(true);
        setPendingPhone('');
        setMessage('Your invited mobile number is already verified.');
        return;
      }
      const e164 = `+977${normalizedMobile}`;
      const { error } = await supabase.auth.updateUser({ phone: e164 });
      if (error) throw error;
      setPendingPhone(e164);
      setPhoneVerified(false);
      setOtp('');
      setMessage('A verification code has been sent by SMS. Enter it below to confirm this mobile number.');
    } catch {
      setMessage('The verification code could not be sent. Check the mobile number or try again later.');
    } finally {
      setBusy(false);
    }
  };

  const verifyPhoneCode = async () => {
    if (!pendingPhone || !/^\d{6,8}$/.test(otp.trim())) {
      setMessage('Enter the SMS verification code.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: pendingPhone,
        token: otp.trim(),
        type: 'phone_change',
      });
      if (error) throw error;
      setCurrentPhone(pendingPhone);
      setCurrentPhoneConfirmed(true);
      setPhoneVerified(true);
      setPendingPhone('');
      setMessage('Mobile number verified. You can now accept the invitation.');
    } catch {
      setMessage('That verification code is invalid or expired. Request a new code and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!token || !phoneVerified) return;
    setBusy(true);
    setMessage('');
    try {
      await acceptFn({ data: { token } });
      sessionStorage.removeItem('bizsathi-team-token');
      setMessage('Invitation accepted! Redirecting...');
      setTimeout(() => navigate({ to: '/businesses' }), 1200);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Invitation could not be accepted. Confirm the invited mobile number matches this account.');
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
              <p><strong>Invited email:</strong> {details.inviteeEmailMasked || 'Not available'}</p>
              <p><strong>Invited mobile:</strong> {details.inviteeMobileMasked || 'Not available'}</p>
              <p><strong>Remaining uses:</strong> {details.seatsLeft}</p>
            </div>
          )}

          {!signedIn ? (
            <Button asChild className="w-full">
              <Link to="/auth">Sign in or create account</Link>
            </Button>
          ) : !emailConfirmed ? (
            <p role="status" className="text-sm text-muted-foreground">
              Confirm your email address first. Open the confirmation email, then return to this invitation.
            </p>
          ) : (
            <>
              <label className="block text-sm">Invited Nepal mobile number
                <input
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="98XXXXXXXX"
                  value={mobile}
                  onChange={(e) => { setMobile(e.target.value); setPhoneVerified(false); }}
                />
              </label>
              {!phoneVerified && !pendingPhone && (
                <Button className="w-full" disabled={busy || !details || !validNepalMobile} onClick={sendPhoneCode}>
                  {busy ? 'Please wait…' : currentPhoneConfirmed ? 'Check invited mobile number' : 'Send mobile verification code'}
                </Button>
              )}
              {pendingPhone && (
                <>
                  <label className="block text-sm">SMS verification code
                    <input
                      className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    />
                  </label>
                  <Button className="w-full" disabled={busy || !otp.trim()} onClick={verifyPhoneCode}>
                    {busy ? 'Verifying…' : 'Verify mobile number'}
                  </Button>
                </>
              )}
              {phoneVerified && (
                <p className="text-sm text-emerald-700">Mobile verified. The server will confirm it matches the invitation before adding you.</p>
              )}
              <Button className="w-full" disabled={busy || !token || !details || !phoneVerified} onClick={handleAccept}>
                {busy ? 'Accepting…' : 'Accept & Join'}
              </Button>
            </>
          )}

          {assignedEmployeeId && <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-center"><p className="text-xs text-muted-foreground">Your Employee ID</p><p className="mt-1 font-mono text-xl font-semibold tracking-wider">{assignedEmployeeId}</p><p className="mt-1 text-xs text-muted-foreground">Use this ID with your password for future sign-in.</p></div>}\n          {message && <p role="status" className="text-sm text-center text-muted-foreground">{message}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
