import { useMemo, useState } from "react";
import { FileText, Printer, X, Pencil, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "./api";
import { money } from "@/lib/store";
import { gstStateCode, orderFinancials } from "@/lib/wholesale-invoice";

export function WholesaleInvoiceButton({
  order,
  sellerName,
  sellerGst,
  sellerAddress,
  sellerStateCode: configuredSellerStateCode,
  buyerName,
  buyerDetails,
  transactions,
  returns,
  refunds,
  canEditPayment = false,
  onPaymentUpdated,
}: {
  order: any;
  sellerName: string;
  sellerGst?: string;
  sellerAddress?: string;
  sellerStateCode?: string;
  buyerName: string;
  buyerDetails?: any;
  transactions: any[];
  returns: any[];
  refunds: any[];
  canEditPayment?: boolean;
  onPaymentUpdated?: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false),
    [taxMode, setTaxMode] = useState<"cgst_sgst" | "igst">("cgst_sgst"),
    [buyerStateCode, setBuyerStateCode] = useState(() => {
      try {
        return localStorage.getItem("shopkeeper.invoice.buyerStateCode") || buyerDetails?.stateCode || "";
      } catch {
        return buyerDetails?.stateCode || "";
      }
    }),
    [editingPayment, setEditingPayment] = useState<any>(null),
    [paymentMessage, setPaymentMessage] = useState(""),
    [savingPayment, setSavingPayment] = useState(false);
  const finance = orderFinancials(order, transactions, returns, refunds),
    payments = transactions.filter((x: any) => x.request_id === order.id),
    invoice = "INV-" + order.id.slice(0, 8).toUpperCase(),
    sellerStateCode = configuredSellerStateCode || gstStateCode(sellerGst),
    effectiveBuyer = buyerDetails || order.buyerDetails || {},
    invoiceTax = useMemo(() => {
      const totals = order.items.reduce(
        (acc: any, item: any) => {
          const gross = Number(item.unit_price || 0) * Number(item.quantity || 0),
            rate = Number(item.gst_rate || 0),
            taxable = rate ? gross / (1 + rate / 100) : gross,
            gst = Math.max(0, gross - taxable);
          acc.taxable += taxable;
          acc.gst += gst;
          return acc;
        },
        { taxable: 0, gst: 0 },
      );
      totals.taxable = Math.round(totals.taxable * 100) / 100;
      totals.gst = Math.round(totals.gst * 100) / 100;
      totals.cgst = taxMode === "cgst_sgst" ? Math.round((totals.gst / 2) * 100) / 100 : 0;
      totals.sgst = taxMode === "cgst_sgst" ? Math.round((totals.gst / 2) * 100) / 100 : 0;
      totals.igst = taxMode === "igst" ? totals.gst : 0;
      return totals;
    }, [order.items, taxMode]);

  const missingHsn = order.items.some((item: any) => !String(item.hsn_code || "").trim());

  function print() {
    document.body.classList.add("printing-invoice");
    window.print();
    setTimeout(() => document.body.classList.remove("printing-invoice"), 300);
  }

  function saveBuyerStateCode(value: string) {
    const clean = value.replace(/\D/g, "").slice(0, 2);
    setBuyerStateCode(clean);
    try {
      localStorage.setItem("shopkeeper.invoice.buyerStateCode", clean);
    } catch {
      // Storage is optional; the invoice still works for the current session.
    }
  }

  async function savePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPayment) return;
    setSavingPayment(true);
    setPaymentMessage("");
    try {
      const f = new FormData(event.currentTarget);
      await api("/api/marketplace/payments/" + editingPayment.id + "/edit", {
        paymentStatus: f.get("paymentStatus"),
        amount: Number(f.get("amount") || 0),
        reference: f.get("reference"),
      });
      setEditingPayment(null);
      setPaymentMessage("Payment updated successfully.");
      await onPaymentUpdated?.();
    } catch (error) {
      setPaymentMessage((error as Error).message);
    } finally {
      setSavingPayment(false);
    }
  }

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <FileText size={16} />
        Invoice
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="invoice-dialog">
          <DialogTitle className="sr-only">Wholesale invoice {invoice}</DialogTitle>
          <DialogDescription className="sr-only">Order invoice and payment history</DialogDescription>
          <article className="invoice-sheet">
            <div className="invoice-actions">
              <button className="btn primary" onClick={print}>
                <Printer size={16} /> Print / save PDF
              </button>
              <button className="btn" onClick={() => setOpen(false)}>
                <X size={16} /> Close
              </button>
            </div>

            <header>
              <div>
                <span className="eyebrow">WHOLESALE INVOICE</span>
                <h2>{sellerName}</h2>
                {sellerGst && <small>GSTIN: {sellerGst}</small>}
                <small>State code: {sellerStateCode || "Not available"}</small>
              </div>
              <div>
                <b>{invoice}</b>
                <small>{new Date(Number(order.updated_at || order.created_at)).toLocaleDateString("en-IN")}</small>
              </div>
            </header>

            <section className="invoice-tax-controls">
              <label>
                GST type
                <select value={taxMode} onChange={(e) => setTaxMode(e.target.value as "cgst_sgst" | "igst")}>
                  <option value="cgst_sgst">CGST + SGST</option>
                  <option value="igst">IGST</option>
                </select>
              </label>
              <label>
                Seller state code
                <input value={sellerStateCode} readOnly placeholder="From GSTIN" />
              </label>
              <label>
                Customer state code
                <input value={buyerStateCode} inputMode="numeric" maxLength={2} onChange={(e) => saveBuyerStateCode(e.target.value)} placeholder="2 digit code" />
              </label>
            </section>

            <section className="invoice-parties">
              <div>
                <small>SUPPLIER</small>
                <b>{sellerName}</b>
                {sellerGst && <span>GSTIN: {sellerGst}</span>}
                <span>State code: {sellerStateCode || "—"}</span>
                {sellerAddress && <span>{sellerAddress}</span>}
              </div>
              <div>
                <small>CUSTOMER / VENDOR FOLIO</small>
                <b>{effectiveBuyer.name || buyerName}</b>
                {effectiveBuyer.phone && <span>Phone: {effectiveBuyer.phone}</span>}
                {effectiveBuyer.gstNumber && <span>GSTIN: {effectiveBuyer.gstNumber}</span>}
                <span>State code: {buyerStateCode || effectiveBuyer.stateCode || "—"}</span>
                {effectiveBuyer.address && <span>{effectiveBuyer.address}</span>}
              </div>
            </section>

            {missingHsn && (
              <div className="notice error invoice-warning">
                HSN code is missing on one or more products. Complete the product HSN before issuing a compliant invoice.
              </div>
            )}

            <p className="invoice-tax-note">
              Product/special discounts are applied to the order rate before GST. GST below is calculated from the post-discount GST-inclusive order rates, preserving the existing order payable amount.
            </p>

            <div className="table-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>#</th><th>Product</th><th>HSN</th><th>Qty</th><th>Rate after discount</th><th>GST</th><th>Taxable value</th><th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item: any, index: number) => {
                    const gross = Number(item.unit_price || 0) * Number(item.quantity || 0),
                      rate = Number(item.gst_rate || 0),
                      taxable = rate ? gross / (1 + rate / 100) : gross;
                    return (
                      <tr key={item.product_id}>
                        <td>{index + 1}</td>
                        <td>{item.name}</td>
                        <td>{item.hsn_code || "MISSING"}</td>
                        <td>{item.quantity} {item.unit}{item.weight ? " · " + item.weight : ""}</td>
                        <td>{money(Number(item.unit_price))}</td>
                        <td>{rate}%</td>
                        <td>{money(taxable)}</td>
                        <td>{money(gross)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <section className="invoice-totals invoice-credit-totals">
              <div><span>Taxable value after discount</span><b>{money(invoiceTax.taxable)}</b></div>
              {taxMode === "igst" ? (
                <div><span>IGST</span><b>{money(invoiceTax.igst)}</b></div>
              ) : (
                <>
                  <div><span>CGST</span><b>{money(invoiceTax.cgst)}</b></div>
                  <div><span>SGST</span><b>{money(invoiceTax.sgst)}</b></div>
                </>
              )}
              <div><span>GST included in order total</span><b>{money(invoiceTax.gst)}</b></div>
              <div><span>Order total</span><b>{money(finance.total)}</b></div>
              <div className="credit-row"><span>Return credit</span><b>−{money(finance.returnCredit)}</b></div>
              <div className="grand"><span>Net payable</span><b>{money(finance.payable)}</b></div>
              <div><span>Paid</span><b>{money(finance.paid)}</b></div>
              <div className={finance.refundDue ? "credit-row" : "due-row"}><span>{finance.refundDue ? "Refund due" : "Balance due"}</span><b>{money(finance.refundDue || finance.balance)}</b></div>
            </section>

            <h3>Payment history</h3>
            {paymentMessage && <p role="status" className="notice compact">{paymentMessage}</p>}
            <div className="table-scroll">
              <table className="ledger-table invoice-payment-table">
                <thead><tr><th>Date & time</th><th>Status</th><th>Amount</th><th>Reference</th>{canEditPayment && <th>Action</th>}</tr></thead>
                <tbody>
                  {payments.map((payment: any) => (
                    <tr key={payment.id}>
                      <td>{new Date(Number(payment.created_at)).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                      <td>{payment.payment_status}</td>
                      <td>{money(Number(payment.amount))}</td>
                      <td>{payment.reference || "—"}</td>
                      {canEditPayment && <td><button className="btn" type="button" onClick={() => { setEditingPayment(payment); setPaymentMessage(""); }}><Pencil size={14} /> Edit</button></td>}
                    </tr>
                  ))}
                  {!payments.length && <tr><td colSpan={canEditPayment ? 5 : 4}>No payment recorded</td></tr>}
                </tbody>
              </table>
            </div>

            {canEditPayment && editingPayment && (
              <form className="invoice-payment-editor" onSubmit={savePayment}>
                <div><b>Edit payment</b><small>#{editingPayment.id.slice(0, 8).toUpperCase()}</small></div>
                <label>Status<select name="paymentStatus" defaultValue={editingPayment.payment_status}><option value="pending">Pending</option><option value="partial">Partial</option><option value="paid">Paid</option></select></label>
                <label>Amount<input name="amount" type="number" min="0" step="0.01" defaultValue={Number(editingPayment.amount || 0)} /></label>
                <label>Reference<input name="reference" maxLength={200} defaultValue={editingPayment.reference || ""} /></label>
                <div className="actions"><button className="btn primary" disabled={savingPayment}><Save size={14} /> {savingPayment ? "Saving…" : "Save payment"}</button><button className="btn" type="button" onClick={() => setEditingPayment(null)}>Cancel</button></div>
              </form>
            )}

            <footer>Customer details, tax mode, state codes, credits and payment history are aligned for printing. Generated from ShopKeeper order and payment records.</footer>
          </article>
        </DialogContent>
      </Dialog>
    </>
  );
}
