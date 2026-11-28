import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { AURALUXE_BUSINESS_ID } from './website-sync';

const input = z.object({ businessId: z.literal(AURALUXE_BUSINESS_ID) });
const endpoint = 'https://www.auraluxe.com.np/api/public/bizsathi-collections';

async function requestCollections(method: 'GET' | 'POST', collections?: unknown) {
  const secret = process.env['INVENTORY_SYNC_SECRET'];
  if (!secret || secret.length < 24) throw new Error('Auraluxe collections connection is not configured. Check the shared inventory sync secret.');
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method, redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'Bearer ' + secret, Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify({ collections }) } : {}),
    });
  } catch { throw new Error('Could not reach the Auraluxe collections service over HTTPS.'); }
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error('Auraluxe collections endpoint redirected; the shared secret was not forwarded.'); }
  const body = await response.json().catch(() => null) as { error?: string; collections?: unknown[]; products?: unknown[]; result?: unknown } | null;
  if (!response.ok || !body) throw new Error(body?.error || 'Auraluxe collections service returned an error.');
  return body;
}

export const loadAuraluxeCollections = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(input)
  .handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' });
    if (error || !allowed) throw new Error('Auraluxe administrator access is required.');
    return requestCollections('GET');
  });

const collectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  collection_type: z.enum(['seasonal', 'occasion', 'custom']),
  description: z.string().max(500).nullable(),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(10000),
  starts_at: z.string().datetime().nullable(),
  ends_at: z.string().datetime().nullable(),
  product_ids: z.array(z.string().uuid()).max(500),
});
const saveInput = input.extend({ collections: z.array(collectionSchema).max(100) });

export const saveAuraluxeCollections = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(saveInput)
  .handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' });
    if (error || !allowed) throw new Error('Auraluxe administrator access is required.');
    return requestCollections('POST', data.collections);
  });
