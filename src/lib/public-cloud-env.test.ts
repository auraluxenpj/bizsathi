import { describe, expect, it } from 'vitest';
import { publicCloudDefines } from '../../lib/public-cloud-env';

describe('public Cloud build configuration', () => {
  it('includes both browser connection values', () => {
    expect(publicCloudDefines({ VITE_SUPABASE_URL: 'https://example.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }, true)).toEqual({
      'import.meta.env.VITE_SUPABASE_URL': '"https://example.test"',
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"sb_publishable_test"',
    });
  });
  it('rejects a production build with a missing URL or publishable key', () => {
    expect(() => publicCloudDefines({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }, true)).toThrow('VITE_SUPABASE_URL');
    expect(() => publicCloudDefines({ VITE_SUPABASE_URL: 'https://example.test' }, true)).toThrow('VITE_SUPABASE_PUBLISHABLE_KEY');
  });
  it('never exposes server credentials or uses a server-only URL', () => {
    const env = { VITE_SUPABASE_URL: 'https://example.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_URL: 'http://private.test', SUPABASE_SERVICE_ROLE_KEY: 'private-test-secret' };
    expect(JSON.stringify(publicCloudDefines(env, true))).not.toContain('private');
    expect(() => publicCloudDefines({ SUPABASE_URL: env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY }, true)).toThrow('VITE_SUPABASE_URL');
  });
});