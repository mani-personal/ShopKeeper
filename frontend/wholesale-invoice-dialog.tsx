import { useState } from "react";
import { FileText, Printer, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { money } from "@/lib/store";
import { orderFinancials } from "@/lib/wholesale-invoice";

export function WholesaleInvoiceButton({
  order,
  sellerName,
  buyerName,
  transactions,
  returns,
  refunds,
}: {
  order: any;
  sellerName: string;
  buyerName: string;
  transactions: any[];
  returns: any[];
  refunds: any[];
}) {
  const [open, setOpen] = useState(false),
    finance = orderFinancials(order, transactions, returns, refunds),
    payments = transactions.filter((x: any) => x.request_id === order.id),
    invoice = "INV-" + order.id.slice(0, 8).toUpperCase();
  function print() {
    document.body.classList.add("printing-invoice");
    window.print();
    setTimeout(() => document.body.classList.remove("printing-invoice"), 300);
  }
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <FileText size={16} />
        Invoice
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="invoice-dialog">
          <DialogTitle className="sr-only">
            Wholesale invoice {invoice}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Order invoice and payment history
          </DialogDescription>
          <article className="invoice-sheet">
            <div className="invoice-actions">
              <button className="btn primary" onClick={print}>
                <Printer size={16} />
                Print / save PDF
              </button>
              <button className="btn" onClick={() => setOpen(false)}>
                <X size={16} />
                Close
              </button>
            </div>
            <header>
              <div>
                <span className="eyebrow">WHOLESALE INVOICE</span>
                <h2>{sellerName}</h2>
              </div>
              <div>
                <b>{invoice}</b>
                <small>
                  {new Date(
                    Number(order.updated_at || order.created_at),
                  ).toLocaleDateString("en-IN")}
                </small>
              </div>
            </header>
            <section className="invoice-parties">
              <div>
                <small>SUPPLIER</small>
                <b>{sellerName}</b>
              </div>
              <div>
                <small>VENDOR</small>
                <b>{buyerName}</b>
              </div>
            </section>
            <div className="table-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Unit price</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item: any, index: number) => (
                    <tr key={item.product_id}>
                      <td>{index + 1}</td>
                      <td>{item.name}</td>
                      <td>
                        {item.quantity} {item.unit}
                      </td>
                      <td>{money(Number(item.unit_price))}</td>
                      <td>
                        {money(Number(item.unit_price) * Number(item.quantity))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <section className="invoice-totals">
              <div>
                <span>Products</span>
                <b>{money(finance.total)}</b>
              </div>
              <div>
                <span>Return credit</span>
                <b>−{money(finance.returnCredit)}</b>
              </div>
              <div className="grand">
                <span>Net payable</span>
                <b>{money(finance.payable)}</b>
              </div>
              <div>
                <span>Paid</span>
                <b>{money(finance.paid)}</b>
              </div>
              <div>
                <span>{finance.refundDue ? "Refund due" : "Balance due"}</span>
                <b>{money(finance.refundDue || finance.balance)}</b>
              </div>
            </section>
            <h3>Payment history</h3>
            <div className="table-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment: any) => (
                    <tr key={payment.id}>
                      <td>
                        {new Date(
                          Number(payment.created_at),
                        ).toLocaleDateString("en-IN")}
                      </td>
                      <td>{payment.payment_status}</td>
                      <td>{money(Number(payment.amount))}</td>
                      <td>{payment.reference || "—"}</td>
                    </tr>
                  ))}
                  {!payments.length && (
                    <tr>
                      <td colSpan={4}>No payment recorded</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer>
              Generated from ShopKeeper order and payment records.
            </footer>
          </article>
        </DialogContent>
      </Dialog>
    </>
  );
}
