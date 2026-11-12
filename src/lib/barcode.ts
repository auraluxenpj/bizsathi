const EAN13_WEIGHTS = [1,3,1,3,1,3,1,3,1,3,1,3];

function normalizeSkuDigits(sku: string): string {
  const clean = sku.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return '000000000000';
  const digits = Array.from(clean)
    .map((char) => (Number.isInteger(Number(char)) ? char : String(char.charCodeAt(0) % 10)))
    .join('')
    .replace(/\D/g, '');
  return digits.slice(0, 12).padEnd(12, '0');
}

export function generateSkuBarcode(sku: string): string {
  const base = normalizeSkuDigits(sku).split('').map(Number);
  const checksum = (10 - (base.reduce((sum, digit, index) => sum + digit * EAN13_WEIGHTS[index], 0) % 10)) % 10;
  return [...base, checksum].join('');
}

export function isValidEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const check = digits.at(-1) ?? 0;
  const computed = (10 - (digits.slice(0, 12).reduce((sum, digit, index) => sum + digit * EAN13_WEIGHTS[index], 0) % 10)) % 10;
  return check === computed;
}
