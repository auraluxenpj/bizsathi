import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { analysisInput, businessInput, eventInput, findingInput, isAdministrator } from './security-schemas';

export const listAdminBusinesses = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from('business_memberships').select('business_id,role_code,status,businesses(id,name,archived_at)').eq('user_id', context.userId).eq('status', 'active');
  if (error) throw new Error('Unable to load business access.');
  return (data ?? []).filter(m => isAdministrator(m.role_code, m.status) && m.businesses && !m.businesses.archived_at).map(m => ({ id: m.business_id, name: m.businesses?.name ?? 'Business', role: m.role_code }));
});

export const getReviewHistory = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(businessInput).handler(async ({ data, context }) => {
  const { data: allowed, error: permissionError } = await context.supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' });
  if (permissionError || !allowed) throw new Error('Administrator access is required.');
  const { data: rows, error } = await context.supabase.from('security_review_events').select('*').eq('business_id', data.businessId).order('created_at', { ascending: false });
  if (error) throw new Error('Unable to load security review history.');
  const { referenceHistory } = await import('./security-reference.server');
  return { events: rows ?? [], referenceHistory };
});

export const addFinding = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(findingInput).handler(async ({ data, context }) => {
  const { data: allowed, error: permissionError } = await context.supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' });
  if (permissionError || !allowed) throw new Error('Administrator access is required.');
  const { data: row, error } = await context.supabase.from('security_review_events').insert({ business_id: data.businessId, kind: 'finding', title: data.title, details: data.details }).select().single();
  if (error) throw new Error('Finding could not be saved. Administrator access is required.');
  return row;
});

export const appendReviewEvent = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(eventInput).handler(async ({ data, context }) => {
  const { data: allowed, error: permissionError } = await context.supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' });
  if (permissionError || !allowed) throw new Error('Administrator access is required.');
  if (data.kind !== 'report' && !data.relatedId) throw new Error('Select a finding for this decision.');
  if (data.kind === 'approval' && !['approved', 'rejected'].includes(data.decision ?? '')) throw new Error('Select an approval decision.');
  if (data.kind === 'disposition' && !['open', 'remediated', 'accepted_risk', 'false_positive'].includes(data.decision ?? '')) throw new Error('Select a disposition.');
  if (data.relatedId) {
    const { data: finding } = await context.supabase.from('security_review_events').select('id').eq('business_id', data.businessId).eq('id', data.relatedId).eq('kind', 'finding').maybeSingle();
    if (!finding) throw new Error('Finding is unavailable.');
  }
  const { error } = await context.supabase.from('security_review_events').insert({ business_id: data.businessId, kind: data.kind, title: data.title, details: data.details, related_id: data.relatedId, payload: { decision: data.decision } });
  if (error) throw new Error('Decision could not be recorded.');
  return { ok: true };
});

export const analyzeFinding = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(analysisInput).handler(async ({ data, context }) => {
  const { data: allowed, error: permissionError } = await context.supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' });
  if (permissionError || !allowed) throw new Error('Administrator access is required.');
  const { data: finding, error } = await context.supabase.from('security_review_events').select('*').eq('business_id', data.businessId).eq('id', data.findingId).eq('kind', 'finding').single();
  if (error || !finding) throw new Error('Finding is unavailable.');
  const { data: controls } = await context.supabase.from('security_review_events').select('kind,details').eq('business_id', data.businessId).in('kind', ['ai_block', 'ai_resume']).order('created_at', { ascending: false }).limit(1);
  if (controls?.[0]?.kind === 'ai_block') return { ok: false as const, error: controls[0].details };
  const { summarizeFinding } = await import('./ai/security-summary.server');
  const result = await summarizeFinding(finding.title, finding.details);
  if (!result.ok) {
    if (result.blocked) {
      const { error: blockError } = await context.supabase.from('security_review_events').insert({ business_id: data.businessId, kind: 'ai_block', title: 'AI reviews paused', details: result.error });
      if (blockError) throw new Error('AI access was denied and the pause could not be saved. Do not retry until access is restored.');
    }
    return result;
  }
  const { error: saveError } = await context.supabase.from('security_review_events').insert({ business_id: data.businessId, kind: 'analysis', title: `Impact summary: ${finding.title}`.slice(0, 200), details: result.summary.impact.slice(0, 12000), related_id: finding.id, payload: { summary: result.summary, model: 'openai/gpt-6-astra', runId: result.runId ?? null } });
  if (saveError) return { ok: false as const, error: 'The AI summary was generated but could not be saved. No automatic retry was made.' };
  return result;
});

export const resumeAiReviews = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(businessInput).handler(async ({ data, context }) => {
  const { data: allowed, error: permissionError } = await context.supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' });
  if (permissionError || !allowed) throw new Error('Administrator access is required.');
  const { error } = await context.supabase.from('security_review_events').insert({ business_id: data.businessId, kind: 'ai_resume', title: 'AI access recovery confirmed', details: 'Administrator confirmed AI access was restored. No request was retried automatically.' });
  if (error) throw new Error('Administrator access is required.');
  return { ok: true };
});