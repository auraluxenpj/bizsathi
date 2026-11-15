export type CashierDocument = { id: string; actor_id: string | null; source_id?: string | null; kind?: string };
export type CashierPayment = { document_id: string | null; session_id: string | null };
export type CashierCounter = { session_id: string; actor_id: string | null };

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
 * Restrict the commerce payload returned to a staff cashier.
 * Keep manager-approved sale returns linked to the cashier's original sale visible,
 * and include all events belonging to the cashier's own drawer session.
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
  const ownSessionIds = new Set(data.counters.filter((event) => event.actor_id === userId).map((event) => event.session_id));
  const counters = data.counters.filter((event) => ownSessionIds.has(event.session_id));

  return {
    ...data,
    documents,
    counters,
    payments: data.payments.filter(
      (payment) => (!!payment.document_id && documentIds.has(payment.document_id)) || (!!payment.session_id && ownSessionIds.has(payment.session_id)),
    ),
    journals: [],
    memberships: [],
    loyalty: [],
    redemptions: [],
  };
}
