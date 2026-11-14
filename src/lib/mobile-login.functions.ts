import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

// Mobile + password sign-in. The browser never learns which email belongs to a mobile number:
// the server finds the account, checks the password, and hands back only the session tokens.
const input = z.object({ mobile: z.string().min(10).max(40), password: z.string().min(8).max(128) });
const GENERIC = 'Mobile number or password is incorrect.';

export const signInWithMobile = createServerFn({ method: 'POST' }).inputValidator(input).handler(async ({ data }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { createClient } = await import('@supabase/supabase-js');
  const found = await supabaseAdmin.rpc('login_email_for_mobile' as never, { _mobile: data.mobile } as never);
  const email = found.data as unknown as string | null;
  const url = process.env['SUPABASE_URL']; const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (found.error || !email || !url || !key) throw new Error(GENERIC);
  const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error } = await anon.auth.signInWithPassword({ email, password: data.password });
  if (error || !s.session) throw new Error(GENERIC);
  return { access_token: s.session.access_token, refresh_token: s.session.refresh_token };
});
