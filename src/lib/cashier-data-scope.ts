export type CashierDocument = { id: string; actor_id: string | null; source_id?: string | null; kind?: string };
export type CashierPayment = { document_id: string | null; session_id: string | null };
export type CashierCounter = { session_id: string; actor_id: string | null; kind?: string };

type CashierScopeInput<D extends CashierDocument, P extends CashierPayment, C extends CashierCounter, J, M, L, R> = {
  documents: D[];
  payments: P[];
  counters: C[];
  journals: J[];
  memberships: M[];
  loyalty: L[];
  redemptions: R[];
};

/**
 * Keep a cashier's own sales and historical sessions, plus the active shared
 * branch counter and its cash payments. RLS has already limited active sessions
 * to branches the signed-in cashier is assigned to.
 */
export function scopeCommerceForCashier<D extends CashierDocument, P extends CashierPayment, C extends CashierCounter, J, M, L, R>(
  data: CashierScopeInput<D, P, C, J, M, L, R>,
  userId: string,
): CashierScopeInput<D, P, C, J, M, L, R> {
  const ownSales = data.documents.filter((document) => document.actor_id === userId);
  const ownSaleIds = new Set(ownSales.map((document) => document.id));
  const documents = data.documents.filter(
    (document) => document.actor_id === userId || (document.kind === 'sale_return' && !!document.source_id && ownSaleIds.has(document.source_id)),
  );
  const documentIds = new Set(documents.map((document) => document.id));
  const openedSessions = new Set(data.counters.filter((event) => event.kind === 'open').map((event) => event.session_id));
  const closedSessions = new Set(data.counters.filter((event) => event.kind === 'close').map((event) => event.session_id));
  const activeSharedSessionIds = new Set([...openedSessions].filter((id) => !closedSessions.has(id)));
  const ownSessionIds = new Set(data.counters.filter((event) => event.actor_id === userId).map((event) => event.session_id));
  const visibleSessionIds = new Set([...ownSessionIds, ...activeSharedSessionIds]);
  const counters = data.counters.filter((event) => visibleSessionIds.has(event.session_id));

  return {
    ...data,
    documents,
    counters,
    // Cashiers see payments attached to their own sales only. The manager's
    // shared-counter reconciliation uses the unscoped manager workspace payload.
    payments: data.payments.filter((payment) => !!payment.document_id && documentIds.has(payment.document_id)),
    journals: [],
    memberships: [],
    loyalty: [],
    redemptions: [],
  };
}
