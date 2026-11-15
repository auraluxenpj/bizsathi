import { describe, expect, it } from 'vitest';
import { generateBarcodeFromSkuIfNeeded, generateSkuBarcode, isValidEan13 } from './barcode';
import { defaultLabelCopies, initialLabelCopies } from './barcode-labels';

describe('SKU barcode generation', () => {
  it('generates a valid 13-digit code for a SKU and keeps explicit values', () => {
    const generated = generateSkuBarcode('SKU-42');
    expect(generated).toMatch(/^\d{13}$/);
    expect(isValidEan13(generated)).toBe(true);
    expect(generateBarcodeFromSkuIfNeeded('SKU-42', '')).toBe(generated);
    expect(generateBarcodeFromSkuIfNeeded('SKU-42', '1234567890123')).toBe('1234567890123');
  });
});


describe('barcode label quantity defaults', () => {
  it('prefills each SKU with its current whole-unit stock and clamps invalid or negative stock to zero', () => {
    expect(defaultLabelCopies(24)).toBe(24);
    expect(defaultLabelCopies(3.8)).toBe(3);
    expect(defaultLabelCopies(-2)).toBe(0);
    expect(defaultLabelCopies(Number.NaN)).toBe(0);
    expect(initialLabelCopies([
      { id: 'v1', sku: 'SKU-1', name: 'Product 1', price: 100, stock: 24 },
      { id: 'v2', sku: 'SKU-2', name: 'Product 2', price: 200, stock: 0 },
    ])).toEqual({ v1: 24, v2: 0 });
  });
});
