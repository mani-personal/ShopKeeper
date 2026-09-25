export type WholesaleOrder = {
  id: string;
  created_at: number;
  updated_at?: number;
  status: string;
  vendorName?: string;
  business_name?: string;
  quoted_total?: number;
  total?: number;
  item_total?: number;
  delivery_fee?: number;
  items: any[];
};

const amount = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escape = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => entities[c]);
const rupees = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    amount(value),
  );

export function orderFinancials(
  order: WholesaleOrder,
  transactions: any[] = [],
  returns: any[] = [],
  refunds: any[] = [],
) {
  const orderTransactions = transactions.filter(
    (x) => x.request_id === order.id,
  );
  const paid = amount(
    orderTransactions
      .filter((x) => ["paid", "partial"].includes(x.payment_status))
      .reduce((n, x) => n + Number(x.amount), 0),
  );
  const returnCredit = amount(
    returns
      .filter((x) => x.request_id === order.id && x.status === "received")
      .reduce((n, x) => n + Number(x.quantity) * Number(x.unit_price), 0),
  );
  const processedRefund = amount(
    refunds
      .filter(
        (x) =>
          x.status === "processed" &&
          orderTransactions.some((t) => t.id === x.transaction_id),
      )
      .reduce((n, x) => n + Number(x.amount), 0),
  );
  const total = amount(
    order.item_total ??
      order.total ??
      order.items.reduce(
        (n, x) => n + Number(x.quantity) * Number(x.unit_price),
        0,
      ),
  );
  const payable = amount(Math.max(0, total - returnCredit));
  const netPaid = amount(Math.max(0, paid - processedRefund));
  return {
    total,
    paid: netPaid,
    returnCredit,
    processedRefund,
    payable,
    balance: amount(Math.max(0, payable - netPaid)),
    refundDue: amount(Math.max(0, netPaid - payable)),
    transactions: orderTransactions,
  };
}

export function openWholesaleInvoice({
  order,
  sellerName,
  buyerName,
  transactions = [],
  returns = [],
  refunds = [],
}: {
  order: WholesaleOrder;
  sellerName: string;
  buyerName: string;
  transactions?: any[];
  returns?: any[];
  refunds?: any[];
}) {
  if (!["delivered", "completed"].includes(order.status))
    throw Error("Invoice is available after delivery.");
  const f = orderFinancials(order, transactions, returns, refunds),
    invoice = "WS-" + order.id.slice(0, 8).toUpperCase(),
    date = new Date(
      Number(order.updated_at || order.created_at),
    ).toLocaleDateString("en-IN"),
    rows = order.items
      .map(
        (x: any, i: number) =>
          `<tr><td>${i + 1}</td><td>${escape(x.name)}</td><td>${escape(x.quantity)} ${escape(x.unit)}${x.weight?" · "+escape(x.weight):""}</td><td>${rupees(Number(x.unit_price))}</td><td>${rupees(Number(x.quantity) * Number(x.unit_price))}</td></tr>`,
      )
      .join(""),
    payments = f.transactions
      .map(
        (x: any) =>
          `<tr><td>${new Date(Number(x.created_at)).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}</td><td>${escape(x.payment_status)}</td><td>${rupees(Number(x.amount))}</td><td>${escape(x.reference || "—")}</td></tr>`,
      )
      .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${invoice}</title><style>*{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#17251f;margin:0;padding:24px}.invoice{max-width:820px;margin:auto}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #16866b;padding-bottom:18px}.head h1{margin:0;color:#16866b}.meta{text-align:right}.parties{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:22px 0}.box{border:1px solid #dce7e1;border-radius:8px;padding:14px}.box small{display:block;color:#687c73;margin-bottom:6px}table{width:100%;border-collapse:collapse;margin:15px 0}th,td{padding:10px;border-bottom:1px solid #dfe8e3;text-align:left}th{background:#f1f7f4}.totals{margin-left:auto;width:min(100%,360px)}.totals div{display:flex;justify-content:space-between;padding:7px 0}.totals .grand{font-size:17px;font-weight:bold;border-top:2px solid #17251f}.paid{color:#147257}.due{color:#a15c1c}.actions{display:flex;gap:10px;margin:24px 0}.actions button{border:0;border-radius:7px;padding:11px 16px;font-weight:bold;cursor:pointer}.actions button:first-child{background:#16866b;color:white}@media(max-width:600px){body{padding:14px}.head,.parties{display:grid;grid-template-columns:1fr}.meta{text-align:left}.table-wrap{overflow:auto}th,td{white-space:nowrap}}@media print{body{padding:0}.actions{display:none}.invoice{max-width:none}@page{size:A4;margin:14mm}}</style></head><body><main class="invoice"><div class="actions"><button onclick="window.print()">Print / Save PDF</button><button onclick="window.close()">Close</button></div><header class="head"><div><h1>Wholesale Invoice</h1><p>${escape(sellerName)}</p></div><div class="meta"><b>${invoice}</b><p>Delivered: ${date}</p></div></header><section class="parties"><div class="box"><small>SUPPLIER</small><b>${escape(sellerName)}</b></div><div class="box"><small>VENDOR</small><b>${escape(buyerName)}</b></div></section><div class="table-wrap"><table><thead><tr><th>#</th><th>Product</th><th>Quantity</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div><section class="totals"><div><span>Products</span><b>${rupees(f.total)}</b></div><div><span>Return credit</span><b>−${rupees(f.returnCredit)}</b></div><div class="grand"><span>Net payable</span><b>${rupees(f.payable)}</b></div><div class="paid"><span>Paid</span><b>${rupees(f.paid)}</b></div><div class="due"><span>${f.refundDue ? "Refund due" : "Balance due"}</span><b>${rupees(f.refundDue || f.balance)}</b></div></section><h3>Payment history</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Status</th><th>Amount</th><th>Reference</th></tr></thead><tbody>${payments || '<tr><td colspan="4">No payment recorded</td></tr>'}</tbody></table></div><p><small>This invoice is generated from ShopKeeper order and payment records.</small></p></main></body></html>`;
  const win = window.open("", "_blank");
  if (!win) throw Error("Allow pop-ups to open the invoice.");
  win.opener = null;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
