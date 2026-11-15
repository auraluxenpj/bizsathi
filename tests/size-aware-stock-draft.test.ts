import { describe, expect, it } from "vitest";

// Contract-level guardrails for the draft schema. These tests validate the
// migration artifact only; database integration tests belong to isolated staging.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), ".lovable/drafts/size-aware-stock/0001_size_aware_stock_additive_draft.sql"),
  "utf8",
);

describe("size-aware stock draft migration safety", () => {
  it("is explicitly marked draft-only", () => {
    expect(migration).toMatch(/DRAFT ONLY/);
    expect(migration).toMatch(/do not execute/i);
  });
  it("does not rewrite legacy stock or commerce functions", () => {
    expect(migration).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.(stock_movements|commerce_stock_movements|commerce_documents)/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.(stock_movements|commerce_stock_movements|commerce_documents)/i);
  });
  it("keeps existing variant identity and references size as a separate dimension", () => {
    expect(migration).toMatch(/REFERENCES public\.product_variants\(business_id,id\)/);
    expect(migration).toMatch(/size_id uuid NOT NULL/);
    expect(migration).not.toMatch(/CREATE TABLE public\.product_variants/i);
  });
  it("protects tenant and branch access and append-only evidence", () => {
    expect(migration.match(/ENABLE ROW LEVEL SECURITY/g)?.length).toBe(4);
    expect(migration).toMatch(/public\.can_access_branch\(business_id,branch_id\)/);
    expect(migration).toMatch(/variant_size_stock_immutable/);
    expect(migration).toMatch(/size_stock_migration_map_immutable_delete/);
    expect(migration).toMatch(/guard_size_stock_migration_map_update/);
    expect(migration).toMatch(/UNIQUE \(business_id,idempotency_key\)/);
  });
  it("keeps reservations outside the physical movement ledger", () => {
    expect(migration).not.toMatch(/reservation_release/);
    expect(migration).toMatch(/Reservation holds and offline counter allocations are separate state tables/);
  });
  it("does not seed or backfill unverified size assignments", () => {
    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\.(size_master|product_size_options|size_stock_migration_map)/i);
    expect(migration).toMatch(/never guessed from category/i);
  });
});
