import { describe, expect, it } from 'vitest';
import { confirmBlockReason, friendlyCommerceError, type ConfirmCheck } from './commerce-errors';

const ok: ConfirmCheck = { kind: 'sale', hasLines: true, hasPeriod: true, party: '', mobileOk: true, balanceDue: 0, hasCashPayment: false, hasOpenCounter: false, shortStock: [] };
describe('friendlyCommerceError', () => {
  it('explains the database rules in plain words', () => {
    expect(friendlyCommerceError('Walk-in sale must be paid in full')).toMatch(/paid in full.*choose a customer/);
    expect(friendlyCommerceError('Your open cash counter is required')).toMatch(/counter is not open/);
    expect(friendlyCommerceError('Insufficient stock including confirmed invoices')).toMatch(/Not enough stock/);
    expect(friendlyCommerceError('An open financial period covering this date is required')).toMatch(/financial year/);
    expect(friendlyCommerceError('Document access denied')).toMatch(/access/);
  });
  it('never repeats unexpected or technical messages', () => {
    for (const m of ['duplicate key value violates unique constraint "x"', 'permission denied for table commerce_documents', '', null, undefined]) expect(friendlyCommerceError(m)).toBeNull();
  });
});
describe('confirmBlockReason', () => {
  it('lets a fully paid walk-in sale through', () => expect(confirmBlockReason({ ...ok, hasCashPayment: true, hasOpenCounter: true })).toBeNull());
  it('names the first thing in the way', () => {
    expect(confirmBlockReason({ ...ok, hasLines: false })).toMatch(/Add at least one item/);
    expect(confirmBlockReason({ ...ok, hasPeriod: false })).toMatch(/financial year/);
    expect(confirmBlockReason({ ...ok, mobileOk: false })).toMatch(/10-digit mobile/);
    expect(confirmBlockReason({ ...ok, shortStock: [{ name: 'Silk Saree', onHand: 0 }] })).toMatch(/Not enough stock for Silk Saree \(0 in stock here\)/);
    expect(confirmBlockReason({ ...ok, balanceDue: 1500 })).toMatch(/must be paid in full/);
    expect(confirmBlockReason({ ...ok, hasCashPayment: true })).toMatch(/cash counter open/);
  });
  it('allows credit to a chosen customer, and needs a supplier for purchases', () => {
    expect(confirmBlockReason({ ...ok, party: 'p1', balanceDue: 1500 })).toBeNull();
    expect(confirmBlockReason({ ...ok, kind: 'purchase', mobileOk: false })).toMatch(/supplier/);
    expect(confirmBlockReason({ ...ok, kind: 'purchase', party: 'p', mobileOk: false, balanceDue: 900 })).toBeNull();
    expect(confirmBlockReason({ ...ok, kind: 'purchase', party: 'p', shortStock: [{ name: 'x', onHand: 0 }] })).toBeNull();
  });
});
