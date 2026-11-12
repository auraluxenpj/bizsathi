export function normalizeSKU(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-+/g, "-");
}

export function validateSKU(value: unknown, options?: { allowEmpty?: boolean }): {
  valid: boolean;
  normalized: string;
  error?: string | undefined;
} {
  const normalized = normalizeSKU(value);

  if (!normalized) {
    if (options?.allowEmpty) {
      return {
        valid: true,
        normalized,
        error: undefined,
      };
    }

    return {
      valid: false,
      normalized,
      error: "SKU is required",
    };
  }

  const valid = /^AL-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3,}$/.test(normalized);

  return {
    valid,
    normalized,
    error: valid ? undefined : "Invalid SKU. Expected AL-TYPE-001",
  };
}

export function isValidSKU(value: unknown): boolean {
  return validateSKU(value).valid;
}
