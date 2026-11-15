import Decimal from 'decimal.js';

const PreciseDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type ReconciliationMovement = {
  movementId: string;
  businessId: string;
  branchId: string;
  variantId: string;
  quantityDelta: string;
  occurredAt: string;
  requiresCostEvidence: boolean;
  costEvidence: 'valued' | 'unvalued' | 'not_required';
  sourceRef?: string | null;
  sourceExists?: boolean | null;
};

export type ReconciliationBalance = {
  businessId: string;
  branchId: string;
  variantId: string;
  quantity: string;
};

export type ReconciliationFinding = {
  code:
    | 'duplicate_movement_id'
    | 'invalid_movement'
    | 'invalid_balance'
    | 'negative_intermediate_stock'
    | 'missing_balance'
    | 'quantity_mismatch'
    | 'missing_cost_evidence'
    | 'missing_source_reference'
    | 'orphan_source_reference';
  scope?: { businessId: string; branchId: string; variantId: string };
  movementId?: string;
  expected?: string;
  actual?: string;
  message: string;
};

export type ReconciliationResult = {
  findings: ReconciliationFinding[];
  checkedMovements: number;
  checkedBalances: number;
  isReconciled: boolean;
};

function scopeKey(value: { businessId: string; branchId: string; variantId: string }): string {
  return JSON.stringify([value.businessId, value.branchId, value.variantId]);
}

/**
 * Read-only audit of a complete quantity-movement history against current stock.
 * The caller must supply all movements from the opening point through the balance
 * snapshot; this helper never fetches data or writes to a database.
 */
export function auditInventoryReconciliation(input: {
  movements: ReconciliationMovement[];
  balances: ReconciliationBalance[];
}): ReconciliationResult {
  const findings: ReconciliationFinding[] = [];
  const movementIds = new Set<string>();
  const totals = new Map<string, Decimal>();
  const scopes = new Map<string, { businessId: string; branchId: string; variantId: string }>();
  const ordered: Array<{ movement: ReconciliationMovement; quantity: Decimal; key: string }> = [];

  for (const movement of input.movements) {
    const scope = {
      businessId: movement.businessId,
      branchId: movement.branchId,
      variantId: movement.variantId,
    };
    const key = scopeKey(scope);
    scopes.set(key, scope);

    if (!movement.movementId || movementIds.has(movement.movementId)) {
      findings.push({
        code: 'duplicate_movement_id',
        scope,
        movementId: movement.movementId,
        message: 'Movement identifier is missing or duplicated in the supplied history.',
      });
      continue;
    }
    movementIds.add(movement.movementId);

    let quantity: Decimal;
    try {
      quantity = new PreciseDecimal(movement.quantityDelta);
      if (!quantity.isFinite() || quantity.isZero()) throw new Error('invalid');
      if (!movement.occurredAt || !Number.isFinite(Date.parse(movement.occurredAt))) throw new Error('invalid');
    } catch {
      findings.push({
        code: 'invalid_movement',
        scope,
        movementId: movement.movementId,
        message: 'Movement quantity must be a finite non-zero decimal and its effective date must be valid.',
      });
      continue;
    }

    if (movement.requiresCostEvidence && movement.costEvidence !== 'valued') {
      findings.push({
        code: 'missing_cost_evidence',
        scope,
        movementId: movement.movementId,
        message: 'Stock movement requires cost evidence but is not marked as valued.',
      });
    }
    if (movement.sourceExists === false) {
      findings.push({
        code: 'orphan_source_reference',
        scope,
        movementId: movement.movementId,
        message: 'Movement points to a source document or operation that was not found.',
      });
    } else if (movement.requiresCostEvidence && !movement.sourceRef) {
      findings.push({
        code: 'missing_source_reference',
        scope,
        movementId: movement.movementId,
        message: 'Cost-bearing movement has no source document or approved operation reference.',
      });
    }

    totals.set(key, (totals.get(key) ?? new PreciseDecimal(0)).plus(quantity));
    ordered.push({ movement, quantity, key });
  }

  // Replay in effective time order to catch temporary negative stock, not just
  // a final quantity that happens to tie out.
  ordered.sort((a, b) => {
    const timeDiff = Date.parse(a.movement.occurredAt) - Date.parse(b.movement.occurredAt);
    return timeDiff || a.movement.movementId.localeCompare(b.movement.movementId);
  });
  const running = new Map<string, Decimal>();
  for (const entry of ordered) {
    const next = (running.get(entry.key) ?? new PreciseDecimal(0)).plus(entry.quantity);
    running.set(entry.key, next);
    if (next.isNegative()) {
      findings.push({
        code: 'negative_intermediate_stock',
        scope: { businessId: entry.movement.businessId, branchId: entry.movement.branchId, variantId: entry.movement.variantId },
        movementId: entry.movement.movementId,
        actual: next.toString(),
        message: 'Historical movement sequence produces negative stock at this point.',
      });
    }
  }

  const balanceKeys = new Set<string>();
  for (const balance of input.balances) {
    const scope = {
      businessId: balance.businessId,
      branchId: balance.branchId,
      variantId: balance.variantId,
    };
    const key = scopeKey(scope);
    if (balanceKeys.has(key)) {
      findings.push({
        code: 'invalid_balance',
        scope,
        message: 'More than one current balance row was supplied for the same business, branch and variant.',
      });
      continue;
    }
    balanceKeys.add(key);

    let actual: Decimal;
    try {
      actual = new PreciseDecimal(balance.quantity);
      if (!actual.isFinite() || actual.isNegative()) throw new Error('invalid');
    } catch {
      findings.push({
        code: 'invalid_balance',
        scope,
        message: 'Current stock balance must be a finite non-negative decimal.',
      });
      continue;
    }

    const expected = totals.get(key) ?? new PreciseDecimal(0);
    if (!scopes.has(key)) {
      if (!actual.isZero()) {
        findings.push({
          code: 'quantity_mismatch',
          scope,
          expected: '0',
          actual: actual.toString(),
          message: 'Current stock exists but no movement history was supplied for this scope.',
        });
      }
    } else if (!expected.eq(actual)) {
      findings.push({
        code: 'quantity_mismatch',
        scope,
        expected: expected.toString(),
        actual: actual.toString(),
        message: 'Summed movement quantity does not match the current stock balance.',
      });
    }
  }

  for (const [key, scope] of scopes) {
    if (!balanceKeys.has(key)) {
      findings.push({
        code: 'missing_balance',
        scope,
        expected: (totals.get(key) ?? new PreciseDecimal(0)).toString(),
        message: 'Movement history has no matching current balance row.',
      });
    }
  }

  return {
    findings,
    checkedMovements: input.movements.length,
    checkedBalances: input.balances.length,
    isReconciled: findings.length === 0,
  };
}
