import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { normalizeLoginMobile } from './login-identifier';
import { bucketKey, clientIp, IP_FAILURE_LIMIT, MOBILE_FAILURE_LIMIT, THROTTLE_WINDOW_SECONDS } from './login-throttle';

// Mobile + password sign-in. The browser never learns which email belongs to a mobile number:
// the server finds the account, checks the password, and hands back only the session tokens.
// Hardening: failed attempts are throttled per mobile number and per IP (counted for unknown numbers too),
// and an unknown number still performs a sign-in call so response timing does not reveal whether it is registered.
const input = z.object({ mobile: z.string().min(10).max(40), password: z.string().min(8).max(128) });
const GENERIC = 'Mobile number or password is incorrect.';
const BLOCKED = 'Too many attempts. Please wait 15 minutes and try again.';
const NO_ACCOUNT_EMAIL = 'no-such-account@bizsathi.invalid';

export const signInWithMobile = createServerFn({ method: 'POST' }).inputValidator(input).handler(async ({ data }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env['SUPABASE_URL']; const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error(GENERIC);

  const mobile = normalizeLoginMobile(data.mobile);
  const ipBucket = await bucketKey('ip', clientIp(getRequest().headers));
  const mobileBucket = await bucketKey('mobile', mobile ?? 'invalid');
  const db = supabaseAdmin as unknown as { rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> };

  const [byMobile, byIp] = await Promise.all([
    db.rpc('login_throttle_blocked', { _bucket: mobileBucket, _max: MOBILE_FAILURE_LIMIT, _window_seconds: THROTTLE_WINDOW_SECONDS }),
    db.rpc('login_throttle_blocked', { _bucket: ipBucket, _max: IP_FAILURE_LIMIT, _window_seconds: THROTTLE_WINDOW_SECONDS }),
  ]);
  if (byMobile.data === true || byIp.data === true) throw new Error(BLOCKED);

  const found = mobile ? await db.rpc('login_email_for_mobile', { _mobile: mobile }) : { data: null, error: null };
  const email = typeof found.data === 'string' && !found.error ? found.data : null;
  const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error } = await anon.auth.signInWithPassword({ email: email ?? NO_ACCOUNT_EMAIL, password: data.password });

  if (!email || error || !s.session) {
    await Promise.all([db.rpc('login_record_failure', { _bucket: mobileBucket }), db.rpc('login_record_failure', { _bucket: ipBucket })]);
    throw new Error(GENERIC);
  }
  await db.rpc('login_clear_failures', { _bucket: mobileBucket });
  return { access_token: s.session.access_token, refresh_token: s.session.refresh_token };
});


const employeeInput = z.object({ employeeId: z.string().min(6).max(20), password: z.string().min(8).max(128) });

export const signInWithEmployeeId = createServerFn({ method: 'POST' }).inputValidator(employeeInput).handler(async ({ data }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env['SUPABASE_URL']; const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Employee ID or password is incorrect.');

  const employeeId = data.employeeId.trim().toUpperCase();
  const ipBucket = await bucketKey('ip', clientIp(getRequest().headers));
  const employeeBucket = await bucketKey('employee', employeeId);
  const db = supabaseAdmin as unknown as { rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> };

  const [byEmployee, byIp] = await Promise.all([
    db.rpc('login_throttle_blocked', { _bucket: employeeBucket, _max: MOBILE_FAILURE_LIMIT, _window_seconds: THROTTLE_WINDOW_SECONDS }),
    db.rpc('login_throttle_blocked', { _bucket: ipBucket, _max: IP_FAILURE_LIMIT, _window_seconds: THROTTLE_WINDOW_SECONDS }),
  ]);
  if (byEmployee.data === true || byIp.data === true) throw new Error(BLOCKED);

  const found = await db.rpc('login_email_for_employee_id', { _employee_id: employeeId });
  const email = typeof found.data === 'string' && !found.error ? found.data : null;
  const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error } = await anon.auth.signInWithPassword({ email: email ?? NO_ACCOUNT_EMAIL, password: data.password });

  if (!email || error || !s.session) {
    await Promise.all([db.rpc('login_record_failure', { _bucket: employeeBucket }), db.rpc('login_record_failure', { _bucket: ipBucket })]);
    throw new Error('Employee ID or password is incorrect.');
  }
  await db.rpc('login_clear_failures', { _bucket: employeeBucket });
  return { access_token: s.session.access_token, refresh_token: s.session.refresh_token };
});
