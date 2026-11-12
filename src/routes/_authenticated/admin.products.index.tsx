import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { mapRows, matchProduct, parseCsv } from "@/lib/csv-import";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllProducts, productImage, type Product } from "@/lib/data";
import { useMoney } from "@/lib/store";
import { isProductSku } from "@/lib/product-information";

export const Route = createFileRoute("/_authenticated/admin/products/")({
  head: () => ({ meta: [
    { title: "Products — Auraluxe Admin" },
    { name: "description", content: "Manage Auraluxe products, SKUs and catalogue imports." },
    { property: "og:title", content: "Products — Auraluxe Admin" },
    { property: "og:description", content: "Manage Auraluxe products and catalogue imports." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ProductsList,
});

function ProductsList() {
  const money = useMoney();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data: products = [], isLoading } = useQuery({ queryKey: ["admin", "products"], queryFn: fetchAllProducts });

  const refresh = () => qc.invalidateQueries();

  const togglePublish = useMutation({
    mutationFn: async (p: Product) => {
      if (!p.is_published && (!p.sku || !isProductSku(p.sku))) throw new Error("Edit this product and fill its AL garment-type SKU before publishing");
      const { error } = await supabase.from("products").update({ is_published: !p.is_published }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (p: Product) => {
      await supabase.from("product_variants").delete().eq("product_id", p.id);
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Product deleted"); refresh(); },
    onError: () => toast.error("Couldn't delete — this product has orders. Unpublish it instead."),
  });

  const duplicate = useMutation({
    mutationFn: async (p: Product) => {
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = p;
      const suffix = Math.random().toString(36).slice(2, 6);
      const { error } = await supabase.from("products").insert({
        ...rest,
        name: `${p.name} (copy)`,
        slug: `${p.slug}-${suffix}`,
        sku: null,
        is_published: false,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Draft copy created — fill its final SKU identifier before publishing"); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const list = products.filter((p) => `${p.name} ${p.sku ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  // ---------- Bulk selection ----------
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const allSelected = list.length > 0 && list.every((p) => selected.includes(p.id));

  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () => setSelected(allSelected ? [] : list.map((p) => p.id));

  const bulkDelete = async () => {
    const targets = products.filter((p) => selected.includes(p.id));
    if (targets.length === 0) return;
    if (!confirm(`Delete ${targets.length} product${targets.length > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkBusy(true);
    let deleted = 0;
    const failed: string[] = [];
    for (const p of targets) {
      await supabase.from("product_variants").delete().eq("product_id", p.id);
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) failed.push(p.name); else deleted++;
    }
    setBulkBusy(false);
    setSelected([]);
    if (deleted) toast.success(`${deleted} product${deleted > 1 ? "s" : ""} deleted`);
    if (failed.length) {
      toast.error(
        `${failed.length} couldn't be deleted (they likely have orders). Unpublish them instead: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}`,
      );
    }
    refresh();
  };

  const bulkUnpublish = async () => {
    if (selected.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase.from("products").update({ is_published: false }).in("id", selected);
    setBulkBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selected.length} product${selected.length > 1 ? "s" : ""} unpublished`);
    setSelected([]);
    refresh();
  };

  const exportCsv = () => {
    const headers = ["Name", "SKU", "Model Code", "Slug", "Category ID", "Price", "Sale Price", "Stock", "Low Stock Threshold", "Sizes", "Colours", "Fabric", "Published", "New Arrival", "Best Seller", "Featured", "Created"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = products.map((p) => [
      p.name, p.sku, p.model_code, p.slug, p.category_id, p.price, p.sale_price, p.stock, p.low_stock_threshold,
      (p.sizes ?? []).join(" | "), (p.colors ?? []).join(" | "), p.fabric,
      p.is_published ? "Yes" : "No", p.is_new ? "Yes" : "No", p.is_bestseller ? "Yes" : "No", p.is_featured ? "Yes" : "No",
      p.created_at,
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auraluxe-products-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${products.length} products`);
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  const importCsv = async (file: File) => {
    setImporting(true);
    setReport(null);
    try {
      const { data: cats } = await supabase.from("categories").select("id,name,slug");
      const rows = mapRows(parseCsv(await file.text()), cats ?? []);
      if (rows.length === 0) throw new Error("No product rows found in the file");
      // Show what the file would do before anything is written, so a sheet that does not match the live products cannot silently add hundreds of duplicates.
      const plan = { create: 0, update: 0, skip: 0 };
      for (const r of rows) { if (r.error) { plan.skip++; continue; } const f = matchProduct(products, r.data); if (f.kind === "ambiguous") plan.skip++; else if (f.kind === "match") plan.update++; else plan.create++; }
      if (!window.confirm(`This file will add ${plan.create} new products, update ${plan.update} existing products and skip ${plan.skip} rows. Continue?`)) { setReport({ created: 0, updated: 0, errors: ["Import cancelled. Nothing was changed."] }); return; }
      let created = 0, updated = 0;
      const errors: string[] = [];
      for (const r of rows) {
        if (r.error) { errors.push(`Row ${r.line}: ${r.error}`); continue; }
        const d: any = r.data;
        const found = matchProduct(products, d);
        if (found.kind === "ambiguous") {
          errors.push(`Row ${r.line}: skipped, that ${found.by === "sku" ? "SKU" : "model code"} matches ${found.count} products. Add the exact SKU for the one you mean`);
          continue;
        }
        const match = found.kind === "match" ? found.product : undefined;
        if ((!match || (d.sku && d.sku !== match["sku"])) && (!d.sku || !isProductSku(d.sku))) {
          errors.push(`Row ${r.line}: SKU "${d.sku ?? ""}" is not in the AL-TYPE-001 style, e.g. AL-KURTI-001 or AL-K-001`);
          continue;
        }
        if (match) {
          const { slug: _s, ...upd }: any = d;
          const { error } = await supabase.from("products").update(upd).eq("id", match.id);
          if (error) errors.push(`Row ${r.line}: ${error.message}`); else updated++;
        } else {
          if (!d.name || d.price == null) { errors.push(`Row ${r.line}: new products need Name and Price`); continue; }
          const { error } = await supabase.from("products").insert(d as any);
          if (error) errors.push(`Row ${r.line}: ${error.message}`); else created++;
        }
      }
      setReport({ created, updated, errors });
      toast.success(`Import done: ${created} added, ${updated} updated`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Products</h1>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={importing} className="rounded-full border border-border px-5 py-2.5 text-[12px] uppercase tracking-[0.15em] disabled:opacity-50">
            {importing ? "Importing…" : "Import CSV"}
          </button>
          <button onClick={exportCsv} disabled={products.length === 0} className="rounded-full border border-border px-5 py-2.5 text-[12px] uppercase tracking-[0.15em] disabled:opacity-50">
            Export CSV
          </button>
          <Link to="/admin/products/quick" className="rounded-full border border-border px-5 py-2.5 text-[12px] uppercase tracking-[0.15em]">
            Smart add
          </Link>
          <Link to="/admin/products/$id" params={{ id: "new" }} className="rounded-full bg-primary px-5 py-2.5 text-[12px] uppercase tracking-[0.15em] text-primary-foreground">
            Add product
          </Link>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Import tip: export first, edit in Excel, then import. Rows matching an existing SKU (or slug, or Model Code) are updated; others become new products (need Name and Price). Separate sizes/colours/image links with "|". Category can be a name like "Kurtis".
      </p>
      {report ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p>{report.created} added · {report.updated} updated · {report.errors.length} skipped</p>
          {report.errors.length ? <ul className="mt-2 list-disc pl-5 text-xs text-destructive">{report.errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
        </div>
      ) : null}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or SKU" className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm" />
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {list.length > 0 ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4" />
            Select all ({list.length})
          </label>
          {selected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-sm font-medium">{selected.length} selected</span>
              <button onClick={() => setSelected([])} disabled={bulkBusy} className="rounded-full border border-border px-3 py-2 disabled:opacity-50">Clear</button>
              <button onClick={bulkUnpublish} disabled={bulkBusy} className="rounded-full border border-border px-3 py-2 disabled:opacity-50">Unpublish selected</button>
              <button onClick={bulkDelete} disabled={bulkBusy} className="rounded-full bg-destructive px-3 py-2 text-destructive-foreground disabled:opacity-50">
                {bulkBusy ? "Working…" : "Delete selected"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        {list.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-3">
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={() => toggleOne(p.id)}
              aria-label={`Select ${p.name}`}
              className="h-4 w-4 shrink-0"
            />
            <img src={productImage(p)} alt={p.name} className="h-16 w-14 rounded-lg object-cover" loading="lazy" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {p.sku ?? "No SKU"} · {money(Number(p.sale_price ?? p.price))} · {p.stock} in stock · {p.is_published ? "Live" : "Hidden"}
              </p>
              {!p.sku || !isProductSku(p.sku) ? <p className="text-xs text-muted-foreground">SKU format needs admin review</p> : null}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link to="/admin/products/$id" params={{ id: p.id }} className="rounded-full bg-secondary px-3 py-2">Edit</Link>
              <button onClick={() => togglePublish.mutate(p)} className="rounded-full border border-border px-3 py-2">{p.is_published ? "Unpublish" : "Publish"}</button>
              <button onClick={() => duplicate.mutate(p)} className="rounded-full border border-border px-3 py-2">Duplicate</button>
              <button onClick={() => confirm(`Delete "${p.name}"?`) && remove.mutate(p)} className="rounded-full border border-destructive/40 px-3 py-2 text-destructive">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
