import { describe, expect, it } from 'vitest';
import { publicCloudDefines } from './public-cloud-env';

describe('publicCloudDefines', () => {
  it('exposes only the public Supabase connection values', () => {
    expect(publicCloudDefines({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      SECRET_KEY: 'must-not-be-exposed',
    })).toEqual({
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://example.supabase.co'),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_example'),
    });
  });

  it('fails clearly when a required public value is missing', () => {
    expect(() => publicCloudDefines({ VITE_SUPABASE_URL: 'https://example.supabase.co' }))
      .toThrow('Missing public Cloud build configuration: VITE_SUPABASE_PUBLISHABLE_KEY');
  });
});
