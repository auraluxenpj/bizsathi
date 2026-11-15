import { describe, expect, it } from 'vitest';
import { auditInventoryReconciliation, type ReconciliationMovement } from './inventory-reconciliation';

const scope = { businessId: 'biz-1', branchId: 'branch-1', variantId: 'variant-1' };
const movement = (overrides: Partial<ReconciliationMovement> = {}): ReconciliationMovement => ({
  ...scope,
  movementId: 'move-1',
  quantityDelta: '5',
  occurredAt: '2026-01-01T10:00:00.000Z',
  requiresCostEvidence: true,
  costEvidence: 'valued',
  sourceRef: 'goods-receipt:line-1',
  sourceExists: true,
  ...overrides,
});

describe('read-only inventory reconciliation', () => {
  it('ties a complete movement history to the current branch/variant balance', () => {
    const result = auditInventoryReconciliation({
      movements: [movement(), movement({
        movementId: 'move-2',
        quantityDelta: '-2',
        occurredAt: '2026-01-02T10:00:00.000Z',
        sourceRef: 'sale:line-2',
      })],
      balances: [{ ...scope, quantity: '3' }],
    });
    expect(result.isReconciled).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.checkedMovements).toBe(2);
  });

  it('reports quantity mismatch using exact decimal arithmetic', () => {
    const result = auditInventoryReconciliation({
      movements: [movement({ quantityDelta: '0.333333333333333333' })],
      balances: [{ ...scope, quantity: '0.333333333333333334' }],
    });
    expect(result.findings.map(finding => finding.code)).toContain('quantity_mismatch');
  });

  it('flags unvalued movements and missing cost source references', () => {
    const result = auditInventoryReconciliation({
      movements: [movement({ costEvidence: 'unvalued', sourceRef: null })],
      balances: [{ ...scope, quantity: '5' }],
    });
    expect(result.findings.map(finding => finding.code)).toEqual(
      expect.arrayContaining(['missing_cost_evidence', 'missing_source_reference']),
    );
  });

  it('flags orphan source references', () => {
    const result = auditInventoryReconciliation({
      movements: [movement({ sourceExists: false })],
      balances: [{ ...scope, quantity: '5' }],
    });
    expect(result.findings.map(finding => finding.code)).toContain('orphan_source_reference');
  });

  it('detects negative intermediate stock even when final quantity ties out', () => {
    const result = auditInventoryReconciliation({
      movements: [
        movement({ movementId: 'sale-first', quantityDelta: '-2', occurredAt: '2026-01-01T09:00:00.000Z', sourceRef: 'sale:1' }),
        movement({ movementId: 'receipt-later', quantityDelta: '5', occurredAt: '2026-01-01T10:00:00.000Z' }),
      ],
      balances: [{ ...scope, quantity: '3' }],
    });
    expect(result.findings.map(finding => finding.code)).toContain('negative_intermediate_stock');
    expect(result.findings.map(finding => finding.code)).not.toContain('quantity_mismatch');
  });

  it('detects duplicated movement identifiers', () => {
    const result = auditInventoryReconciliation({
      movements: [movement(), movement({ quantityDelta: '1' })],
      balances: [{ ...scope, quantity: '5' }],
    });
    expect(result.findings.map(finding => finding.code)).toContain('duplicate_movement_id');
  });

  it('detects missing and duplicate balance rows', () => {
    const missing = auditInventoryReconciliation({ movements: [movement()], balances: [] });
    expect(missing.findings.map(finding => finding.code)).toContain('missing_balance');

    const duplicate = auditInventoryReconciliation({
      movements: [movement()],
      balances: [{ ...scope, quantity: '5' }, { ...scope, quantity: '5' }],
    });
    expect(duplicate.findings.map(finding => finding.code)).toContain('invalid_balance');
  });

  it('flags current stock without a supplied movement history', () => {
    const result = auditInventoryReconciliation({
      movements: [],
      balances: [{ ...scope, quantity: '4' }],
    });
    expect(result.findings.map(finding => finding.code)).toContain('quantity_mismatch');
  });

  it('rejects malformed movement and balance values', () => {
    const result = auditInventoryReconciliation({
      movements: [movement({ quantityDelta: 'NaN' })],
      balances: [{ ...scope, quantity: '-1' }],
    });
    expect(result.findings.map(finding => finding.code)).toContain('invalid_movement');
    expect(result.findings.map(finding => finding.code)).toContain('invalid_balance');
  });
});
