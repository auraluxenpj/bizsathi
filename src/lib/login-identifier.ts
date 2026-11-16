import { z } from 'zod';

export const isEmailLoginIdentifier = (value: string) =>
  z.string().trim().email().safeParse(value).success;

/** Accept Nepal mobile input with optional +977 / 977 prefix and common separators. */
export function normalizeLoginMobile(value: string): string | null {
  const digits = value.trim().replace(/[\s()-]/g, '').replace(/^\+?977(?=\d{10}$)/, '');
  return /^\d{10}$/.test(digits) ? digits : null;
}

export function classifyLoginIdentifier(value: string):
  | { type: 'email'; value: string }
  | { type: 'mobile'; value: string }
  | { type: 'employee'; value: string }
  | null {
  const trimmed = value.trim();
  if (isEmailLoginIdentifier(trimmed)) return { type: 'email', value: trimmed.toLowerCase() };
  if (/^AL\d{4,}$/i.test(trimmed)) return { type: 'employee', value: trimmed.toUpperCase() };
  const mobile = normalizeLoginMobile(trimmed);
  return mobile ? { type: 'mobile', value: mobile } : null;
}

/** Return a Nepal mobile accepted by the membership verification policy. */
export function normalizeVerifiedNepalMobile(value: string): string | null {
  const mobile = normalizeLoginMobile(value);
  return mobile && /^9[78]\d{8}$/.test(mobile) ? mobile : null;
}
