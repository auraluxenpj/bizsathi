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
  const { data: variantRows, error: variantError } = await loose(context.supabase)
    .from('product_variants').select('id,image_path').eq('business_id', data.businessId)
    .not('image_path', 'is', null).limit(10000);
  if (variantError) throw new Error('SKU photos could not be loaded.');
  for (const row of (variantRows ?? []) as { id: string; image_path: string | null }[]) {
    if (row.image_path && /^https:\/\//i.test(row.image_path)) images[row.id] = row.image_path;
  }
  return { images };
});

export const setProductImage = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ businessId: id, productId: id, path: z.string().max(200).nullable() })).handler(async ({ data, context }) => {
  const db = loose(context.supabase);
  const before = await db.from('products').select('image_path').eq('business_id', data.businessId).eq('id', data.productId).maybeSingle();
  if (before.error || !before.data) throw new Error('Product not found, or you do not have access.');
  const saved = await db.from('products').update({ image_path: data.path }).eq('business_id', data.businessId).eq('id', data.productId).select('id');
  if (saved.error || !saved.data?.length) throw new Error('The photo could not be saved. Only administrators with product access can change it.');
  // Do not delete the previous object here. Shared media may be referenced by other SKUs or systems.
  // Orphan cleanup belongs to the central media library and must verify that no references remain.
  return { ok: true };
});


const sharedMediaBase = 'https://www.auraluxe.com.np/api/public/shared-media';
const sharedMediaUrl = (url: unknown): url is string =>
  typeof url === 'string' && url.startsWith('https://jsshaoucrjorbyuzagdr.supabase.co/storage/v1/object/public/product-images/');

async function sharedMediaRequest(path: string, method: 'GET' | 'POST', secret: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error('Auraluxe shared media endpoint redirected; the shared credential was not forwarded.');
  }
  const result = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Auraluxe shared media request failed.');
  return result;
}

async function requireMediaAdmin(context: { supabase: unknown }, businessId: string) {
  const db = loose(context.supabase);
  const { data: allowed, error } = await db.rpc('has_business_role', { _business_id: businessId, _min_role: 'admin' });
  if (error || !allowed) throw new Error('Administrator access is required to manage SKU photos.');
}

/** Upload or replace the product-level default image in the same central library. */
export const uploadSharedProductDefaultImage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    businessId: id,
    productId: id,
    mimeType: z.literal('image/webp'),
    base64: z.string().min(1).max(1_000_000),
  }))
  .handler(async ({ data, context }) => {
    await requireMediaAdmin(context, data.businessId);
    const db = loose(context.supabase);
    const { data: product, error: productError } = await db.from('products')
      .select('id').eq('business_id', data.businessId).eq('id', data.productId).maybeSingle();
    if (productError || !product) throw new Error('Product not found, or you do not have access.');
    const secret = process.env['INVENTORY_SYNC_SECRET'] ?? '';
    if (secret.length < 24) throw new Error('Shared media connection is not configured in BizSathi.');
    const result = await sharedMediaRequest(sharedMediaBase, 'POST', secret, {
      mime_type: data.mimeType, base64: data.base64,
    });
    if (result?.ok !== true || !sharedMediaUrl(result.url)) throw new Error('Auraluxe shared media upload returned an invalid asset URL.');
    const { data: saved, error: saveError } = await db.from('products')
      .update({ image_path: result.url }).eq('business_id', data.businessId).eq('id', data.productId).select('id').maybeSingle();
    if (saveError || !saved) throw new Error('The shared image uploaded, but the product default image could not be saved.');
    return { url: result.url, deduplicated: result.deduplicated === true };
  });

/** List the latest shared Auraluxe assets; the server-to-server secret never reaches the browser. */
export const listSharedProductMedia = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator(businessOnly)
  .handler(async ({ data, context }) => {
    await requireMediaAdmin(context, data.businessId);
    const secret = process.env['INVENTORY_SYNC_SECRET'] ?? '';
    if (secret.length < 24) throw new Error('Shared media connection is not configured in BizSathi.');
    let result: Record<string, unknown> | null;
    try { result = await sharedMediaRequest(sharedMediaBase, 'GET', secret); }
    catch (error) { throw new Error(error instanceof Error ? error.message : 'Shared media library could not be loaded.'); }
    const assets = Array.isArray(result?.assets) ? result.assets : [];
    return {
      assets: assets.filter((asset): asset is { id: string; url: string; mime_type: string; byte_size: number; created_at: string } =>
        !!asset && typeof asset === 'object' &&
        typeof (asset as Record<string, unknown>).id === 'string' &&
        sharedMediaUrl((asset as Record<string, unknown>).url)
      ),
    };
  });

/** Upload a photo once to Auraluxe and assign the resulting shared URL to this SKU in both systems. */
export const uploadSharedProductImage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    businessId: id,
    variantId: id,
    sku: z.string().trim().min(1).max(80),
    mimeType: z.literal('image/webp'),
    base64: z.string().min(1).max(1_000_000),
  }))
  .handler(async ({ data, context }) => {
    await requireMediaAdmin(context, data.businessId);
    const db = loose(context.supabase);
    const { data: variant, error: variantError } = await db.from('product_variants')
      .select('id,sku').eq('business_id', data.businessId).eq('id', data.variantId).eq('sku', data.sku).maybeSingle();
    if (variantError || !variant) throw new Error('SKU not found, or you do not have access.');
    const secret = process.env['INVENTORY_SYNC_SECRET'] ?? '';
    if (secret.length < 24) throw new Error('Shared media connection is not configured in BizSathi.');
    let result: Record<string, unknown> | null;
    try {
      result = await sharedMediaRequest(sharedMediaBase, 'POST', secret, {
        mime_type: data.mimeType, base64: data.base64, sku: data.sku,
      });
    } catch (error) { throw new Error(error instanceof Error ? error.message : 'Auraluxe shared media upload failed.'); }
    if (result?.ok !== true || !sharedMediaUrl(result.url)) throw new Error('Auraluxe shared media upload returned an invalid asset URL.');
    const { data: saved, error: saveError } = await db.from('product_variants')
      .update({ image_path: result.url }).eq('business_id', data.businessId).eq('id', data.variantId).select('id').maybeSingle();
    if (saveError || !saved) throw new Error('The shared image uploaded, but its BizSathi SKU assignment could not be saved.');
    return { url: result.url, assetId: typeof result.asset_id === 'string' ? result.asset_id : null, deduplicated: result.deduplicated === true };
  });

/** Attach an existing central asset to a SKU, or clear that SKU's image override. */
export const assignSharedProductImage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    businessId: id,
    variantId: id,
    sku: z.string().trim().min(1).max(80),
    assetId: z.string().uuid().nullable(),
  }))
  .handler(async ({ data, context }) => {
    await requireMediaAdmin(context, data.businessId);
    const db = loose(context.supabase);
    const { data: variant, error: variantError } = await db.from('product_variants')
      .select('id,sku').eq('business_id', data.businessId).eq('id', data.variantId).eq('sku', data.sku).maybeSingle();
    if (variantError || !variant) throw new Error('SKU not found, or you do not have access.');
    const secret = process.env['INVENTORY_SYNC_SECRET'] ?? '';
    if (secret.length < 24) throw new Error('Shared media connection is not configured in BizSathi.');
    let result: Record<string, unknown> | null;
    try {
      result = await sharedMediaRequest('https://www.auraluxe.com.np/api/public/shared-media/assign', 'POST', secret, {
        sku: data.sku, asset_id: data.assetId,
      });
    } catch (error) { throw new Error(error instanceof Error ? error.message : 'SKU image assignment failed.'); }
    const url = data.assetId === null ? null : result?.url;
    if (data.assetId !== null && !sharedMediaUrl(url)) throw new Error('Auraluxe returned an invalid shared image URL.');
    const { data: saved, error: saveError } = await db.from('product_variants')
      .update({ image_path: url }).eq('business_id', data.businessId).eq('id', data.variantId).select('id').maybeSingle();
    if (saveError || !saved) throw new Error('Auraluxe was updated, but the BizSathi SKU assignment could not be saved.');
    return { ok: true, url };
  });
