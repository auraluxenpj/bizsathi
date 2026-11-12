import { describe, it, expect } from "vitest";
import { mapRows, parseCsv } from "./csv-import";
const csv = `Name,SKU,Model Code,Slug,Category ID,Price,Sale Price,Stock,Low Stock Threshold,Sizes,Colours,Fabric,Published,New Arrival,Best Seller,Featured,Created
ANUSHREE01,AL-KURTI-001,AURA LUXE01,anushree01-aura-luxe01,Kurti set 3 Piece,2020,1999,1,2,"M, L, XL, 2XL, 3XL",,,TRUE,FALSE,FALSE,FALSE,Sept 2025
PARTY 1,al-partywear-076,AURA LUXE76,party-1,Party Wear,5000,4500,3,2,M|L,Red; Blue,,TRUE,FALSE,TRUE,FALSE,Oct 2025
SAREE 1,AL-SAREE-009,,saree-1,Festive/Party wear,3500,,2,1,Free size,,,TRUE,FALSE,FALSE,FALSE,Oct 2025`;
const cats = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Kurti set 3 Piece", slug: "kurti-set-3-piece" },
  { id: "00000000-0000-4000-8000-000000000002", name: "Partywear", slug: "partywear" },
];
const rows = mapRows(parseCsv(csv), cats);
describe("The Aura Luxe Inventory Format - Web sheet", () => {
  it("accepts AL-KURTI-001 style SKUs and normalizes them", () => {
    expect(rows[0]!.data.sku).toBe("AL-KURTI-001"); expect(rows[1]!.data.sku).toBe("AL-PARTYWEAR-076");
  });
  it("turns a category NAME in the Category ID column into the category id", () => {
    expect(rows[0]!.data.category_id).toBe(cats[0]!.id);
    expect(rows[1]!.data.category_id).toBe(cats[1]!.id); // "Party Wear" matches "Partywear" ignoring spacing
  });
  it("reports an unknown category by name instead of sending a bad id to the database", () => {
    expect(rows[2]!.error).toBe('Unknown category "Festive/Party wear"');
  });
  it("still accepts a real category id", () => {
    const [r] = mapRows(parseCsv(`Name,SKU,Category ID,Price\nA,AL-K-001,${cats[0]!.id},10`), cats);
    expect(r!.data.category_id).toBe(cats[0]!.id); expect(r!.error).toBeUndefined();
  });
  it("splits sizes typed with commas, bars or semicolons into separate sizes", () => {
    expect(rows[0]!.data.sizes).toEqual(["M", "L", "XL", "2XL", "3XL"]);
    expect(rows[1]!.data.sizes).toEqual(["M", "L"]); expect(rows[1]!.data.colors).toEqual(["Red", "Blue"]);
  });
  it("reads model code, stock, prices and flags", () => {
    expect(rows[0]!.data).toMatchObject({ model_code: "AURA LUXE01", stock: 1, price: 2020, sale_price: 1999, low_stock_threshold: 2, is_published: true, is_new: false });
    expect("created" in rows[0]!.data).toBe(false);
  });
  it("rejects a model code longer than 64 characters", () => {
    const [r] = mapRows(parseCsv(`Name,SKU,Model Code,Price\nA,AL-K-001,${"x".repeat(65)},10`), cats);
    expect(r!.error).toMatch(/64 characters/);
  });
});
