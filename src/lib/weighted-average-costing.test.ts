import { describe, expect, it } from 'vitest';
import { applyWeightedAverageCost, type CostPosition } from './weighted-average-costing';

const empty: CostPosition = { quantity: '0', inventoryValue: '0' };

describe('perpetual moving weighted-average costing', () => {
  it('recalculates average when stock is received at a different cost', () => {
    const first = applyWeightedAverageCost(empty, { type: 'receipt', quantity: '10', unitCost: '100' });
    const second = applyWeightedAverageCost(first.position, { type: 'receipt', quantity: '5', unitCost: '130' });
    expect(second.position).toEqual({ quantity: '15', inventoryValue: '1650' });
    expect(applyWeightedAverageCost(second.position, { type: 'sale', quantity: '3' }).costValue).toBe('330');
  });

  it('issues all remaining stock without leaving a precision residue', () => {
    const received = applyWeightedAverageCost(empty, { type: 'receipt', quantity: '3', unitCost: '10' });
    const issued = applyWeightedAverageCost(received.position, { type: 'sale', quantity: '3' });
    expect(issued.position).toEqual({ quantity: '0', inventoryValue: '0' });
    expect(issued.costValue).toBe('30');
  });

  it('reverses purchase returns at the original receipt cost', () => {
    const received = applyWeightedAverageCost(empty, { type: 'receipt', quantity: '10', unitCost: '100' });
    const returned = applyWeightedAverageCost(received.position, {
      type: 'purchase_return', quantity: '2', originalReceiptUnitCost: '90',
    });
    expect(returned.position).toEqual({ quantity: '8', inventoryValue: '820' });
    expect(returned.costValue).toBe('180');
  });

  it('does not substitute carrying average when a full-quantity purchase return has a different source cost', () => {
    const received = applyWeightedAverageCost(empty, { type: 'receipt', quantity: '2', unitCost: '10' });
    expect(() => applyWeightedAverageCost(received.position, {
      type: 'purchase_return', quantity: '2', originalReceiptUnitCost: '9',
    })).toThrow(/leave value without stock/);
  });

  it('restores sales returns at the original sale COGS', () => {
    const received = applyWeightedAverageCost(empty, { type: 'receipt', quantity: '10', unitCost: '100' });
    const sold = applyWeightedAverageCost(received.position, { type: 'sale', quantity: '2' });
    const returned = applyWeightedAverageCost(sold.position, {
      type: 'sales_return', quantity: '1', originalSaleUnitCost: sold.unitCost,
    });
    expect(returned.position).toEqual({ quantity: '9', inventoryValue: '900' });
  });

  it('requires explicit approved cost for positive adjustments', () => {
    expect(() => applyWeightedAverageCost(empty, {
      type: 'positive_adjustment', quantity: '1', approvedUnitCost: '0',
    })).toThrow(/greater than zero/);
  });

  it('values negative adjustments at the current moving average', () => {
    const received = applyWeightedAverageCost(empty, { type: 'receipt', quantity: '4', unitCost: '25' });
    const adjusted = applyWeightedAverageCost(received.position, { type: 'negative_adjustment', quantity: '1' });
    expect(adjusted.costValue).toBe('25');
    expect(adjusted.position).toEqual({ quantity: '3', inventoryValue: '75' });
  });

  it('preserves exact carrying value across branch transfers', () => {
    const source = applyWeightedAverageCost(empty, { type: 'receipt', quantity: '3', unitCost: '10' });
    const out = applyWeightedAverageCost(source.position, { type: 'transfer_out', quantity: '2' });
    const destination = applyWeightedAverageCost(empty, {
      type: 'transfer_in', quantity: '2', carryingValue: out.costValue,
    });
    expect(out.costValue).toBe('20');
    expect(destination.position).toEqual({ quantity: '2', inventoryValue: '20' });
  });

  it('rejects missing cost, negative stock, and inconsistent opening positions', () => {
    expect(() => applyWeightedAverageCost(empty, { type: 'receipt', quantity: '1', unitCost: '0' })).toThrow();
    expect(() => applyWeightedAverageCost(empty, { type: 'sale', quantity: '1' })).toThrow(/insufficient stock/);
    expect(() => applyWeightedAverageCost({ quantity: '0', inventoryValue: '1' }, { type: 'receipt', quantity: '1', unitCost: '2' })).toThrow(/zero stock/);
  });

  it('rejects a purchase return that would make inventory value negative', () => {
    const received = applyWeightedAverageCost(empty, { type: 'receipt', quantity: '2', unitCost: '10' });
    expect(() => applyWeightedAverageCost(received.position, {
      type: 'purchase_return', quantity: '1', originalReceiptUnitCost: '25',
    })).toThrow(/inventory value negative/);
  });

  it('keeps fractional quantities and costs precise without currency rounding', () => {
    const received = applyWeightedAverageCost(empty, { type: 'receipt', quantity: '0.333', unitCost: '12.3456' });
    expect(received.position.inventoryValue).toBe('4.1110848');
    const issued = applyWeightedAverageCost(received.position, { type: 'sale', quantity: '0.111' });
    expect(issued.costValue).toBe('1.3703616');
  });
});
