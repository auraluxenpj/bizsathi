import { z } from 'zod';

export const accountKinds = [{ id: 'bank', label: 'Bank' }, { id: 'wallet', label: 'Digital wallet' }, { id: 'cash', label: 'Cash (safe)' }] as const;
export type AccountKind = (typeof accountKinds)[number]['id'];
export const kindLabel = (kind: string) => accountKinds.find(k => k.id === kind)?.label ?? kind;

const id = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d{1,13}(\.\d{1,2})?$/, 'Use a number with at most two decimals.'));
const signedMoney = z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^-?\d{1,13}(\.\d{1,2})?$/, 'Use a number with at most two decimals.'));
const base = { businessId: id, branchId: id, periodId: id, id, date: day };

export const businessOnly = z.object({ businessId: id });
export const createAccountInput = z.object({ ...base, name: z.string().trim().min(1).max(80), kind: z.enum(['bank', 'wallet', 'cash']), opening: money.default('0') }).strict();
export const adjustAccountInput = z.object({ ...base, accountId: id, target: signedMoney }).strict();
export const transferInput = z.object({ ...base, fromAccountId: id, toAccountId: id, amount: money.refine(v => Number(v) > 0, 'Enter an amount above zero.') }).strict().refine(v => v.fromAccountId !== v.toAccountId, { message: 'Choose two different accounts.' });
export const paymentChoice = z.object({ paymentId: id, accountId: id });

export type NamedAccount = { id: string; name: string; kind: AccountKind; isActive: boolean; balance: number };
export type AccountBalances = { accounts: NamedAccount[]; unassigned: { cash: number; bank: number; wallet: number } };

/** Active accounts of one kind, for a picker. */
export const accountsOfKind = (all: NamedAccount[] | undefined, kind: string) => (all ?? []).filter(a => a.kind === kind && a.isActive);

/** Remembers the last account used per payment type on this device. Storage can be unavailable. */
const KEY = (businessId: string, kind: string) => `bizsathi.account:${businessId}:${kind}`;
export function rememberedAccount(businessId: string, kind: string, available: NamedAccount[]): string {
  try { const saved = localStorage.getItem(KEY(businessId, kind)); return saved && available.some(a => a.id === saved) ? saved : ''; } catch { return ''; }
}
export function rememberAccount(businessId: string, kind: string, accountId: string) { try { if (accountId) localStorage.setItem(KEY(businessId, kind), accountId); } catch { /* ignore */ } }
