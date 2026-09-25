import { useState } from "react";
import { money } from "@/lib/store";

type Vendor = { id: string; name: string; contact_name: string; phone: string; address: string; notes: string; balance: number };
type Entry = { id: string; vendor_id: string; kind: "sale" | "payment" | "refund"; amount: number; note: string; created_at: number };
const blank = { name: "", contactName: "", phone: "", address: "", notes: "" };

export function OfflineVendors({ vendors, ledger, canEdit, canPay, save }: {
  vendors: Vendor[]; ledger: Entry[]; canEdit: boolean; canPay: boolean;
  save: (path: string, body: any) => Promise<any>;
}) {
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState({ ...blank, id: "" });
  const vendor = vendors.find((v) => v.id === selected);
  const entries = ledger.filter((e) => e.vendor_id === selected);
  return <section className="panel padded offline-vendors">
    <div className="panel-heading"><div><h2>Vendors outside ShopKeeper</h2><p>Keep local shop contact details and an independent payment record. These contacts cannot see your online catalogue or place app orders.</p></div><span className="badge green">{vendors.length} contacts</span></div>
    <div className="offline-vendor-grid">
      <div className="offline-vendor-list">
        {vendors.map((v) => <button key={v.id} type="button" className={selected === v.id ? "offline-vendor active" : "offline-vendor"} onClick={() => { setSelected(v.id); setDraft({ id: v.id, name: v.name, contactName: v.contact_name, phone: v.phone, address: v.address, notes: v.notes }); }}>
          <b>{v.name}</b><small>{v.phone || v.contact_name || "No phone saved"}</small><span>{Number(v.balance) > 0 ? money(Number(v.balance)) + " pending" : Number(v.balance) < 0 ? money(-Number(v.balance)) + " credit" : "Settled"}</span>
        </button>)}
        {!vendors.length && <p className="empty-inline">Add a local vendor to keep their contact and payments together.</p>}
        {canEdit && <button type="button" className="btn" onClick={() => {setSelected(""); setDraft({ ...blank, id: "" });}}>+ New local vendor</button>}
      </div>
      <div className="offline-vendor-details">
        {canEdit && <form className="form offline-contact-form" onSubmit={(e) => { e.preventDefault(); void save("/api/wholesale/offline-vendors", draft).then((result) => { if (result?.savedVendorId) {setSelected(result.savedVendorId); setDraft({ ...draft, id: result.savedVendorId });} }); }}>
          <h3>{draft.id ? "Edit vendor contact" : "Add vendor contact"}</h3>
          <label>Business name<input required maxLength={160} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label>Contact person<input maxLength={160} value={draft.contactName} onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} /></label>
          <label>Phone<input type="tel" maxLength={40} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
          <label>Address<input maxLength={400} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></label>
          <label>Notes<textarea maxLength={500} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
          <button className="btn primary">Save contact</button>
        </form>}
        {vendor && <div className="offline-ledger">
          <h3>{vendor.name} · payment record</h3>
          <p><b>Current balance: {money(Number(vendor.balance))}</b></p>
          {canPay && <form className="offline-entry-form" onSubmit={(e) => {e.preventDefault(); const form = e.currentTarget, f = new FormData(form); void save(`/api/wholesale/offline-vendors/${vendor.id}/ledger`, { kind: f.get("kind"), amount: Number(f.get("amount")), note: f.get("note") }).then((result) => { if (result) form.reset(); });}}>
            <label>Record type<select name="kind"><option value="sale">Sale / amount due</option><option value="payment">Payment received</option><option value="refund">Refund paid</option></select></label>
            <label>Amount ₹<input name="amount" type="number" min="0.01" step="0.01" required /></label>
            <label>Reference / note<input name="note" maxLength={300} placeholder="Invoice, cash or UPI reference" /></label>
            <button className="btn primary">Add record</button>
          </form>}
          <div className="offline-entry-list">{entries.map((e) => <div className="record-row" key={e.id}><div><b>{e.kind === "sale" ? "Sale / due" : e.kind === "payment" ? "Payment received" : "Refund paid"}</b><small>{new Date(Number(e.created_at)).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{e.note ? " · " + e.note : ""}</small></div><b>{money(Number(e.amount))}</b></div>)}{!entries.length && <p className="empty-inline">No payments or sales recorded yet.</p>}</div>
        </div>}
      </div>
    </div>
  </section>;
}
