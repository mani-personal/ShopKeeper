import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { money, supplierAccounts, supplierKey, type State } from "@/lib/store";
import { SupplierAccounts } from "./supplier-accounts";
import { VendorWholesale } from "./vendor-wholesale";

export function SupplyHub({ s, vendorId, busy, save, onAddSupplier }: { s: State; vendorId: string; busy: boolean; save: (a: any) => Promise<any>; onAddSupplier: () => void }) {
  const [tab, setTab] = useState("Wholesale Market");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const accounts = supplierAccounts(s);
  const chosen = s.suppliers.find(x => supplierKey(x.name) === selectedSupplier);
  const account = accounts.find(x => x.key === selectedSupplier);
  const activity = selectedSupplier ? [
    ...s.purchases.filter(x => supplierKey(x.supplier) === selectedSupplier).map(x => ({ id: 'purchase-' + x.id, date: x.date, type: 'Purchase', details: `${x.product} × ${x.qty}${x.paidAmount === undefined ? ' · payment status unknown' : ' · initially paid ' + money(x.paidAmount)}`, amount: x.total })),
    ...(s.supplierReturns ?? []).filter(x => supplierKey(x.supplier) === selectedSupplier).map(x => ({ id: 'return-' + x.id, date: x.date, type: 'Return credit', details: `${x.product} × ${x.qty} · ${x.reason}`, amount: x.amount })),
    ...(s.supplierPayments ?? []).filter(x => supplierKey(x.supplier) === selectedSupplier).map(x => ({ id: 'payment-' + x.id, date: x.date, type: x.direction === 'payment' ? 'Paid to supplier' : 'Refund received', details: x.reference || 'No reference', amount: x.amount })),
  ].sort((a, b) => b.date.localeCompare(a.date)) : [];
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
    {tab === "Local suppliers" && <><section className="panel">
      <div className="panel-heading"><div><h2>Local suppliers</h2><p>Contacts who do not use the wholesale marketplace.</p></div><button className="btn primary" onClick={onAddSupplier}><Plus size={16} /> Add supplier</button></div>
      <div className="local-supplier-list">{s.suppliers.map(item => {
        const key = supplierKey(item.name), summary = accounts.find(x => x.key === key);
        const purchases = s.purchases.filter(x => supplierKey(x.supplier) === key);
        const count = purchases.length + (s.supplierReturns ?? []).filter(x => supplierKey(x.supplier) === key).length + (s.supplierPayments ?? []).filter(x => supplierKey(x.supplier) === key).length;
        return <button key={item.id} type="button" className={'local-supplier-row' + (selectedSupplier === key ? ' active' : '')} aria-expanded={selectedSupplier === key} aria-controls="local-supplier-history" onClick={() => setSelectedSupplier(selectedSupplier === key ? '' : key)}>
          <span className="local-supplier-identity"><b>{item.name}</b><small>{item.phone || 'No phone recorded'}</small></span>
          <span><small>Transactions</small><b>{count}</b></span>
          <span><small>Purchases</small><b>{money(purchases.reduce((total, p) => total + p.total, 0))}</b></span>
          <span><small>Paid</small><b>{money(summary?.paid ?? 0)}</b></span>
          <span><small>You owe</small><b>{money(summary?.pending ?? 0)}</b></span>
          <ChevronDown size={17} className={selectedSupplier === key ? 'expanded' : ''} aria-hidden="true" />
        </button>;
      })}{!s.suppliers.length && <p className="empty-inline">Add a local supplier to keep their details here.</p>}</div>
    </section>
    {chosen && <section className="panel" id="local-supplier-history" aria-label={chosen.name + ' transactions'}>
      <div className="panel-heading"><div><h2>{chosen.name} · Transaction history</h2><p>{chosen.phone || 'No phone recorded'} · {activity.length} transactions</p></div></div>
      {account && <div className="local-supplier-summary"><span>Paid <b>{money(account.paid)}</b></span><span>Return credits <b>{money(account.credits)}</b></span><span>Refunds received <b>{money(account.refunded)}</b></span><span>You owe <b>{money(account.pending)}</b></span><span>Supplier credit <b>{money(account.credit)}</b></span></div>}
      {!!account?.unknown && <p className="notice">{account.unknown} older purchase(s) have an unknown payment status and are excluded from the balance. Reconcile them under Supplier balances in Wholesale Market.</p>}
      <div className="table-scroll"><table className="ledger-table"><thead><tr><th>Date and time</th><th>Type</th><th>Transaction details</th><th>Amount</th></tr></thead><tbody>{activity.map(item => <tr key={item.id}><td>{new Date(item.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</td><td>{item.type}</td><td>{item.details}</td><td>{money(item.amount)}</td></tr>)}</tbody></table>{!activity.length && <p className="empty-inline">No transactions recorded for this supplier yet.</p>}</div>
    </section>}</>}
  </div>;
}
