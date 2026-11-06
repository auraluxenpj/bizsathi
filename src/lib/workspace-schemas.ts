import { z } from 'zod';

const id = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const billTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' } as const;
export type BillType = keyof typeof billTypes;
export const MAX_BILL_BYTES = 10 * 1024 * 1024;

export const businessOnly = z.object({ businessId: id });
export const noteInput = z.object({ businessId: id, id: id.optional(), title: z.string().trim().min(1).max(160), body: z.string().max(20000).default(''), pinned: z.boolean().default(false) });
export const idInput = z.object({ businessId: id, id });
export const billRegisterInput = z.object({
  businessId: id, path: z.string().min(1).max(300), caption: z.string().trim().max(200).default(''), billDate: day,
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']), size: z.number().int().min(1).max(MAX_BILL_BYTES),
}).refine(v => v.path.startsWith(`${v.businessId}/`) && !v.path.includes('..'), { message: 'Invalid file path.' });
export const billMetaInput = z.object({ businessId: id, id, caption: z.string().trim().max(200), billDate: day });
export const categoryRenameInput = z.object({ businessId: id, from: z.string().trim().max(100), to: z.string().trim().max(100) }).refine(v => v.from !== v.to, { message: 'Choose a different name.' });

/** Where a new bill file is stored: always inside the business's own folder. */
export function billPath(businessId: string, mime: BillType, fileId: string = crypto.randomUUID()): string {
  return `${businessId}/${fileId}.${billTypes[mime]}`;
}

/** Returns an error message, or null when the file is acceptable. */
export function checkBillFile(file: { type: string; size: number }): string | null {
  if (!(file.type in billTypes)) return 'Only JPG, PNG, WebP images or PDF files are allowed.';
  if (file.size < 1) return 'That file is empty.';
  if (file.size > MAX_BILL_BYTES) return 'Files must be 10 MB or smaller.';
  return null;
}

// Row shapes for the tables added in migration 0019 (the generated database types do not include them until regenerated).
export type NoteRow = { id: string; title: string; body: string; pinned: boolean; created_by: string; created_at: string; updated_at: string };
export type BillRow = { id: string; storage_path: string; caption: string; bill_date: string; mime_type: BillType; size_bytes: number; created_by: string; created_at: string; url: string | null };
