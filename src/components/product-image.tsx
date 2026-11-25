import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Camera, ImageOff, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setProductImage, uploadSharedProductImage } from '@/lib/product-images.functions';
import { sourceProblem } from '@/lib/product-images';
import { compressImageToWebp } from '@/lib/image-compression';

/** Small square photo, or a placeholder when the product has none yet. */
export function ProductThumb({ url, name, size = 'size-12' }: { url?: string | undefined; name: string; size?: string }) {
  return url
    ? <img src={url} alt={name} loading="lazy" className={`${size} aspect-square shrink-0 rounded-md border bg-muted p-1 object-contain`} />
    : <span role="img" aria-label={`No photo for ${name}`} className={`${size} flex shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground`}><ImageOff className="size-4" /></span>;
}

/** Upload, replace or remove the one photo a product has. Photos are converted to WebP <=512 KiB and stored once in the shared Auraluxe media library. */
export function ProductImageField({ businessId, productId, productName, searchQuery, url }: { businessId: string; productId: string; productName: string; searchQuery?: string; url?: string | undefined }) {
  const client = useQueryClient(); const save = useServerFn(setProductImage); const uploadShared = useServerFn(uploadSharedProductImage);
  const cameraInput = useRef<HTMLInputElement>(null); const fileInput = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const refresh = () => client.invalidateQueries({ queryKey: ['product-images', businessId] });

  async function upload(files: FileList | null) {
    const file = files?.[0]; if (cameraInput.current) cameraInput.current.value = ''; if (fileInput.current) fileInput.current.value = ''; if (!file) return;
    const problem = sourceProblem(file); if (problem) { setMessage(problem); return; }
    setBusy(true); setMessage('');
    try {
      const webp = await compressImageToWebp(file);
      const bytes = new Uint8Array(await webp.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      const uploaded = await uploadShared({ data: {
        businessId, productId, mimeType: 'image/webp', base64: btoa(binary),
      } });
      await save({ data: { businessId, productId, path: uploaded.url } });
      setMessage('Photo saved to the shared media library.'); await refresh();
    } catch (e) {
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
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take product photo with camera" onChange={(e) => upload(e.target.files)} />
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose product photo from device" onChange={(e) => upload(e.target.files)} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-11" asChild><a href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery?.trim() || productName)}`} target="_blank" rel="noopener noreferrer"><Search />Search web images</a></Button>
        <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => cameraInput.current?.click()}><Camera />Take photo</Button>
        <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => fileInput.current?.click()}><ImageOff />{url ? 'Replace from device' : 'Choose from device'}</Button>
        {url && <Button type="button" variant="outline" className="h-11 text-destructive" disabled={busy} onClick={remove}><Trash2 />Remove</Button>}
      </div>
      {busy && <p role="status" className="text-sm text-muted-foreground">Converting to WebP and saving…</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  </div>;
}
