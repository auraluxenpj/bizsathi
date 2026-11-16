import { describe, expect, it } from 'vitest';
import { bucketKey, clientIp, IP_FAILURE_LIMIT, MOBILE_FAILURE_LIMIT } from './login-throttle';
const h = (m: Record<string, string>) => ({ get: (n: string) => m[n] ?? null });
describe('Login throttle helpers', () => {
  it('hashes buckets to 64 hex chars and never contains the raw value', async () => {
    const k = await bucketKey('mobile', '9841000001');
    expect(k).toMatch(/^[a-f0-9]{64}$/); expect(k).not.toContain('9841000001');
  });
  it('separates mobile and IP buckets for the same text', async () => expect(await bucketKey('mobile', 'x')).not.toBe(await bucketKey('ip', 'x')));
  it('is deterministic', async () => expect(await bucketKey('ip', '1.2.3.4')).toBe(await bucketKey('ip', '1.2.3.4')));
  it('prefers platform headers over X-Forwarded-For', () => {
    expect(clientIp(h({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.1.1.1');
    expect(clientIp(h({ 'x-forwarded-for': '2.2.2.2, 3.3.3.3' }))).toBe('2.2.2.2');
    expect(clientIp(h({}))).toBe('unknown');
  });
  it('mobile limit is stricter than the IP limit', () => expect(MOBILE_FAILURE_LIMIT).toBeLessThan(IP_FAILURE_LIMIT));
});
