import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Json } from '@/integrations/supabase/types';
import { readReceipt } from './receipt-ai';
import { MAX_RECEIPT_BYTES, receiptTypes } from './receipt-schemas';
import { voucherInput } from './voucher-schemas';

// Accountants and above only. Reads use the signed-in user's own session, so row-level security applies;
// posting goes through the database functions confirm_expense_receipt / reject_expense_receipt.

const id = z.string().uuid();
const tenant = z.object({ businessId: id });
const BUCKET = 'expense-receipts';
type Ctx = { supabase: import('@supabase/supabase-js').SupabaseClient<import('@/integrations/supabase/types').Database>; userId: string };

async function requireAccountant(context: Ctx, businessId: string) {
  const { data, error } = await context.supabase.rpc('has_business_role', { _business_id: businessId, _min_role: 'accountant' });
  if (error || !data) throw new Error('Accountant access is required.');
}

export const scanReceipt = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(tenant.extend({ path: z.string().min(1).max(300), fileName: z.string().trim().min(1).max(255), mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf']) }).refine(v => v.path.startsWith(`${v.businessId}/`) && !v.path.includes('..'), { message: 'Invalid file path.' }))
  .handler(async ({ data, context }) => {
    await requireAccountant(context, data.businessId);
    const file = await context.supabase.storage.from(BUCKET).download(data.path);
    if (file.error || !file.data) throw new Error('The uploaded file could not be read.');
    if (file.data.size > MAX_RECEIPT_BYTES) throw new Error('Files must be 8 MB or smaller.');
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    // The AI gateway is server-only and reads LOVABLE_API_KEY from the environment.
    const { generateChatCompletion } = await import('@lovable.dev/ai-gateway');
    const result = await readReceipt({ bytes, mime: data.mimeType, name: data.fileName }, request => generateChatCompletion(request as never));
    const { data: row, error } = await context.supabase.from('expense_receipts').insert({ business_id: data.businessId, file_path: data.path, file_name: data.fileName, mime_type: data.mimeType, ai_extraction: result.extraction as unknown as Json, ai_error: result.error, ai_model: result.extraction ? result.model : null, uploaded_by: context.userId }).select('id').single();
    if (error || !row) { await context.supabase.storage.from(BUCKET).remove([data.path]); throw new Error('The receipt could not be saved.'); }
    return { id: row.id, aiError: result.error };
  });

export const listReceipts = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(tenant).handler(async ({ data, context }) => {
  await requireAccountant(context, data.businessId);
  const { data: rows, error } = await context.supabase.from('expense_receipts').select('id,file_path,file_name,mime_type,status,ai_extraction,ai_error,reviewed,review_note,voucher_id,uploaded_by,created_at,reviewed_at').eq('business_id', data.businessId).order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error('Receipts could not be loaded.');
  const list = rows ?? [];
  const urls = new Map<string, string>();
  if (list.length) { const signed = await context.supabase.storage.from(BUCKET).createSignedUrls(list.map(r => r.file_path), 600); for (const s of signed.data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl); }
  return { receipts: list.map(({ file_path, ...r }) => ({ ...r, url: urls.get(file_path) ?? null })) };
});

export const confirmReceipt = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(tenant.extend({ receiptId: id, request: voucherInput })).handler(async ({ data, context }) => {
  await requireAccountant(context, data.businessId);
  if (data.request.businessId !== data.businessId || data.request.kind !== 'expense') throw new Error('This is not an expense for this business.');
  const { data: voucher, error } = await context.supabase.rpc('confirm_expense_receipt', { _receipt_id: data.receiptId, _request: data.request });
  if (error) throw new Error('The expense could not be posted. Check the date is in an open period, the branch is yours, and the receipt is still waiting.');
  return { voucherId: voucher };
});

export const rejectReceipt = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(tenant.extend({ receiptId: id, note: z.string().trim().min(1).max(500) })).handler(async ({ data, context }) => {
  await requireAccountant(context, data.businessId);
  const { error } = await context.supabase.rpc('reject_expense_receipt', { _receipt_id: data.receiptId, _note: data.note });
  if (error) throw new Error('The receipt could not be rejected. It may already have been decided.');
  return { ok: true };
});

export { receiptTypes };
