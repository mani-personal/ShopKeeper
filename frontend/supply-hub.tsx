import { useState } from "react";
import { Plus } from "lucide-react";
import type { State } from "@/lib/store";
import { SupplierAccounts } from "./supplier-accounts";
import { VendorWholesale } from "./vendor-wholesale";

export function SupplyHub({ s, vendorId, busy, save, onAddSupplier }: { s: State; vendorId: string; busy: boolean; save: (a: any) => Promise<any>; onAddSupplier: () => void }) {
  const [tab, setTab] = useState("Wholesale Market");
  return <div className="supply-hub">
    <div className="panel padded supply-intro">
      <span className="eyebrow">BUY & MANAGE STOCK</span>
      <h2>Supply hub</h2>
      <p>Buy from wholesalers, or keep local supplier contacts and balances.</p>
      <div className="console-tabs" role="tablist" aria-label="Supply hub sections">
        {["Wholesale Market", "Local suppliers"].map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
      </div>
    </div>
    {tab === "Wholesale Market" && <><VendorWholesale vendorId={vendorId} /><section className="panel padded"><h2>Supplier balances</h2><p>Review payments and returns alongside your wholesale orders and local supplier purchases.</p></section><SupplierAccounts key={vendorId} s={s} busy={busy} save={save} /></>}
    {tab === "Local suppliers" && <section className="panel">
      <div className="panel-heading"><div><h2>Local suppliers</h2><p>Contacts who do not use the wholesale marketplace.</p></div><button className="btn primary" onClick={onAddSupplier}><Plus size={16} /> Add supplier</button></div>
      <div className="table-scroll"><table className="ledger-table"><thead><tr><th>Name</th><th>Phone</th></tr></thead><tbody>{s.suppliers.map((item) => <tr key={item.id}><td><b>{item.name}</b></td><td>{item.phone || "—"}</td></tr>)}</tbody></table>{!s.suppliers.length && <p className="empty-inline">Add a local supplier to keep their details here.</p>}</div>
    </section>}
  </div>;
}
