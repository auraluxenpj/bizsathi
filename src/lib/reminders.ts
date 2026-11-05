import { formatNPR } from './format';

/** Nepal mobile numbers to international digits for wa.me, or null if it does not look like a phone number. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2);
  if (/^9\d{9}$/.test(d)) return `977${d}`;
  return /^\d{10,15}$/.test(d) ? d : null;
}

export function reminderMessage(name: string, business: string, amount: number): string {
  return `Namaste ${name}, this is a gentle reminder from ${business}: ${formatNPR(amount)} is pending. Please pay when convenient. Thank you.`;
}
export function whatsappLink(phone: string, message: string): string | null {
  const n = normalizePhone(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null;
}
export const smsLink = (phone: string, message: string) => `sms:${phone.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(message)}`;
