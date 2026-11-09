import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { pageHead } from '@/lib/head';
import { PhoneOtp } from '@/components/phone-otp';
export const Route = createFileRoute('/_authenticated/profile')({ head: () => pageHead('Account profile', 'Manage your BizSathi Nepal display name, phone, and avatar.'), component: Profile });
function Profile() {
 const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [avatar, setAvatar] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
 const [verifiedMobile, setVerifiedMobile] = useState('');
 async function refreshLoginPhone() { const { data } = await supabase.auth.getUser(); setVerifiedMobile(data.user?.phone_confirmed_at ? data.user.phone ?? '' : ''); }
 useEffect(() => { void refreshLoginPhone(); }, []);
 useEffect(() => { supabase.auth.getUser().then(async ({ data }) => { if (!data.user) return; const { data: p } = await supabase.from('profiles').select('full_name,phone,avatar_url').eq('id', data.user.id).single(); if (p) { setName(p.full_name ?? ''); setPhone(p.phone ?? ''); setAvatar(p.avatar_url ?? ''); } }); }, []);
 return <main className="mx-auto max-w-xl px-6 py-12"><Button asChild variant="link"><Link to="/security">← Security desk</Link></Button><h1 className="brand my-6 text-3xl">Account profile</h1><section className="mb-8 space-y-4 border-b pb-8"><h2 className="brand text-xl">Mobile sign-in</h2><p className="break-words text-sm text-muted-foreground">{verifiedMobile ? `Verified login mobile: +${verifiedMobile.replace(/^\+/, '')}` : 'No verified login mobile'}</p><PhoneOtp mode="link" onVerified={refreshLoginPhone} /></section><form className="space-y-5" onSubmit={async e => { e.preventDefault(); setBusy(true); const { data } = await supabase.auth.getUser(); if (!data.user) { setBusy(false); return; } const { error } = await supabase.from('profiles').update({ full_name: name, phone, avatar_url: avatar || null }).eq('id', data.user.id); setMessage(error ? 'Profile could not be saved.' : 'Profile saved.'); setBusy(false); }}><label className="block text-sm">Display name<Input className="mt-2" value={name} maxLength={200} onChange={e => setName(e.target.value)} /></label><label className="block text-sm">Contact phone<Input className="mt-2" value={phone} maxLength={30} onChange={e => setPhone(e.target.value)} /></label><label className="block text-sm">Avatar URL<Input className="mt-2" type="url" pattern="https://.*" maxLength={1000} value={avatar} onChange={e => setAvatar(e.target.value)} /></label><Button disabled={busy}>Save profile</Button><p role="status" className="text-sm">{message}</p></form></main>;
}