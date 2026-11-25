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
  const localPaths = paths.filter((r) => !/^https:\/\//i.test(r.image_path));
  const urlByPath = new Map<string, string>();
  for (let i = 0; i < localPaths.length; i += 500) {
    const signed = await loose(context.supabase).storage.from(PRODUCT_IMAGE_BUCKET).createSignedUrls(localPaths.slice(i, i + 500).map((r) => r.image_path), 3600);
    for (const s of signed.data ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }
  const images: Record<string, string> = {};
  for (const r of paths) {
    const url = /^https:\/\//i.test(r.image_path) ? r.image_path : urlByPath.get(r.image_path);
    if (url) images[r.id] = url;
  }
  return { images };
});

export const setProductImage = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ businessId: id, productId: id, path: z.string().max(200).nullable() })).handler(async ({ data, context }) => {
  const db = loose(context.supabase);
  const before = await db.from('products').select('image_path').eq('business_id', data.businessId).eq('id', data.productId).maybeSingle();
  if (before.error || !before.data) throw new Error('Product not found, or you do not have access.');
  const old = (before.data as { image_path: string | null }).image_path;
  const saved = await db.from('products').update({ image_path: data.path }).eq('business_id', data.businessId).eq('id', data.productId).select('id');
  if (saved.error || !saved.data?.length) throw new Error('The photo could not be saved. Only administrators with product access can change it.');
  // Do not delete the previous object here. Shared media may be referenced by other SKUs or systems.
  // Orphan cleanup belongs to the central media library and must verify that no references remain.
  return { ok: true };
});


/** Upload bytes to Auraluxe's central media library. The shared credential stays server-side. */
export const uploadSharedProductImage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    businessId: id,
    productId: id,
    mimeType: z.literal('image/webp'),
    base64: z.string().min(1).max(1_000_000),
  }))
  .handler(async ({ data, context }) => {
    const product = await loose(context.supabase).from('products').select('id')
      .eq('business_id', data.businessId).eq('id', data.productId).maybeSingle();
    if (product.error || !product.data) throw new Error('Product not found, or you do not have access.');
    const secret = process.env['INVENTORY_SYNC_SECRET'] ?? '';
    if (secret.length < 24) throw new Error('Shared media connection is not configured in BizSathi.');
    let response: Response;
    try {
      response = await fetch('https://www.auraluxe.com.np/api/public/shared-media', {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ mime_type: data.mimeType, base64: data.base64 }),
      });
    } catch {
      throw new Error('Auraluxe shared media service could not be reached.');
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error('Auraluxe shared media endpoint redirected; the shared credential was not forwarded.');
    }
    const result = await response.json().catch(() => null) as { ok?: boolean; url?: string; asset_id?: string; error?: string } | null;
    if (!response.ok || result?.ok !== true || typeof result.url !== 'string' || !result.url.startsWith('https://jsshaoucrjorbyuzagdr.supabase.co/storage/v1/object/public/product-images/')) {
      throw new Error(typeof result?.error === 'string' ? result.error : 'Auraluxe shared media upload failed.');
    }
    return { url: result.url, assetId: result.asset_id ?? null };
  });
