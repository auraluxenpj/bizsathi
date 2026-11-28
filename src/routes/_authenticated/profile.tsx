import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera, CheckCircle2, KeyRound, Mail, ShieldCheck, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { pageHead } from '@/lib/head';
import { ScreenLockSettings } from '@/components/screen-lock';
import { compressImageToWebp } from '@/lib/image-compression';

export const Route = createFileRoute('/_authenticated/profile')({
  head: () => pageHead('Account profile', 'Manage your Auralink account profile and login security.'),
  component: Profile,
});

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_SOURCE_BYTES = 15 * 1024 * 1024;
const allowedAvatarTypes = ['image/jpeg', 'image/png', 'image/webp'];

function Profile() {
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [createdAt, setCreatedAt] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarPath, setAvatarPath] = useState('');
  const [originalAvatarPath, setOriginalAvatarPath] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        if (active) { setProfileMessage('Your session could not be verified. Please sign in again.'); setLoading(false); }
        return;
      }
      const user = authData.user;
      const { data: profile, error } = await supabase.from('profiles')
        .select('full_name, phone, avatar_url')
        .eq('id', user.id)
        .single();
      if (!active) return;
      setUserId(user.id);
      setEmail(user.email ?? '');
      setEmailVerified(Boolean(user.email_confirmed_at));
      setCreatedAt(user.created_at);
      setName(profile?.full_name ?? String(user.user_metadata?.['full_name'] ?? ''));
      setPhone(profile?.phone ?? '');
      const storedAvatar = profile?.avatar_url ?? '';
      setAvatarPath(storedAvatar && !storedAvatar.startsWith('http') ? storedAvatar : '');
      setOriginalAvatarPath(storedAvatar && !storedAvatar.startsWith('http') ? storedAvatar : '');
      if (storedAvatar.startsWith('http')) setAvatarUrl(storedAvatar);
      else if (storedAvatar) {
        const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(storedAvatar, 60 * 60);
        if (active) setAvatarUrl(data?.signedUrl ?? '');
      }
      if (error && error.code !== 'PGRST116') setProfileMessage('Some profile details could not be loaded.');
      if (active) setLoading(false);
    }
    void loadProfile();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (avatarUrl.startsWith('blob:')) return () => URL.revokeObjectURL(avatarUrl);
    return undefined;
  }, [avatarUrl]);

  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!allowedAvatarTypes.includes(file.type)) {
      setProfileMessage('Choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_AVATAR_SOURCE_BYTES) {
      setProfileMessage('Choose a profile photo smaller than 15 MB. It will be converted to WebP under 512 KB.');
      return;
    }
    setAvatarFile(file);
    setAvatarUrl(URL.createObjectURL(file));
    setProfileMessage('Photo selected. Save your profile to upload it.');
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;
    setProfileBusy(true);
    setProfileMessage('');
    let uploadedPath = '';
    let profileSaved = false;
    try {
      if (avatarFile) {
        const webp = await compressImageToWebp(avatarFile);
        uploadedPath = `${userId}/${crypto.randomUUID()}.webp`;
        const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET)
          .upload(uploadedPath, webp, { contentType: 'image/webp', upsert: false });
        if (uploadError) throw uploadError;
      }
      const nextAvatar = uploadedPath || avatarPath || null;
      const { error: profileError } = await supabase.from('profiles')
        .update({ full_name: name.trim(), phone: phone.trim() || null, avatar_url: nextAvatar })
        .eq('id', userId);
      if (profileError) throw profileError;
      profileSaved = true;
      const { error: metadataError } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
      if (metadataError) throw metadataError;
      if (originalAvatarPath && originalAvatarPath !== nextAvatar) {
        await supabase.storage.from(AVATAR_BUCKET).remove([originalAvatarPath]);
      }
      if (uploadedPath) {
        const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(uploadedPath, 60 * 60);
        setAvatarUrl(data?.signedUrl ?? '');
        setAvatarPath(uploadedPath);
        setOriginalAvatarPath(uploadedPath);
        setAvatarFile(null);
      }
      setProfileMessage('Profile saved successfully.');
    } catch (error) {
      if (uploadedPath && !profileSaved) await supabase.storage.from(AVATAR_BUCKET).remove([uploadedPath]);
      setProfileMessage(error instanceof Error ? error.message : 'Profile could not be saved. Please try again.');
    } finally {
      setProfileBusy(false);
    }
  }

  async function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newEmail.trim() || newEmail.trim().toLowerCase() === email.toLowerCase()) {
      setEmailMessage('Enter a different email address.');
      return;
    }
    setEmailBusy(true);
    setEmailMessage('');
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailMessage(error ? error.message : 'Verification link sent. Confirm the new email address to complete the change.');
    if (!error) setNewEmail('');
    setEmailBusy(false);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) { setPasswordMessage('Use at least 8 characters.'); return; }
    if (password !== confirmPassword) { setPasswordMessage('The passwords do not match.'); return; }
    setPasswordBusy(true);
    setPasswordMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    setPasswordMessage(error ? error.message : 'Password updated successfully.');
    if (!error) { setPassword(''); setConfirmPassword(''); }
    setPasswordBusy(false);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <Button asChild variant="link" className="mb-4 px-0"><Link to="/security">← Security desk</Link></Button>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Account settings</p>
        <h1 className="brand mt-2 text-3xl font-semibold sm:text-4xl">Profile & security</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manage your personal details and protect your Auralink sign-in.</p>
      </div>

      {loading ? <p role="status" className="py-10 text-sm text-muted-foreground">Loading account details…</p> : (
        <div className="space-y-7">
          <section className="rounded-xl border bg-card p-5 sm:p-7">
            <div className="mb-6 flex items-center gap-3"><UserRound className="size-5 text-primary" /><div><h2 className="font-semibold">Personal profile</h2><p className="text-sm text-muted-foreground">Your photo and contact details.</p></div></div>
            <form className="space-y-5" onSubmit={saveProfile}>
              <div className="flex flex-wrap items-center gap-5">
                <div className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                  {avatarUrl ? <img src={avatarUrl} alt="Profile" className="size-full object-cover" /> : <UserRound className="size-10 text-muted-foreground" />}
                  {avatarUrl && <button type="button" aria-label="Remove selected profile photo" className="absolute right-0 top-0 rounded-full bg-background/90 p-1 shadow" onClick={() => { setAvatarUrl(''); setAvatarFile(null); setAvatarPath(''); }}><X className="size-3" /></button>}
                </div>
                <div className="space-y-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">
                    <Camera className="size-4" /> Upload photo
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={chooseAvatar} />
                  </label>
                  <p className="text-xs text-muted-foreground">JPG, PNG or WebP · Automatically converted to WebP (max 512 KB)</p>
                </div>
              </div>
              <label className="block text-sm font-medium">Display name<Input className="mt-2 h-11" value={name} maxLength={100} required onChange={e => setName(e.target.value)} /></label>
              <label className="block text-sm font-medium">Phone number<Input className="mt-2 h-11" type="tel" value={phone} maxLength={30} onChange={e => setPhone(e.target.value)} placeholder="Enter phone number" /></label>
              <Button disabled={profileBusy}>{profileBusy ? 'Saving…' : 'Save profile'}</Button>
              {profileMessage && <p role="status" className="text-sm text-muted-foreground">{profileMessage}</p>}
            </form>
          </section>

          <section className="rounded-xl border bg-card p-5 sm:p-7">
            <div className="mb-5 flex items-center gap-3"><Mail className="size-5 text-primary" /><div><h2 className="font-semibold">Email address</h2><p className="text-sm text-muted-foreground">Your email is used for account recovery and sign-in where supported.</p></div></div>
            <div className="mb-4 flex flex-wrap items-center gap-2"><p className="font-medium">{email || 'No email address linked'}</p><span className={emailVerified ? 'inline-flex items-center gap-1 text-xs text-emerald-700' : 'text-xs text-amber-700'}>{emailVerified ? <><CheckCircle2 className="size-3" /> Verified</> : 'Not verified'}</span></div>
            <form className="space-y-3" onSubmit={changeEmail}>
              <label className="block text-sm font-medium">Change email address<Input className="mt-2 h-11" type="email" autoComplete="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@email.com" /></label>
              <Button variant="outline" disabled={emailBusy}>{emailBusy ? 'Sending…' : 'Send verification link'}</Button>
              {emailMessage && <p role="status" className="text-sm text-muted-foreground">{emailMessage}</p>}
            </form>
          </section>

          <section className="rounded-xl border bg-card p-5 sm:p-7">
            <div className="mb-5 flex items-center gap-3"><KeyRound className="size-5 text-primary" /><div><h2 className="font-semibold">Change password</h2><p className="text-sm text-muted-foreground">Choose a strong password with at least 8 characters.</p></div></div>
            <form className="space-y-3" onSubmit={changePassword}>
              <label className="block text-sm font-medium">New password<Input className="mt-2 h-11" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>
              <label className="block text-sm font-medium">Confirm new password<Input className="mt-2 h-11" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>
              <Button variant="outline" disabled={passwordBusy}>{passwordBusy ? 'Updating…' : 'Update password'}</Button>
              {passwordMessage && <p role="status" className="text-sm text-muted-foreground">{passwordMessage}</p>}
            </form>
          </section>

          <ScreenLockSettings />

          <section className="rounded-xl border bg-card p-5 sm:p-7">
            <div className="mb-4 flex items-center gap-3"><ShieldCheck className="size-5 text-primary" /><div><h2 className="font-semibold">Account information</h2><p className="text-sm text-muted-foreground">Read-only identity and account status.</p></div></div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Account ID</dt><dd className="mt-1 break-all font-mono text-xs">{userId}</dd></div>
              <div><dt className="text-muted-foreground">Account status</dt><dd className="mt-1 font-medium text-emerald-700">Active session</dd></div>
              <div><dt className="text-muted-foreground">Account created</dt><dd className="mt-1 font-medium">{createdAt ? new Date(createdAt).toLocaleDateString() : 'Not available'}</dd></div>
            </dl>
            <p className="mt-5 text-xs text-muted-foreground">Profile changes do not modify your platform ownership, business ownership, employee position or permissions.</p>
          </section>
        </div>
      )}
    </main>
  );
}
