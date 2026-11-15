export type CashierDocument = { id: string; actor_id: string | null; source_id?: string | null; kind?: string };
export type CashierPayment = { document_id: string | null; session_id: string | null };
export type CashierCounter = { session_id: string; actor_id: string | null };

type CashierScopeInput<D extends CashierDocument, P extends CashierPayment, C extends CashierCounter, J> = {
  documents: D[];
  payments: P[];
  counters: C[];
  journals: J[];
};

/**
 * Restrict the commerce payload returned to a staff cashier.
 * Keep manager-approved sale returns linked to the cashier's original sale visible,
 * but never expose another cashier's unrelated documents, payments or drawer sessions.
 */
export function scopeCommerceForCashier<D extends CashierDocument, P extends CashierPayment, C extends CashierCounter, J>(
  data: CashierScopeInput<D, P, C, J>,
  userId: string,
): CashierScopeInput<D, P, C, J> {
  const ownSales = data.documents.filter((document) => document.actor_id === userId);
  const ownSaleIds = new Set(ownSales.map((document) => document.id));
  const documents = data.documents.filter(
    (document) => document.actor_id === userId || (document.kind === 'sale_return' && !!document.source_id && ownSaleIds.has(document.source_id)),
  );
  const documentIds = new Set(documents.map((document) => document.id));
  const counters = data.counters.filter((event) => event.actor_id === userId);
  const sessionIds = new Set(counters.map((event) => event.session_id));

  return {
    ...data,
    documents,
    counters,
    payments: data.payments.filter(
      (payment) => (!!payment.document_id && documentIds.has(payment.document_id)) || (!!payment.session_id && sessionIds.has(payment.session_id)),
    ),
    journals: [],
  };
}
