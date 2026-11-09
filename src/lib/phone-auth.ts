import { supabase } from '@/integrations/supabase/client';

export function normalizeLoginPhone(value: string): string {
  const trimmed = value.trim();
  if (!/^[+\d\s()-]+$/.test(trimmed)) throw new Error('Enter a valid mobile number.');
  const phone = trimmed.replace(/[\s()-]/g, '');
  if (/^9[78]\d{8}$/.test(phone)) return `+977${phone}`;
  if (/^(?:\+977|977)9[78]\d{8}$/.test(phone)) return phone.startsWith('+') ? phone : `+${phone}`;
  if (/^\+[1-9]\d{7,14}$/.test(phone) && !phone.startsWith('+977')) return phone;
  throw new Error('Enter a Nepal mobile number or an international number with its country code.');
}

export function phoneAuthError(error: unknown): string {
  const e = error as { code?: string; status?: number; message?: string } | undefined;
  if (e?.status === 429 || e?.code?.includes('rate_limit')) return 'Too many requests. Please wait before trying again.';
  if (e?.code === 'otp_expired' || e?.code === 'otp_disabled') return 'The code is invalid or expired. Try again or request a new code.';
  if (/provider|sms|phone.*disabled|unsupported|configuration|template/i.test(e?.message ?? '')) return 'SMS verification is unavailable. Ask the account administrator to check Phone settings.';
  return 'Verification could not be completed. Check your number or code and try again.';
}

export async function requestPhoneCode(value: string, mode: 'login' | 'link', resend = false) {
  const phone = normalizeLoginPhone(value);
  if (mode === 'link') {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error('Sign in again before verifying your mobile number.');
    const result = resend
      ? await supabase.auth.resend({ phone, type: 'phone_change' })
      : await supabase.auth.updateUser({ phone });
    if (result.error) throw result.error;
  } else {
    const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
    if (error) throw error;
  }
  return phone;
}

export async function verifyPhoneCode(phone: string, token: string, mode: 'login' | 'link') {
  if (!/^\d{6,8}$/.test(token.trim())) throw new Error('Enter the code from your SMS.');
  const before = mode === 'link' ? await supabase.auth.getUser() : null;
  if (mode === 'link' && (before?.error || !before?.data.user)) throw new Error('Sign in again.');
  const { error } = await supabase.auth.verifyOtp({ phone: normalizeLoginPhone(phone), token: token.trim(), type: mode === 'link' ? 'phone_change' : 'sms' });
  if (error) throw error;
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) throw new Error('Sign-in could not be verified.');
  if (mode === 'link' && (data.user.id !== before?.data.user?.id || `+${data.user.phone?.replace(/^\+/, '')}` !== normalizeLoginPhone(phone) || !data.user.phone_confirmed_at)) {
    throw new Error('Mobile verification has not completed.');
  }
  return data.user;
}