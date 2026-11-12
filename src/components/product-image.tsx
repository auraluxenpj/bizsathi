import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Camera, ImageOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { setProductImage } from '@/lib/product-images.functions';
import { MAX_EDGE, PRODUCT_IMAGE_BUCKET, fitWithin, productImagePath, sourceProblem } from '@/lib/product-images';

/** Small square photo, or a placeholder when the product has none yet. */
export function ProductThumb({ url, name, size = 'size-12' }: { url?: string | undefined; name: string; size?: string }) {
  return url
    ? <img src={url} alt={name} loading="lazy" className={`${size} shrink-0 rounded-md border object-cover`} />
    : <span role="img" aria-label={`No photo for ${name}`} className={`${size} flex shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground`}><ImageOff className="size-4" /></span>;
}

async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('This browser cannot prepare the photo.');
  ctx.drawImage(bitmap, 0, 0, width, height); bitmap.close();
  const toBlob = (type: string, quality: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
  const webp = await toBlob('image/webp', 0.82);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob('image/jpeg', 0.85);
  if (!jpeg) throw new Error('The photo could not be prepared.');
  return jpeg;
}

/** Upload, replace or remove the one photo a product has. Photos are shrunk on the device first. */
export function ProductImageField({ businessId, productId, productName, url }: { businessId: string; productId: string; productName: string; url?: string | undefined }) {
  const client = useQueryClient(); const save = useServerFn(setProductImage);
  const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const refresh = () => client.invalidateQueries({ queryKey: ['product-images', businessId] });

  async function upload(files: FileList | null) {
    const file = files?.[0]; if (input.current) input.current.value = ''; if (!file) return;
    const problem = sourceProblem(file); if (problem) { setMessage(problem); return; }
    setBusy(true); setMessage('');
    let path: string | null = null;
    try {
      const blob = await shrink(file);
      path = productImagePath(businessId, productId, crypto.randomUUID(), blob.type);
      if (!path) throw new Error('That photo type is not supported.');
      const up = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      if (up.error) throw new Error('Upload was not allowed. Only administrators can change product photos.');
      await save({ data: { businessId, productId, path } });
      setMessage('Photo saved.'); await refresh();
    } catch (e) {
      if (path) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]); // do not leave an unused file behind
      setMessage(e instanceof Error ? e.message : 'Upload failed.');
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm('Remove this product photo?')) return;
    setBusy(true); setMessage('');
    try { await save({ data: { businessId, productId, path: null } }); setMessage('Photo removed.'); await refresh(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not remove the photo.'); }
    finally { setBusy(false); }
  }
  return <div className="mb-5 flex flex-wrap items-center gap-4">
    <ProductThumb url={url} name={productName} size="size-24" />
    <div className="space-y-2">
      <p className="text-sm font-medium">Product photo <span className="font-normal text-muted-foreground">· one per product, shared by all its variants</span></p>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Product photo file" onChange={(e) => upload(e.target.files)} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => input.current?.click()}><Camera />{busy ? 'Working…' : url ? 'Replace photo' : 'Upload photo'}</Button>
        {url && <Button type="button" variant="outline" className="h-11 text-destructive" disabled={busy} onClick={remove}><Trash2 />Remove</Button>}
      </div>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  </div>;
}
