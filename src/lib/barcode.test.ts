import { describe, expect, it } from 'vitest';
import { generateBarcodeFromSkuIfNeeded, generateSkuBarcode, isValidEan13 } from './barcode';

describe('SKU barcode generation', () => {
  it('generates a valid 13-digit code for a SKU and keeps explicit values', () => {
    const generated = generateSkuBarcode('SKU-42');
    expect(generated).toMatch(/^\d{13}$/);
    expect(isValidEan13(generated)).toBe(true);
    expect(generateBarcodeFromSkuIfNeeded('SKU-42', '')).toBe(generated);
    expect(generateBarcodeFromSkuIfNeeded('SKU-42', '1234567890123')).toBe('1234567890123');
  });
});
