import { describe, expect, it } from 'vitest';
import { scopeCommerceForCashier } from './cashier-data-scope';

const cashier = 'cashier-1';
const manager = 'manager-1';

describe('scopeCommerceForCashier', () => {
  const data = {
    documents: [
      { id: 'sale-own', actor_id: cashier, kind: 'sale', source_id: null },
      { id: 'return-own-sale', actor_id: manager, kind: 'sale_return', source_id: 'sale-own' },
      { id: 'sale-other', actor_id: 'cashier-2', kind: 'sale', source_id: null },
      { id: 'return-other-sale', actor_id: manager, kind: 'sale_return', source_id: 'sale-other' },
    ],
    payments: [
      { id: 'payment-own-sale', document_id: 'sale-own', session_id: null },
      { id: 'payment-own-return', document_id: 'return-own-sale', session_id: null },
      { id: 'payment-other-sale', document_id: 'sale-other', session_id: null },
      { id: 'payment-own-drawer', document_id: null, session_id: 'session-own' },
      { id: 'payment-other-drawer', document_id: null, session_id: 'session-other' },
    ],
    counters: [
      { id: 'open-own', actor_id: cashier, session_id: 'session-own', kind: 'open' },
      { id: 'manager-cash-in-own-session', actor_id: manager, session_id: 'session-own', kind: 'in' },
      { id: 'close-own', actor_id: cashier, session_id: 'session-own', kind: 'close' },
      { id: 'open-other', actor_id: 'cashier-2', session_id: 'session-other', kind: 'open' },
      { id: 'close-other', actor_id: 'manager-2', session_id: 'session-other', kind: 'close' },
    ],
    journals: [{ id: 'journal-private' }],
    memberships: [{ id: 'membership-private' }],
    loyalty: [{ id: 'loyalty-private' }],
    redemptions: [{ id: 'redemption-private' }],
  };

  it('returns only the cashier own sales and manager-approved returns linked to those sales', () => {
    expect(scopeCommerceForCashier(data, cashier).documents.map((row) => row.id)).toEqual(['sale-own', 'return-own-sale']);
  });

  it('returns only payments for the cashier documents or own drawer sessions', () => {
    expect(scopeCommerceForCashier(data, cashier).payments.map((row) => row.id)).toEqual([
      'payment-own-sale', 'payment-own-return', 'payment-own-drawer',
    ]);
  });

  it('includes manager events inside the cashier session but excludes other sessions and accounting journals', () => {
    const scoped = scopeCommerceForCashier(data, cashier);
    expect(scoped.counters.map((row) => row.id)).toEqual(['open-own', 'manager-cash-in-own-session', 'close-own']);
    expect(scoped.journals).toEqual([]);
  });

  it('does not expose the customer membership directory or loyalty ledger to cashiers', () => {
    const scoped = scopeCommerceForCashier(data, cashier);
    expect(scoped.memberships).toEqual([]);
    expect(scoped.loyalty).toEqual([]);
    expect(scoped.redemptions).toEqual([]);
  });

  it('does not mutate the original commerce payload', () => {
    const originalCount = data.documents.length;
    scopeCommerceForCashier(data, cashier);
    expect(data.documents).toHaveLength(originalCount);
  });

  it('includes all events and cash payments in the active shared session, but not its history after close', () => {
    const shared = {
      ...data,
      counters: [
        { id: 'shared-open', actor_id: 'cashier-2', session_id: 'shared', kind: 'open' },
        { id: 'shared-cash-in', actor_id: manager, session_id: 'shared', kind: 'in' },
        { id: 'closed-open', actor_id: 'cashier-2', session_id: 'closed', kind: 'open' },
        { id: 'closed-close', actor_id: manager, session_id: 'closed', kind: 'close' },
      ],
      payments: [
        ...data.payments,
        { id: 'shared-cash-payment', document_id: null, session_id: 'shared' },
        { id: 'closed-cash-payment', document_id: null, session_id: 'closed' },
      ],
    };
    const scoped = scopeCommerceForCashier(shared, cashier);
    expect(scoped.counters.map((row) => row.id)).toEqual(['shared-open', 'shared-cash-in']);
    expect(scoped.payments.map((row) => row.id)).toContain('shared-cash-payment');
    expect(scoped.payments.map((row) => row.id)).not.toContain('closed-cash-payment');
  });
});
