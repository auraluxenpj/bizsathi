import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { businessOnly } from './workspace-schemas';
import { PRODUCT_IMAGE_BUCKET } from './product-images';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loose = (client: unknown) => client as SupabaseClient<any, 'public', any>;
const id = z.string().uuid();
const MISSING_COLUMN = ['42703', 'PGRST204', 'PGRST200'];

// Reads and writes use the signed-in person's own session, so the existing product policies (administrators only),
// custom permission denials and audit trigger decide who may change a photo.
export const listProductImages = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(businessOnly).handler(async ({ data, context }) => {
  const { data: rows, error } = await loose(context.supabase).from('products').select('id,image_path').eq('business_id', data.businessId).not('image_path', 'is', null).limit(5000);
  if (error) {
    // The photo column is added by migration 0035; until it is applied the screens should still work, just without photos.
    if (MISSING_COLUMN.includes(error.code ?? '') || /image_path/.test(error.message)) return { images: {} as Record<string, string> };
    throw new Error('Product photos could not be loaded.');
  }
  const paths = (rows ?? []) as { id: string; image_path: string }[];
  const urlByPath = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 500) {
    const signed = await loose(context.supabase).storage.from(PRODUCT_IMAGE_BUCKET).createSignedUrls(paths.slice(i, i + 500).map((r) => r.image_path), 3600);
    for (const s of signed.data ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }
  const images: Record<string, string> = {};
  for (const r of paths) { const url = urlByPath.get(r.image_path); if (url) images[r.id] = url; }
  return { images };
});

export const setProductImage = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ businessId: id, productId: id, path: z.string().max(200).nullable() })).handler(async ({ data, context }) => {
  const db = loose(context.supabase);
  const before = await db.from('products').select('image_path').eq('business_id', data.businessId).eq('id', data.productId).maybeSingle();
  if (before.error || !before.data) throw new Error('Product not found, or you do not have access.');
  const old = (before.data as { image_path: string | null }).image_path;
  const saved = await db.from('products').update({ image_path: data.path }).eq('business_id', data.businessId).eq('id', data.productId).select('id');
  if (saved.error || !saved.data?.length) throw new Error('The photo could not be saved. Only administrators with product access can change it.');
  // The previous file is only removed after the new one is safely saved, so a product is never left without a photo by a failed change.
  if (old && old !== data.path) await db.storage.from(PRODUCT_IMAGE_BUCKET).remove([old]);
  return { ok: true };
});
