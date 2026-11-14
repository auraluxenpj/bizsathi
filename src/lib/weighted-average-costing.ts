import Decimal from 'decimal.js';

const PreciseDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type CostPosition = {
  quantity: string;
  inventoryValue: string;
};

export type CostEvent =
  | { type: 'receipt'; quantity: Decimal.Value; unitCost: Decimal.Value }
  | { type: 'sale'; quantity: Decimal.Value }
  | { type: 'purchase_return'; quantity: Decimal.Value; originalReceiptUnitCost: Decimal.Value }
  | { type: 'sales_return'; quantity: Decimal.Value; originalSaleUnitCost: Decimal.Value }
  | { type: 'positive_adjustment'; quantity: Decimal.Value; approvedUnitCost: Decimal.Value }
  | { type: 'negative_adjustment'; quantity: Decimal.Value }
  | { type: 'transfer_out'; quantity: Decimal.Value }
  | { type: 'transfer_in'; quantity: Decimal.Value; carryingValue: Decimal.Value };

export type CostResult = {
  position: CostPosition;
  quantityDelta: string;
  valueDelta: string;
  unitCost: string;
  costValue: string;
};

const ZERO = new PreciseDecimal(0);

function amount(value: Decimal.Value, field: string): Decimal {
  let parsed: Decimal;
  try {
    parsed = new PreciseDecimal(value);
  } catch {
    throw new Error(`${field} must be a valid decimal amount`);
  }
  if (!parsed.isFinite() || parsed.isNegative()) {
    throw new Error(`${field} must be finite and non-negative`);
  }
  return parsed;
}

function positiveQuantity(value: Decimal.Value): Decimal {
  const quantity = amount(value, 'quantity');
  if (quantity.isZero()) throw new Error('quantity must be greater than zero');
  return quantity;
}

function readPosition(position: CostPosition) {
  const quantity = amount(position.quantity, 'position quantity');
  const inventoryValue = amount(position.inventoryValue, 'inventory value');
  if (quantity.isZero() && !inventoryValue.isZero()) {
    throw new Error('zero stock cannot carry inventory value');
  }
  if (quantity.gt(0) && inventoryValue.isZero()) {
    throw new Error('positive stock requires a reconciled inventory value');
  }
  return { quantity, inventoryValue };
}

function result(
  quantity: Decimal,
  inventoryValue: Decimal,
  quantityDelta: Decimal,
  valueDelta: Decimal,
  unitCost: Decimal,
  costValue: Decimal,
): CostResult {
  return {
    position: { quantity: quantity.toString(), inventoryValue: inventoryValue.toString() },
    quantityDelta: quantityDelta.toString(),
    valueDelta: valueDelta.toString(),
    unitCost: unitCost.toString(),
    costValue: costValue.toString(),
  };
}

function receive(
  position: CostPosition,
  quantityInput: Decimal.Value,
  unitCostInput: Decimal.Value,
): CostResult {
  const current = readPosition(position);
  const quantity = positiveQuantity(quantityInput);
  const unitCost = amount(unitCostInput, 'unit cost');
  if (unitCost.isZero()) throw new Error('unit cost must be greater than zero');
  const value = quantity.times(unitCost);
  const nextQuantity = current.quantity.plus(quantity);
  const nextValue = current.inventoryValue.plus(value);
  return result(nextQuantity, nextValue, quantity, value, unitCost, value);
}

function issue(
  position: CostPosition,
  quantityInput: Decimal.Value,
): CostResult {
  const current = readPosition(position);
  const quantity = positiveQuantity(quantityInput);
  if (quantity.gt(current.quantity)) throw new Error('insufficient stock for costing event');
  const unitCost = current.inventoryValue.div(current.quantity);
  const costValue = quantity.eq(current.quantity)
    ? current.inventoryValue
    : unitCost.times(quantity);
  const nextQuantity = current.quantity.minus(quantity);
  const nextValue = current.inventoryValue.minus(costValue);
  return result(nextQuantity, nextValue, quantity.neg(), costValue.neg(), unitCost, costValue);
}

function reverseAtOriginalCost(
  position: CostPosition,
  quantityInput: Decimal.Value,
  unitCostInput: Decimal.Value,
  label: string,
): CostResult {
  const current = readPosition(position);
  const quantity = positiveQuantity(quantityInput);
  if (quantity.gt(current.quantity)) throw new Error(`insufficient stock for ${label}`);
  const unitCost = amount(unitCostInput, 'original unit cost');
  if (unitCost.isZero()) throw new Error('original unit cost must be greater than zero');
  const value = quantity.eq(current.quantity)
    ? current.inventoryValue
    : quantity.times(unitCost);
  if (value.gt(current.inventoryValue)) {
    throw new Error(`${label} would make inventory value negative; reconcile the source cost first`);
  }
  const nextQuantity = current.quantity.minus(quantity);
  const nextValue = current.inventoryValue.minus(value);
  return result(nextQuantity, nextValue, quantity.neg(), value.neg(), unitCost, value);
}

/**
 * Pure perpetual moving-weighted-average transition.
 * Callers must persist the returned cost event atomically with the existing stock posting.
 */
export function applyWeightedAverageCost(
  position: CostPosition,
  event: CostEvent,
): CostResult {
  switch (event.type) {
    case 'receipt':
      return receive(position, event.quantity, event.unitCost);
    case 'sale':
    case 'negative_adjustment':
    case 'transfer_out':
      return issue(position, event.quantity);
    case 'purchase_return':
      return reverseAtOriginalCost(position, event.quantity, event.originalReceiptUnitCost, 'purchase return');
    case 'positive_adjustment':
      return receive(position, event.quantity, event.approvedUnitCost);
    case 'sales_return':
    case 'transfer_in': {
      const current = readPosition(position);
      const quantity = positiveQuantity(event.quantity);
      const value = event.type === 'sales_return'
        ? quantity.times(amount(event.originalSaleUnitCost, 'original sale unit cost'))
        : amount(event.carryingValue, 'transfer carrying value');
      if (value.isZero()) throw new Error('restored inventory value must be greater than zero');
      const nextQuantity = current.quantity.plus(quantity);
      const nextValue = current.inventoryValue.plus(value);
      return result(nextQuantity, nextValue, quantity, value, value.div(quantity), value);
    }
  }
}
