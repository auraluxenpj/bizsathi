import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillRow, NoteRow } from './workspace-schemas';
import { billMetaInput, billRegisterInput, businessOnly, categoryRenameInput, idInput, noteInput } from './workspace-schemas';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loose = (client: unknown) => client as SupabaseClient<any, 'public', any>;

// All reads and writes use the signed-in user's own database session, so row-level security
// (migration 0019 and the existing product policies) decides what each person may see or change.

export const listNotes = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(businessOnly).handler(async ({ data, context }) => {
  const { data: rows, error } = await loose(context.supabase).from('business_notes').select('id,title,body,pinned,created_by,created_at,updated_at').eq('business_id', data.businessId).order('pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(500);
  if (error) { console.error('Notes query failed', error.code); throw new Error('Notes could not be loaded.'); }
  return { notes: (rows ?? []) as NoteRow[], userId: context.userId };
});

export const saveNote = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(noteInput).handler(async ({ data, context }) => {
  if (data.id) {
    const { data: rows, error } = await loose(context.supabase).from('business_notes').update({ title: data.title, body: data.body, pinned: data.pinned }).eq('id', data.id).eq('business_id', data.businessId).select('id');
    if (error || !rows?.length) throw new Error('Note could not be saved. You can only edit your own notes unless you are an administrator.');
    return { id: data.id };
  }
  const { data: row, error } = await loose(context.supabase).from('business_notes').insert({ business_id: data.businessId, title: data.title, body: data.body, pinned: data.pinned }).select('id').single();
  if (error || !row) throw new Error('Note could not be saved. Your role may not allow writing notes.');
  return { id: row.id };
});

export const deleteNote = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(idInput).handler(async ({ data, context }) => {
  const { data: rows, error } = await loose(context.supabase).from('business_notes').delete().eq('id', data.id).eq('business_id', data.businessId).select('id');
  if (error || !rows?.length) throw new Error('Note could not be deleted. You can only delete your own notes unless you are an administrator.');
  return { id: data.id };
});

export const listBills = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(businessOnly).handler(async ({ data, context }) => {
  const { data: rows, error } = await loose(context.supabase).from('business_bills').select('id,storage_path,caption,bill_date,mime_type,size_bytes,created_by,created_at').eq('business_id', data.businessId).order('bill_date', { ascending: false }).order('created_at', { ascending: false }).limit(300);
  if (error) { console.error('Bills query failed', error.code); throw new Error('Bills could not be loaded.'); }
  const bills = (rows ?? []) as Omit<BillRow, 'url'>[];
  const urls = new Map<string, string>();
  if (bills.length) {
    const signed = await loose(context.supabase).storage.from('bills').createSignedUrls(bills.map(b => b.storage_path), 600);
    for (const s of signed.data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return { bills: bills.map(b => ({ ...b, url: urls.get(b.storage_path) ?? null })), userId: context.userId };
});

export const registerBill = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(billRegisterInput).handler(async ({ data, context }) => {
  const { data: row, error } = await loose(context.supabase).from('business_bills').insert({ business_id: data.businessId, storage_path: data.path, caption: data.caption, bill_date: data.billDate, mime_type: data.mimeType, size_bytes: data.size }).select('id').single();
  if (error || !row) throw new Error('Bill could not be saved. Your role may not allow uploads.');
  return { id: row.id };
});

export const saveBillMeta = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(billMetaInput).handler(async ({ data, context }) => {
  const { data: rows, error } = await loose(context.supabase).from('business_bills').update({ caption: data.caption, bill_date: data.billDate }).eq('id', data.id).eq('business_id', data.businessId).select('id');
  if (error || !rows?.length) throw new Error('Bill could not be updated. You can only edit your own uploads unless you are an administrator.');
  return { id: data.id };
});

export const deleteBill = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(idInput).handler(async ({ data, context }) => {
  const { data: bill } = await loose(context.supabase).from('business_bills').select('storage_path').eq('id', data.id).eq('business_id', data.businessId).maybeSingle();
  const { data: rows, error } = await loose(context.supabase).from('business_bills').delete().eq('id', data.id).eq('business_id', data.businessId).select('id');
  if (error || !rows?.length) throw new Error('Bill could not be deleted. You can only delete your own uploads unless you are an administrator.');
  if (bill?.storage_path) await loose(context.supabase).storage.from('bills').remove([bill.storage_path]);
  return { id: data.id };
});

export const listItemCategories = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(businessOnly).handler(async ({ data, context }) => {
  const { data: rows, error } = await context.supabase.from('products').select('category').eq('business_id', data.businessId).limit(5000);
  if (error) { console.error('Category query failed', error.code); throw new Error('Categories could not be loaded.'); }
  const counts = new Map<string, number>();
  for (const r of rows ?? []) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  return { categories: [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)) };
});

// Renaming to another existing name merges the two. Only administrators may edit products (row-level security).
export const renameItemCategory = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(categoryRenameInput).handler(async ({ data, context }) => {
  const { data: rows, error } = await context.supabase.from('products').update({ category: data.to }).eq('business_id', data.businessId).eq('category', data.from).select('id');
  if (error) throw new Error('Category could not be changed.');
  if (!rows?.length) throw new Error('Nothing was changed. Only administrators can edit item categories.');
  return { changed: rows.length };
});
