import { isEmailLoginIdentifier, normalizeVerifiedNepalMobile } from './login-identifier';

export function validateSignup(input: { fullName: string; email: string; mobile: string }) {
  if (input.fullName.trim().length < 2 || input.fullName.trim().length > 120) throw new Error('Enter your full name (2–120 characters).');
  if (!isEmailLoginIdentifier(input.email)) throw new Error('Enter a valid email address.');
  const mobile = normalizeVerifiedNepalMobile(input.mobile);
  if (!mobile) throw new Error('Enter a Nepal mobile number beginning with 97 or 98, with optional +977 country code.');
  return { full_name: input.fullName.trim(), email: input.email.trim().toLowerCase(), mobile: `+977${mobile}` };
}

export function verifiedContact(user: { id: string; email_confirmed_at?: string; phone?: string; phone_confirmed_at?: string } | null, userId: string, phone: string) {
  return Boolean(user && user.id === userId && user.email_confirmed_at && user.phone_confirmed_at && normalizeVerifiedNepalMobile(user.phone ?? '') === normalizeVerifiedNepalMobile(phone) && normalizeVerifiedNepalMobile(phone));
}