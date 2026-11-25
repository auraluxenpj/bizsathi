import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Camera, ImageOff, Search, Trash2, Images } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { assignSharedProductImage, listSharedProductMedia, uploadSharedProductImage } from '@/lib/product-images.functions';
import { sourceProblem } from '@/lib/product-images';
import { compressImageToWebp } from '@/lib/image-compression';

type SharedAsset = { id: string; url: string; mime_type: string; byte_size: number; created_at: string };

/** Small square photo, or a placeholder when the SKU has no dedicated photo. */
export function ProductThumb({ url, name, size = 'size-12' }: { url?: string | undefined; name: string; size?: string }) {
  return url
    ? <img src={url} alt={name} loading="lazy" className={`${size} aspect-square shrink-0 rounded-md border bg-muted p-1 object-contain`} />
    : <span role="img" aria-label={`No photo for ${name}`} className={`${size} flex shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground`}><ImageOff className="size-4" /></span>;
}

/** SKU photo editor. Uploads are deduplicated centrally; the selected asset is referenced by SKU in both systems. */
export function ProductImageField({ businessId, variantId, sku, productName, searchQuery, url }: {
  businessId: string; variantId: string; sku: string; productName: string; searchQuery?: string; url?: string | undefined;
}) {
  const client = useQueryClient();
  const uploadShared = useServerFn(uploadSharedProductImage);
  const listShared = useServerFn(listSharedProductMedia);
  const assignShared = useServerFn(assignSharedProductImage);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [message, setMessage] = useState('');
  const [assets, setAssets] = useState<SharedAsset[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['product-images', businessId] }),
      client.invalidateQueries({ queryKey: ['inventory', businessId] }),
    ]);
  };

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (cameraInput.current) cameraInput.current.value = '';
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    const problem = sourceProblem(file);
    if (problem) { setMessage(problem); return; }
    setBusy(true); setMessage('');
    try {
      const webp = await compressImageToWebp(file);
      const bytes = new Uint8Array(await webp.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      const uploaded = await uploadShared({ data: {
        businessId, variantId, sku, mimeType: 'image/webp', base64: btoa(binary),
      } });
      setMessage(uploaded.deduplicated ? 'Existing shared image reused and assigned to this SKU.' : 'Image stored once and assigned to this SKU.');
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Upload failed.');
    } finally { setBusy(false); }
  }

  async function browseLibrary() {
    setLoadingLibrary(true); setMessage('');
    try {
      const result = await listShared({ data: { businessId } });
      setAssets(result.assets as SharedAsset[]);
      setLibraryOpen(true);
      if (!result.assets.length) setMessage('The shared library is empty. Upload a photo to add the first asset.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Shared library could not be loaded.');
    } finally { setLoadingLibrary(false); }
  }

  async function chooseAsset(asset: SharedAsset) {
    setBusy(true); setMessage('');
    try {
      await assignShared({ data: { businessId, variantId, sku, assetId: asset.id } });
      setLibraryOpen(false);
      setMessage('Shared image assigned to this SKU in BizSathi and Auraluxe.');
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'SKU image assignment failed.');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm(`Remove the dedicated photo for SKU ${sku}? The product default image will remain unchanged.`)) return;
    setBusy(true); setMessage('');
    try {
      await assignShared({ data: { businessId, variantId, sku, assetId: null } });
      setMessage('SKU photo override removed. Product default image remains available.');
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not remove the SKU photo.');
    } finally { setBusy(false); }
  }

  return <>
    <div className="mb-5 flex flex-wrap items-center gap-4 rounded-lg border p-3">
      <ProductThumb url={url} name={`${productName} · ${sku}`} size="size-24" />
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium">SKU photo <span className="font-normal text-muted-foreground">· {sku}</span></p>
        <p className="text-xs text-muted-foreground">One central image asset can be reused by multiple SKUs. No duplicate file is created for an existing image.</p>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take SKU photo with camera" onChange={(e) => upload(e.target.files)} />
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose SKU photo from device" onChange={(e) => upload(e.target.files)} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-10" disabled={busy || loadingLibrary} onClick={() => void browseLibrary()}><Images />Browse shared library</Button>
          <Button type="button" variant="outline" className="h-10" disabled={busy} onClick={() => cameraInput.current?.click()}><Camera />Take photo</Button>
          <Button type="button" variant="outline" className="h-10" disabled={busy} onClick={() => fileInput.current?.click()}><ImageOff />{url ? 'Replace photo' : 'Upload photo'}</Button>
          <Button type="button" variant="outline" className="h-10" asChild><a href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery?.trim() || productName)}`} target="_blank" rel="noopener noreferrer"><Search />Search web images</a></Button>
          {url && <Button type="button" variant="outline" className="h-10 text-destructive" disabled={busy} onClick={() => void remove()}><Trash2 />Remove SKU photo</Button>}
        </div>
        {busy && <p role="status" className="text-sm text-muted-foreground">Saving shared SKU image…</p>}
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
    <Dialog open={libraryOpen} onOpenChange={(open) => { if (!busy) setLibraryOpen(open); }}>
      <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Shared Auraluxe image library</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Choose an existing image to assign it to SKU {sku}. This reuses the stored asset; it does not upload another copy.</p>
        {assets.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No shared images are available yet.</p> :
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {assets.map((asset) => <button key={asset.id} type="button" disabled={busy} onClick={() => void chooseAsset(asset)} className="group rounded-lg border p-2 text-left hover:border-primary disabled:opacity-50">
              <img src={asset.url} alt={`Shared media ${asset.id}`} loading="lazy" className="aspect-square w-full rounded-md bg-muted object-contain" />
              <span className="mt-2 block text-xs text-muted-foreground">{(asset.byte_size / 1024).toFixed(0)} KB · {asset.mime_type.replace('image/','').toUpperCase()}</span>
            </button>)}
          </div>}
      </DialogContent>
    </Dialog>
  </>;
}
