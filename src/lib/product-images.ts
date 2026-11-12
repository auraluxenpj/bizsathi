/** Helpers for the single photo each product can have. Kept free of browser APIs so they can be tested. */
export const PRODUCT_IMAGE_BUCKET = 'product-images';
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
export const MAX_EDGE = 900;
export const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Scales to fit inside max × max without ever enlarging. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function extensionFor(mime: string): 'webp' | 'jpg' | 'png' | null {
  return mime === 'image/webp' ? 'webp' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : null;
}

/** <business>/<product>/<file>: the shape the database CHECK and the storage policies require. */
export function productImagePath(businessId: string, productId: string, fileId: string, mime: string): string | null {
  const ext = extensionFor(mime);
  return ext ? `${businessId}/${productId}/${fileId}.${ext}` : null;
}

export function sourceProblem(file: { type: string; size: number }): string | null {
  if (!PRODUCT_IMAGE_TYPES.includes(file.type)) return 'Choose a JPG, PNG or WebP photo.';
  if (file.size > MAX_SOURCE_BYTES) return 'That photo is larger than 15 MB. Choose a smaller one.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}
