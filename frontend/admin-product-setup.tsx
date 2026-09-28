import { useEffect, useMemo, useState } from "react";
import { Check, Download, Loader2, RefreshCw, Upload } from "lucide-react";
import { api } from "./api";

type CatalogRow = {
  key: string;
  name: string;
  mrp: string;
  category: string;
  subcategory: string;
  barcode: string;
  weight: string;
  unit: string;
  costPrice: string;
  sellingPrice: string;
  include: boolean;
};

const asText = (value: unknown) => value == null ? "" : String(value);
const asMoney = (value: unknown) => value == null || value === "" ? "" : String(value);

function fromCatalog(item: any): CatalogRow {
  return {
    key: String(item.key || crypto.randomUUID()),
    name: asText(item.name),
    mrp: asMoney(item.mrp),
    category: asText(item.category),
    subcategory: asText(item.subcategory),
    barcode: asText(item.barcode),
    weight: asText(item.weight),
    unit: asText(item.unit) || "piece",
    costPrice: "",
    sellingPrice: "",
    include: false,
  };
}

export function AdminProductSetup({ kind, businessId }: { kind: "vendor" | "wholesale"; businessId: string }) {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  async function loadCatalog() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api(`/api/admin/product-catalog?kind=${kind}`);
      setRows((result.items || []).map(fromCatalog));
      setLoaded(true);
      setMessage(result.items?.length ? `${result.items.length} unique products consolidated from all existing vendor stores.` : "No existing catalogue items were found.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setRows([]);
    setLoaded(false);
    setMessage("");
  }, [kind, businessId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row => (row.name + " " + row.category + " " + row.subcategory + " " + row.barcode).toLowerCase().includes(q));
  }, [rows, query]);

  const selected = rows.filter(row => row.include);
  const ready = selected.filter(row => row.name.trim() && row.unit.trim() && row.sellingPrice !== "" && Number.isFinite(Number(row.sellingPrice)) && Number(row.sellingPrice) > 0);

  function update(key: string, field: keyof CatalogRow, value: string | boolean) {
    setRows(current => current.map(row => row.key === key ? { ...row, [field]: value } : row));
  }

  function setAll(value: boolean) {
    setRows(current => current.map(row => ({ ...row, include: value })));
  }

  async function importProducts() {
    if (!ready.length) {
      setMessage("Select products and enter a selling price before importing.");
      return;
    }
    const invalid = ready.find(row => row.mrp !== "" && Number(row.sellingPrice) > Number(row.mrp));
    if (invalid && kind === "vendor") {
      setMessage(`Selling price cannot exceed MRP for ${invalid.name}.`);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await api(`/api/admin/businesses/${kind}/${encodeURIComponent(businessId)}/catalog-import`, {
        items: ready.map(row => ({
          name: row.name.trim(),
          mrp: row.mrp === "" ? null : Number(row.mrp),
          category: row.category.trim() || "General",
          subcategory: row.subcategory.trim(),
          barcode: row.barcode.trim(),
          weight: row.weight.trim(),
          unit: row.unit.trim() || "piece",
          costPrice: row.costPrice === "" ? null : Number(row.costPrice),
          sellingPrice: Number(row.sellingPrice),
        })),
      });
      setRows(current => current.map(row => ready.some(item => item.key === row.key) ? { ...row, include: false } : row));
      setMessage(`${result.imported} products imported into this ${kind === "vendor" ? "vendor store" : "wholesale shop"}.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const header = "Product name,MRP,Category,Sub category,Barcode,Weight,Pack/Unit,Cost price,Selling price\n";
    const url = URL.createObjectURL(new Blob([header], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `shopkeeper-${kind}-product-setup-template.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="panel padded admin-product-setup">
      <div className="panel-heading">
        <div>
          <h3>Product setup</h3>
          <p>Consolidated unique items from existing {kind === "vendor" ? "vendor" : "wholesale"} catalogues. Stock starts at 0 and pricing fields are intentionally blank for this new shop.</p>
        </div>
        <div className="actions">
          <button className="btn" type="button" onClick={downloadTemplate}><Download size={16}/> Template</button>
          <button className="btn primary" type="button" onClick={() => void loadCatalog()} disabled={busy}>
            {busy ? <Loader2 className="spin" size={16}/> : <RefreshCw size={16}/>} {loaded ? "Refresh catalogue" : "Load catalogue"}
          </button>
        </div>
      </div>

      {loaded && rows.length > 0 && <>
        <div className="admin-product-toolbar">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search product, category or barcode" aria-label="Search product catalogue" />
          <span>{selected.length} selected · {ready.length} ready to import</span>
          <button className="text-button" type="button" onClick={() => setAll(true)}>Select all</button>
          <button className="text-button" type="button" onClick={() => setAll(false)}>Clear</button>
        </div>
        <div className="table-scroll admin-product-table-wrap">
          <table className="ledger-table admin-product-table">
            <thead><tr>
              <th><input type="checkbox" checked={rows.length > 0 && selected.length === rows.length} onChange={e => setAll(e.target.checked)} aria-label="Select all products" /></th>
              <th>Product name</th><th>MRP</th><th>Category</th><th>Sub category</th><th>Barcode</th><th>Weight</th><th>Pack / Unit</th><th>Cost price</th><th>Selling price</th><th>Stock</th>
            </tr></thead>
            <tbody>
              {shown.map(row => <tr key={row.key}>
                <td><input type="checkbox" checked={row.include} onChange={e => update(row.key, "include", e.target.checked)} aria-label={`Select ${row.name}`} /></td>
                {(["name","mrp","category","subcategory","barcode","weight","unit","costPrice","sellingPrice"] as const).map(field => (
                  <td key={field}><input className="table-input" inputMode={field === "mrp" || field === "costPrice" || field === "sellingPrice" ? "decimal" : undefined} value={row[field]} onChange={e => update(row.key, field, e.target.value)} /></td>
                ))}
                <td><span className="stock-zero">0</span></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="admin-product-footer">
          <span>Only selected rows with a selling price are imported. Existing products with the same barcode are skipped.</span>
          <button className="btn primary" type="button" disabled={busy || !ready.length} onClick={() => void importProducts()}><Upload size={16}/> Import {ready.length} products</button>
        </div>
      </>}

      {!loaded && <div className="admin-product-empty"><Check size={18}/><span>Load the consolidated catalogue after creating the shop, fill the required pricing details, then import the selected products.</span></div>}
      {loaded && !rows.length && <div className="admin-product-empty"><span>No source products are available yet. You can use the template to prepare products for a future import.</span></div>}
      {message && <p role="status" className="status-message">{message}</p>}
    </section>
  );
}
