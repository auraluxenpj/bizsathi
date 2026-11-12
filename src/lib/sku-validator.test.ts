import { describe, it, expect } from "vitest";
import { normalizeSKU, validateSKU } from "./sku-validator";
import { isProductSku } from "./product-information";

describe("SKU validator", () => {
  it("normalizes case, spaces and repeated dashes", () => {
    expect(normalizeSKU(" al-kurti -001 ")).toBe("AL-KURTI-001");
    expect(normalizeSKU("AL--SAREE--012")).toBe("AL-SAREE-012");
    expect(normalizeSKU(null)).toBe("");
  });
  it("accepts AL-TYPE-001 style with long or short type names", () => {
    for (const s of ["AL-KURTI-001", "AL-PARTYWEAR-076", "AL-K-001", "AL-PW-660", "AL-COORDSET-1234"]) expect(validateSKU(s).valid).toBe(true);
  });
  it("rejects missing prefix, missing number or too short a number", () => {
    for (const s of ["KURTI-001", "AL-1", "AL-D-", "AL-KURTI-01", "AL-KURTI-ABC"]) expect(validateSKU(s).valid).toBe(false);
  });
  it("can allow an empty SKU only when asked", () => {
    expect(validateSKU("").valid).toBe(false);
    expect(validateSKU("", { allowEmpty: true }).valid).toBe(true);
  });
  it("import accepts both the long names in the Web sheet and the existing short codes", () => {
    expect(isProductSku("AL-KURTI-001")).toBe(true);
    expect(isProductSku("AL-PW-660")).toBe(true);
    expect(isProductSku("AL-1")).toBe(false);
  });
});
