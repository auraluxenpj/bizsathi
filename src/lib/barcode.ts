const EAN13_WEIGHTS = [1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3];

function normalizeSkuDigits(sku: string): string {
  const cleaned = sku.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '000000000000';

  const digits = Array.from(cleaned)
    .map((char) => (Number.isInteger(Number(char)) ? char : String(char.charCodeAt(0) % 10)))
    .join('')
    .replace(/\D/g, '');

  return digits.slice(0, 12).padEnd(12, '0');
}

export function generateSkuBarcode(sku: string): string {
  const base = Array.from(normalizeSkuDigits(sku), Number);
  const sum = base.reduce((total, digit, index) => total + digit * EAN13_WEIGHTS[index], 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${base.join('')}${checkDigit}`;
}

export function generateBarcodeFromSkuIfNeeded(sku: string, existingBarcode?: string | null): string {
  const trimmedSku = sku.trim();
  if (!trimmedSku) return '';
  const current = existingBarcode?.trim();
  if (current) return current;
  return generateSkuBarcode(trimmedSku);
}

export function isValidEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const checkDigit = digits.at(-1) ?? 0;
  const computed = (10 - (digits.slice(0, 12).reduce((sum, digit, index) => sum + digit * EAN13_WEIGHTS[index], 0) % 10)) % 10;
  return checkDigit === computed;
}
