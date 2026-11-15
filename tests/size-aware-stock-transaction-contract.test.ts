import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const contract = readFileSync(
  resolve(process.cwd(), ".lovable/drafts/size-aware-stock/transaction-api-contract.md"),
  "utf8",
);

describe("size-aware transaction contract", () => {
  it("requires explicit size identity for new confirmed lines", () => {
    expect(contract).toMatch(/explicit `sizeId`/);
    expect(contract).toMatch(/sizeId, sizeCode, sizeLabel/);
  });
  it("keeps legacy invoice history and legacy path intact during rollout", () => {
    expect(contract).toMatch(/must not be rewritten/);
    expect(contract).toMatch(/feature flag per business\/branch, default OFF/);
    expect(contract).toMatch(/Keep the existing RPC available/);
  });
  it("defines idempotent, atomic posting and return protections", () => {
    expect(contract).toMatch(/Same key with different payload is rejected/);
    expect(contract).toMatch(/cumulative returns cannot exceed source line quantity/);
    expect(contract).toMatch(/paired equal\/opposite movements/);
    expect(contract).toMatch(/commit or roll back together/);
  });
  it("prevents UNSORTED sales and offline overselling", () => {
    expect(contract).toMatch(/UNSORTED is never selectable/);
    expect(contract).toMatch(/can sell only against that allocation/);
    expect(contract).toMatch(/never force-posted/);
  });
});
