import { validateSKU } from "./sku-validator";
export const PHOTO_DISCLAIMER = "Please note: the actual product’s colour, texture and fine details may vary slightly from the images shown due to lighting, camera settings, screen display and AI-generated or enhanced imagery.";

// AURALUXE's own garment letters, kept identical to the codes already used in the catalogue.
export const GARMENT_TYPES = ["PW", "CO", "S", "K", "SU", "D", "G", "PZ", "SH", "T", "OTH"] as const;

export const GARMENT_LABELS: Record<string, string> = {
  PW: "Party Wear",
  CO: "Co-ord Set",
  S: "Saree",
  K: "Kurti",
  SU: "Suit",
  D: "Dress",
  G: "Gown",
  PZ: "Palazzo Set",
  SH: "Sharara Set",
  T: "Top",
  OTH: "Other",
};

export function skuTypeForProduct(name: string, category = ""): string {
  const value = `${name} ${category}`.toLowerCase();
  if (/saree|sari/.test(value)) return "S";
  if (/sharara/.test(value)) return "SH";
  if (/co[ -]?ord/.test(value)) return "CO";
  if (/palazzo|plazzo/.test(value)) return "PZ";
  if (/kurti|kurta/.test(value)) return "K";
  if (/gown/.test(value)) return "G";
  if (/dress/.test(value)) return "D";
  if (/suit/.test(value)) return "SU";
  if (/\btop\b/.test(value)) return "T";
  if (/party/.test(value)) return "PW";
  return "OTH";
}

export function buildProductSku(kind: string, suffix: string): string {
  const type = kind.trim().toUpperCase();
  const ending = suffix.trim().toUpperCase();
  if (!(GARMENT_TYPES as readonly string[]).includes(type)) throw new Error("Choose a garment type for the SKU");
  if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(ending)) throw new Error("Enter the final SKU identifier using letters, numbers or dashes");
  return `AL-${type}-${ending}`;
}

export function splitProductSku(sku: string | null, name: string, category = "") {
  const value = sku?.trim().toUpperCase() ?? "";
  const kind = [...GARMENT_TYPES].sort((a, b) => b.length - a.length).find((t) => value.startsWith(`AL-${t}-`));
  if (kind) return { kind, suffix: value.slice(`AL-${kind}-`.length) };
  // Retain legacy identifiers, including ones typed with a stray space, until the admin saves.
  return { kind: skuTypeForProduct(name, category), suffix: value.replace(/^AL-\s*[A-Z]*\s*-/, "") };
}

export function isProductSku(value: string): boolean {
  // Both styles are accepted: the garment-letter codes in use (AL-PW-660) and full type names (AL-KURTI-001).
  if (validateSKU(value).valid) return true;
  const parsed = splitProductSku(value, "");
  try { return buildProductSku(parsed.kind, parsed.suffix) === value; } catch { return false; }
}
