import { describe, expect, it } from 'vitest';
import { publicCloudDefines } from './public-cloud-env';

const publicEnv = { VITE_SUPABASE_URL: 'https://cloud.example.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
describe('published Cloud connection configuration', () => {
  it('injects the public URL and publishable key used by the generated browser client', () => {
    expect(publicCloudDefines(publicEnv)).toEqual({
      'import.meta.env.VITE_SUPABASE_URL': '"https://cloud.example.test"',
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"sb_publishable_test"',
    });
  });
  for (const key of Object.keys(publicEnv)) {
    it(`blocks publication when ${key} is missing`, () => {
      expect(() => publicCloudDefines({ ...publicEnv, [key]: '' })).toThrow(key);
    });
  }
  it('never injects private or unrelated environment values', () => {
    expect(Object.keys(publicCloudDefines({ ...publicEnv, SUPABASE_SERVICE_ROLE_KEY: 'private-test-value', LOVABLE_API_KEY: 'private-test-value', VITE_OTHER: 'unrelated' }))).toEqual([
      'import.meta.env.VITE_SUPABASE_URL', 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY',
    ]);
  });
});