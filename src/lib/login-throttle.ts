// Pure helpers for the mobile sign-in throttle (no secrets, easy to test).
export const MOBILE_FAILURE_LIMIT = 5;   // wrong attempts per mobile number
export const IP_FAILURE_LIMIT = 30;      // wrong attempts per caller IP (shared offices/mobile networks need headroom)
export const THROTTLE_WINDOW_SECONDS = 900; // 15 minutes

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export async function bucketKey(kind: 'mobile' | 'ip', value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${kind}:${value}`))));
}
/** Best-effort caller IP from proxy headers (platform-set headers first, then the first X-Forwarded-For hop). */
export function clientIp(headers: { get(name: string): string | null }): string {
  const direct = headers.get('cf-connecting-ip') ?? headers.get('x-real-ip');
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (direct ?? forwarded ?? 'unknown').slice(0, 64);
}
