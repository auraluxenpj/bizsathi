import { createServerFn } from '@tanstack/react-start';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { storedDocumentInput, paymentInput } from './commerce-schemas';
import { friendlyCommerceError } from './commerce-errors';
import { voucherInput } from './voucher-schemas';
import { adjustAccountInput, businessOnly, createAccountInput, paymentChoice, transferInput, type AccountBalances } from './account-schemas';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (client: unknown) => client as SupabaseClient<any, 'public', any>;

// The database does the real work and the real checks (migration 0024). These functions only validate the
// request shape and turn the database's own messages into plain language.
const fail = (message: string | undefined, fallback: string, code?: string) => {
  if (code === '23505') return new Error('An account with this name already exists.');
  return new Error(friendlyCommerceError(message) ?? fallback);
};

export const getAccountBalances = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(businessOnly).handler(async ({ data, context }) => {
  const r = await db(context.supabase).rpc('account_balances', { _business: data.businessId });
  if (r.error) throw fail(r.error.message, 'Accounts could not be loaded.');
  return r.data as unknown as AccountBalances;
});

export const createAccount = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(createAccountInput).handler(async ({ data, context }) => {
  const r = await db(context.supabase).rpc('create_payment_account', { _business: data.businessId, _branch: data.branchId, _period: data.periodId, _id: data.id, _name: data.name, _kind: data.kind, _opening: Number(data.opening), _date: data.date });
  if (r.error) throw fail(r.error.message, 'The account could not be created. Check the date is in an open financial year.', r.error.code);
  return { id: r.data as string };
});

export const adjustAccount = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(adjustAccountInput).handler(async ({ data, context }) => {
  const r = await db(context.supabase).rpc('adjust_payment_account', { _request: { ...data, target: Number(data.target) } });
  if (r.error) throw fail(r.error.message, 'The balance could not be adjusted. Check the date is in an open financial year.');
  return { id: r.data as string };
});

export const transferBetweenAccounts = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(transferInput).handler(async ({ data, context }) => {
  const r = await db(context.supabase).rpc('transfer_between_accounts', { _request: { ...data, amount: Number(data.amount) } });
  if (r.error) throw fail(r.error.message, 'The transfer could not be made. Check the date is in an open financial year.');
  return { id: r.data as string };
});

// Same checks and same posting as the untagged versions, plus a record of which account each payment used.
export const confirmDocumentTagged = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ request: storedDocumentInput, accounts: z.array(paymentChoice).min(1).max(20) })).handler(async ({ data, context }) => {
  const r = await db(context.supabase).rpc('post_commerce_document_with_accounts', { _request: data.request, _accounts: data.accounts });
  if (r.error) throw fail(r.error.message, 'Document not confirmed. Check customer mobile, branch permissions, open period, stock, payment amounts and the chosen accounts.');
  return { id: r.data as string };
});
export const recordPaymentTagged = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ request: paymentInput, accountId: z.string().uuid() })).handler(async ({ data, context }) => {
  const r = await db(context.supabase).rpc('post_commerce_payment_with_account', { _request: data.request, _account: data.accountId });
  if (r.error) throw fail(r.error.message, 'Payment not confirmed. Check outstanding balance, open period and the chosen account.');
  return { id: r.data as string };
});
export const postVoucherTagged = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ request: voucherInput, accountId: z.string().uuid() })).handler(async ({ data, context }) => {
  if (data.request.kind !== 'expense') throw new Error('Only expenses can be paid from a named account.');
  const r = await db(context.supabase).rpc('post_accounting_voucher_with_account', { _request: data.request, _account: data.accountId });
  if (r.error) throw fail(r.error.message, 'Expense not posted. Check permissions, branch, period, reference, amount and the chosen account.');
  return { id: r.data as string };
});
