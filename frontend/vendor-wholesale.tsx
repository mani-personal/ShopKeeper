import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Heart,
  IndianRupee,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Star,
  Truck,
} from "lucide-react";
import { api } from "./api";
import { money } from "@/lib/store";
import { orderFinancials } from "@/lib/wholesale-invoice";
import { WholesaleInvoiceButton } from "./wholesale-invoice-dialog";
import { UpiPaymentButton } from "./upi-payment";

type Product = {
  id: string;
  wholesaler_id: string;
  business_name: string;
  logo_image?: string;
  verified: boolean;
  favourite: boolean;
  service_areas: string;
  brands: string;
  min_order: number;
  delivery_days: number;
  name: string;
  sku: string;
  unit: string;
  category: string;
  description: string;
  price: number;
  mrp?: number;
  stock: number;
  min_qty: number;
  bulk_qty?: number;
  bulk_price?: number;
  rating: number;
  reviews: number;
};
const tone = (status: string) =>
  ["completed", "paid", "received", "delivered"].includes(status)
    ? "green"
    : ["cancelled", "rejected"].includes(status)
      ? "red"
      : "amber";
const steps = ["approved", "packed", "dispatched", "delivered"];
const orderLabel: Record<string, string> = {
  pending: "Waiting for confirmation",
  quoted: "Order received",
  approved: "Order confirmed",
  packed: "Packed",
  dispatched: "On the way",
  delivered: "Delivered",
  completed: "Closed",
  cancelled: "Cancelled",
};
const vendorHelp: Record<string, string> = {
  pending: "The wholesaler received your order. Wait for their confirmation.",
  quoted: "The wholesaler received your order and can pack it.",
  approved: "The wholesaler confirmed your order and will pack the items.",
  packed: "The wholesaler has packed your items.",
  dispatched: "Your items are on the way.",
  delivered:
    "Check the quantity, set your margin, then add the items to stock.",
  completed: "This order is complete.",
  cancelled: "This order was cancelled.",
};
export function VendorWholesale({ vendorId }: { vendorId: string }) {
  const [data, setData] = useState<any>({
      products: [],
      requests: [],
      returns: [],
      transactions: [],
      refunds: [],
    }),
    [qty, setQty] = useState<Record<string, number>>({}),
    [notes, setNotes] = useState(""),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState("Overview"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [seller, setSeller] = useState("");
  async function load() {
    try {
      setData(
        await api(
          "/api/marketplace/catalog?vendor=" + encodeURIComponent(vendorId),
        ),
      );
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [vendorId]);
  const products = data.products as Product[],
    sellers = [...new Map(products.map((p) => [p.wholesaler_id, p])).values()],
    categories = ["All", ...new Set(products.map((p) => p.category))],
    shown = products.filter(
      (p) =>
        (!seller || p.wholesaler_id === seller) &&
        (category === "All" || p.category === category) &&
        (p.name + " " + p.business_name + " " + p.brands + " " + p.sku)
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
    selected = useMemo(
      () => products.filter((p) => (qty[p.id] || 0) > 0),
      [products, qty],
    );
  async function send() {
    const sellerId = selected[0]?.wholesaler_id;
    if (!sellerId) return;
    if (selected.some((p) => p.wholesaler_id !== sellerId)) {
      setMessage("Create a separate order for each wholesale seller.");
      return;
    }
    const wholesaler = selected[0],
      value = selected.reduce(
        (sum, p) =>
          sum +
          (qty[p.id] >= Number(p.bulk_qty || Infinity)
            ? Number(p.bulk_price || p.price)
            : Number(p.price)) *
            qty[p.id],
        0,
      );
    if (value < Number(wholesaler.min_order || 0)) {
      setMessage(
        "Minimum order for " +
          wholesaler.business_name +
          " is " +
          money(Number(wholesaler.min_order)),
      );
      return;
    }
    try {
      await api("/api/marketplace/requests", {
        vendorId,
        notes,
        items: selected.map((p) => ({ productId: p.id, quantity: qty[p.id] })),
      });
      setQty({});
      setNotes("");
      await load();
      setTab("Orders");
      setMessage("Order sent. Waiting for the wholesaler to confirm it.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const open = data.requests.filter(
      (r: any) => !["completed", "cancelled"].includes(r.status),
    ).length,
    paid = data.transactions
      .filter((t: any) => ["paid", "partial"].includes(t.payment_status))
      .reduce((s: number, t: any) => s + Number(t.amount), 0),
    due =
      data.requests
        .filter((r: any) => !["cancelled"].includes(r.status))
        .reduce((s: number, r: any) => s + Number(r.total), 0) - paid;
  const checklist = [
    ["Browse verified wholesalers", products.some((p) => p.verified)],
    ["Favourite a supplier", products.some((p) => p.favourite)],
    ["Place first order", data.requests.length > 0],
    [
      "Receive stock into inventory",
      data.requests.some((r: any) => r.inventory_received),
    ],
  ];
  const tabs = [
    ["Overview", "Home"],
    ["Discover", "Buy stock"],
    ["Orders", "My orders"],
    ["Returns", "Return items"],
    ["Payments", "Payments"],
  ];
  return (
    <div className="vendor-wholesale-console">
      <div className="console-tabs">
        {tabs.map(([key, label]) => (
          <button
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
            key={key}
          >
            {label}
          </button>
        ))}
      </div>
      {message && (
        <p role="status" className="status-message">
          {message}
        </p>
      )}
      {tab === "Overview" && (
        <>
          <div className="metrics">
            <Metric
              label="Available products"
              value={products.length}
              note="Across permitted catalogues"
              icon={<Package />}
            />
            <Metric
              label="Open orders"
              value={open}
              note="Packing to delivery"
              icon={<ShoppingCart />}
            />
            <Metric
              label="Wholesale paid"
              value={money(paid)}
              note="Paid and partial payments"
              icon={<IndianRupee />}
            />
            <Metric
              label="Amount pending"
              value={money(Math.max(0, due))}
              note="Across wholesale orders"
              icon={<Truck />}
            />
          </div>
          <section className="panel padded onboarding-card">
            <div>
              <span className="eyebrow">GET STARTED</span>
              <h2>Wholesale ordering checklist</h2>
              <p>
                {checklist.filter((x) => x[1]).length} of {checklist.length}{" "}
                completed
              </p>
            </div>
            <div className="onboarding-list">
              {checklist.map(([label, done]) => (
                <span className={done ? "done" : ""} key={String(label)}>
                  {done ? "✓" : "○"} {label}
                </span>
              ))}
            </div>
          </section>
          <section className="panel padded">
            <div className="panel-heading">
              <h2>Recent order activity</h2>
              <button className="btn" onClick={() => void load()}>
                <RefreshCw size={15} />
                Refresh
              </button>
            </div>
            {data.requests.slice(0, 5).map((r: any) => (
              <OrderCard
                row={r}
                transactions={data.transactions}
                returns={data.returns}
                refunds={data.refunds}
                vendorId={vendorId}
                reload={load}
                setMessage={setMessage}
                key={r.id}
              />
            ))}
            {!data.requests.length && (
              <p className="empty-inline">
                Discover wholesalers and place your first stock order.
              </p>
            )}
          </section>
        </>
      )}
      {tab === "Discover" && (
        <>
          <section className="simple-flow">
            <div>
              <b>1. Choose items</b>
              <small>Enter the quantity you need.</small>
            </div>
            <div>
              <b>2. Send order</b>
              <small>Wholesaler confirms the order.</small>
            </div>
            <div>
              <b>3. Receive items</b>
              <small>Set your margin and add to stock.</small>
            </div>
          </section>
          <section className="panel padded">
            <div className="marketplace-toolbar">
              <label className="search">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type product or wholesaler name"
                />
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select
                value={seller}
                onChange={(e) => setSeller(e.target.value)}
              >
                <option value="">All wholesalers</option>
                {sellers.map((p) => (
                  <option value={p.wholesaler_id} key={p.wholesaler_id}>
                    {p.business_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="wholesaler-strip">
              {sellers.map((p) => (
                <article className="wholesaler-mini" key={p.wholesaler_id}>
                  {p.logo_image ? (
                    <img src={p.logo_image} alt="" />
                  ) : (
                    <Package />
                  )}
                  <div>
                    <b>
                      {p.business_name} {p.verified && <BadgeCheck size={15} />}
                    </b>
                    <small>
                      {p.service_areas || "Service area not listed"} ·{" "}
                      {p.delivery_days} day delivery
                    </small>
                    <span>
                      <Star size={13} /> {Number(p.rating).toFixed(1)} (
                      {p.reviews}) · Minimum order {money(Number(p.min_order))}
                    </span>
                  </div>
                  <button
                    className={"icon-button " + (p.favourite ? "selected" : "")}
                    title="Favourite wholesaler"
                    onClick={async () => {
                      await api("/api/marketplace/favourite", {
                        vendorId,
                        wholesalerId: p.wholesaler_id,
                        favourite: !p.favourite,
                      });
                      await load();
                    }}
                  >
                    <Heart
                      size={17}
                      fill={p.favourite ? "currentColor" : "none"}
                    />
                  </button>
                </article>
              ))}
            </div>
            <div className="product-grid marketplace-products">
              {shown.map((p) => (
                <article className="catalog-card" key={p.id}>
                  <div className="catalog-title">
                    <span className="badge green">{p.category}</span>
                    {p.verified && <BadgeCheck size={17} />}
                  </div>
                  <h3>{p.name}</h3>
                  <small>
                    {p.business_name} · {p.unit}
                    {p.sku ? " · " + p.sku : ""}
                  </small>
                  {p.description && <p>{p.description}</p>}
                  <div className="market-price">
                    <strong>{money(Number(p.price))}</strong>
                    {p.mrp && <del>{money(Number(p.mrp))}</del>}
                  </div>
                  {p.bulk_qty && p.bulk_price && (
                    <span className="bulk-deal">
                      Buy {p.bulk_qty}+ at {money(Number(p.bulk_price))}
                    </span>
                  )}
                  <small>
                    {p.stock} available · Minimum {p.min_qty}
                  </small>
                  <label>
                    How many?
                    <input
                      type="number"
                      min={p.min_qty}
                      max={p.stock}
                      value={qty[p.id] || ""}
                      onChange={(e) =>
                        setQty({
                          ...qty,
                          [p.id]: Math.max(0, Number(e.target.value)),
                        })
                      }
                    />
                  </label>
                </article>
              ))}
            </div>
            {!shown.length && (
              <p className="empty-inline">
                No products match the current filters.
              </p>
            )}
            {selected.length > 0 && (
              <div className="request-bar">
                <label>
                  Message (optional)
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Example: Deliver before Friday"
                  />
                </label>
                <b>
                  Total{" "}
                  {money(
                    selected.reduce(
                      (sum, p) =>
                        sum +
                        (qty[p.id] >= Number(p.bulk_qty || Infinity)
                          ? Number(p.bulk_price || p.price)
                          : Number(p.price)) *
                          qty[p.id],
                      0,
                    ),
                  )}
                </b>
                <button className="btn primary" onClick={() => void send()}>
                  Send order
                </button>
              </div>
            )}
          </section>
        </>
      )}
      {tab === "Orders" && (
        <section className="order-list">
          {data.requests.map((r: any) => (
            <OrderCard
              row={r}
              transactions={data.transactions}
              returns={data.returns}
              refunds={data.refunds}
              vendorId={vendorId}
              reload={load}
              setMessage={setMessage}
              key={r.id}
            />
          ))}
          {!data.requests.length && (
            <section className="panel padded">
              <p className="empty-inline">No orders yet.</p>
            </section>
          )}
        </section>
      )}
      {tab === "Returns" && (
        <ReturnManager
          vendorId={vendorId}
          requests={data.requests}
          returns={data.returns}
          reload={load}
          setMessage={setMessage}
        />
      )}{" "}
      {tab === "Payments" && <VendorPaymentLedger data={data} />}
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: any;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric">
      <div>
        <span>{label}</span>
        <span className="metric-icon tone-0">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function OrderCard({
  row: r,
  transactions,
  returns,
  refunds,
  vendorId,
  reload,
  setMessage,
}: {
  row: any;
  transactions: any[];
  returns: any[];
  refunds: any[];
  vendorId: string;
  reload: () => Promise<void>;
  setMessage: (x: string) => void;
}) {
  const active = Math.max(0, steps.indexOf(r.status)),
    finance = orderFinancials(r, transactions, returns, refunds);
  async function action(path: string, body: any, message: string) {
    try {
      await api(path, body);
      setMessage(message);
      await reload();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <article className="panel padded order-card">
      <div className="panel-heading">
        <div>
          <b>
            {r.business_name} {r.verified && <BadgeCheck size={15} />}
          </b>
          <small>
            Order #{r.id.slice(0, 8).toUpperCase()} ·{" "}
            {new Date(Number(r.created_at)).toLocaleDateString("en-IN")}
          </small>
        </div>
        <span className={"badge " + tone(r.status)}>
          {orderLabel[r.status] || r.status}
        </span>
      </div>
      <div className="next-action">
        <b>What happens now?</b>
        <span>{vendorHelp[r.status] || "Review this order."}</span>
      </div>
      <div className="simple-item-list">
        {r.items.map((i: any) => (
          <span key={i.product_id}>
            <b>{i.name}</b>
            <em>
              {i.quantity} {i.unit}
            </em>
          </span>
        ))}
      </div>
      <div className="order-total">
        <span>Net payable {money(finance.payable)}</span>
        <span>Paid {money(finance.paid)}</span>
        <strong>
          {finance.refundDue
            ? "Refund due " + money(finance.refundDue)
            : finance.balance
              ? "Pending " + money(finance.balance)
              : "Fully paid"}
        </strong>
      </div>
      {finance.returnCredit > 0 && (
        <small className="credit-note">
          Return credit applied: {money(finance.returnCredit)}
        </small>
      )}
      {r.expected_delivery && (
        <small>
          Expected by:{" "}
          {new Date(Number(r.expected_delivery)).toLocaleDateString("en-IN")}
        </small>
      )}
      {["approved", "packed", "dispatched", "delivered", "completed"].includes(
        r.status,
      ) && (
        <div className="order-timeline">
          {steps.map((x, i) => (
            <span
              className={i <= active || r.status === "completed" ? "done" : ""}
              key={x}
            >
              <i />
              {orderLabel[x]}
            </span>
          ))}
        </div>
      )}
      {["delivered", "completed"].includes(r.status) &&
        !r.inventory_received && (
          <ReceiveWithMargin order={r} vendorId={vendorId} action={action} />
        )}
      {r.inventory_received &&
        finance.balance > 0 &&
        !transactions.some(
          (payment: any) =>
            payment.request_id === r.id &&
            payment.payment_status === "pending" &&
            payment.submitted_by_vendor,
        ) && (
          <UpiPaymentButton
            order={r}
            balance={finance.balance}
            vendorId={vendorId}
            reload={reload}
            setMessage={setMessage}
          />
        )}
      {transactions.some(
        (payment: any) =>
          payment.request_id === r.id &&
          payment.payment_status === "pending" &&
          payment.submitted_by_vendor,
      ) && (
        <div className="notice compact">
          UPI payment sent. Waiting for wholesaler confirmation.
        </div>
      )}
      <div className="actions">
        {["delivered", "completed"].includes(r.status) && (
          <WholesaleInvoiceButton
            order={r}
            sellerName={r.business_name}
            sellerGst={r.gst_number}
            sellerAddress={r.seller_address}
            buyerName={r.vendorName || "My store"}
            transactions={transactions}
            returns={returns}
            refunds={refunds}
          />
        )}
        {["delivered", "completed"].includes(r.status) && (
          <button
            className="btn"
            onClick={() =>
              void action(
                "/api/marketplace/requests/" + r.id + "/repeat",
                { vendorId },
                "Same order sent again.",
              )
            }
          >
            Order same items again
          </button>
        )}
        {["delivered", "completed"].includes(r.status) && (
          <button
            className="text-button"
            onClick={() => {
              const rating = Number(
                prompt("Rate this wholesaler from 1 to 5", "5"),
              );
              if (rating)
                void action(
                  "/api/marketplace/reviews",
                  { vendorId, requestId: r.id, rating, comment: "" },
                  "Rating saved.",
                );
            }}
          >
            <Star size={15} />
            Rate seller
          </button>
        )}
      </div>
    </article>
  );
}
function ReceiveWithMargin({
  order,
  vendorId,
  action,
}: {
  order: any;
  vendorId: string;
  action: (path: string, body: any, message: string) => Promise<void>;
}) {
  const defaults = Object.fromEntries(
      order.items.map((i: any) => [
        i.product_id,
        Math.max(
          0,
          round2(
            (Number(i.mrp) || Number(i.unit_price) * 1.15) -
              Number(i.unit_price),
          ),
        ),
      ]),
    ),
    [margins, setMargins] = useState<Record<string, number>>(defaults);
  return (
    <form
      className="margin-editor"
      onSubmit={(e) => {
        e.preventDefault();
        const sellingPrices = Object.fromEntries(
          order.items.map((i: any) => [
            i.product_id,
            round2(Number(i.unit_price) + Number(margins[i.product_id] || 0)),
          ]),
        );
        void action(
          "/api/marketplace/requests/" + order.id + "/receive",
          { vendorId, sellingPrices },
          "Items added to inventory with your selling prices.",
        );
      }}
    >
      <div>
        <b>Set your margin before adding stock</b>
        <small>Margin is your selling price minus wholesale cost.</small>
      </div>
      {order.items.map((i: any) => {
        const cost = Number(i.unit_price),
          margin = Number(margins[i.product_id] || 0),
          selling = round2(cost + margin);
        return (
          <label key={i.product_id}>
            <span>
              <b>{i.name}</b>
              <small>
                Cost {money(cost)}
                {i.mrp ? " · MRP " + money(Number(i.mrp)) : ""}
              </small>
            </span>
            <span>
              Margin ₹
              <input
                aria-label={"Margin for " + i.name}
                type="number"
                min="0"
                max={i.mrp ? Math.max(0, Number(i.mrp) - cost) : 10000000}
                step=".01"
                value={margin}
                onChange={(e) =>
                  setMargins({
                    ...margins,
                    [i.product_id]: Number(e.target.value),
                  })
                }
              />
            </span>
            <strong>Sell at {money(selling)}</strong>
          </label>
        );
      })}
      <button className="btn primary large-action">
        Received — add to my stock
      </button>
    </form>
  );
}
const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
function VendorPaymentLedger({ data }: { data: any }) {
  const suppliers = [
    ...new Map(
      data.requests.map((r: any) => [
        r.wholesaler_id,
        { id: r.wholesaler_id, name: r.business_name },
      ]),
    ).values(),
  ] as any[];
  return (
    <div className="payment-ledger">
      <section className="supplier-balances">
        {suppliers.map((s) => {
          const orders = data.requests.filter(
              (r: any) =>
                r.wholesaler_id === s.id && !["cancelled"].includes(r.status),
            ),
            summary = orders.reduce(
              (a: any, r: any) => {
                const f = orderFinancials(
                  r,
                  data.transactions,
                  data.returns,
                  data.refunds,
                );
                a.total += f.payable;
                a.paid += f.paid;
                a.balance += f.balance;
                a.refund += f.refundDue;
                return a;
              },
              { total: 0, paid: 0, balance: 0, refund: 0 },
            );
          return (
            <article className="panel supplier-balance-card" key={s.id}>
              <div>
                <Package />
                <span>
                  <b>{s.name}</b>
                  <small>{orders.length} orders</small>
                </span>
              </div>
              <dl>
                <div>
                  <dt>Net purchases</dt>
                  <dd>{money(summary.total)}</dd>
                </div>
                <div>
                  <dt>Paid</dt>
                  <dd>{money(summary.paid)}</dd>
                </div>
                <div>
                  <dt>Pending</dt>
                  <dd>{money(summary.balance)}</dd>
                </div>
                {summary.refund > 0 && (
                  <div>
                    <dt>Refund due</dt>
                    <dd>{money(summary.refund)}</dd>
                  </div>
                )}
              </dl>
            </article>
          );
        })}
      </section>
      <section className="order-payment-list">
        {data.requests
          .filter((r: any) => !["cancelled"].includes(r.status))
          .map((r: any) => {
            const f = orderFinancials(
              r,
              data.transactions,
              data.returns,
              data.refunds,
            );
            return (
              <article className="panel order-payment-card" key={r.id}>
                <div>
                  <b>{r.business_name}</b>
                  <small>
                    Order #{r.id.slice(0, 8).toUpperCase()} ·{" "}
                    {new Date(Number(r.created_at)).toLocaleDateString("en-IN")}
                  </small>
                </div>
                <div className="payment-numbers">
                  <span>
                    Order <b>{money(f.total)}</b>
                  </span>
                  <span>
                    Returns <b>−{money(f.returnCredit)}</b>
                  </span>
                  <span>
                    Paid <b>{money(f.paid)}</b>
                  </span>
                  <span>
                    {f.refundDue ? "Refund due" : "Pending"}{" "}
                    <b>{money(f.refundDue || f.balance)}</b>
                  </span>
                </div>
                {["delivered", "completed"].includes(r.status) && (
                  <WholesaleInvoiceButton
                    order={r}
                    sellerName={r.business_name}
                    sellerGst={r.gst_number}
                    sellerAddress={r.seller_address}
                    buyerName={r.vendorName || "My store"}
                    transactions={data.transactions}
                    returns={data.returns}
                    refunds={data.refunds}
                  />
                )}
              </article>
            );
          })}
      </section>
      <section className="panel table-scroll">
        <div className="panel-heading">
          <div>
            <h2>Payment history</h2>
            <p>Every submitted, confirmed and rejected purchase payment.</p>
          </div>
        </div>
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Wholesaler</th>
              <th>Order</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((payment: any) => (
              <tr key={payment.id}>
                <td>
                  {new Date(Number(payment.created_at)).toLocaleDateString(
                    "en-IN",
                  )}
                </td>
                <td>{payment.business_name}</td>
                <td>#{payment.request_id.slice(0, 8).toUpperCase()}</td>
                <td>{money(Number(payment.amount))}</td>
                <td>
                  <span className={"badge " + tone(payment.payment_status)}>
                    {payment.payment_status === "pending" &&
                    payment.submitted_by_vendor
                      ? "Awaiting confirmation"
                      : payment.payment_status}
                  </span>
                  {payment.rejection_reason && (
                    <small className="block-text">
                      {payment.rejection_reason}
                    </small>
                  )}
                </td>
                <td>{payment.reference || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.transactions.length && (
          <p className="empty-inline">No payments recorded yet.</p>
        )}
      </section>
      {!data.requests.length && (
        <section className="panel padded">
          <p>No supplier orders or payments yet.</p>
        </section>
      )}
    </div>
  );
}
function ReturnManager({
  vendorId,
  requests,
  returns,
  reload,
  setMessage,
}: {
  vendorId: string;
  requests: any[];
  returns: any[];
  reload: () => Promise<void>;
  setMessage: (x: string) => void;
}) {
  const lines = requests
      .filter((r) => ["delivered", "completed"].includes(r.status))
      .flatMap((r) =>
        r.items.map((i: any) => ({
          ...i,
          requestId: r.id,
          businessName: r.business_name,
        })),
      ),
    [lineKey, setLineKey] = useState("");
  const line = lines.find((x) => x.requestId + "|" + x.product_id === lineKey);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (!line) return;
    try {
      await api("/api/wholesale/returns", {
        vendorId,
        requestId: line.requestId,
        productId: line.product_id,
        quantity: Number(f.get("quantity")),
        unitPrice: Number(f.get("unitPrice")),
        reason: f.get("reason"),
      });
      setMessage("Return submitted for approval.");
      setLineKey("");
      form.reset();
      await reload();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="wholesale-layout">
      <section className="panel padded">
        <h2>Return wholesale product</h2>
        <form className="form" onSubmit={submit}>
          <label>
            Delivered product
            <select
              value={lineKey}
              onChange={(e) => setLineKey(e.target.value)}
              required
            >
              <option value="">Select product</option>
              {lines.map((x) => (
                <option
                  key={x.requestId + "|" + x.product_id}
                  value={x.requestId + "|" + x.product_id}
                >
                  {x.businessName} · {x.name} · {x.quantity} {x.unit}
                </option>
              ))}
            </select>
          </label>
          <label>
            Return quantity
            <input
              name="quantity"
              type="number"
              min="1"
              max={line?.quantity || 1}
              required
              disabled={!line}
            />
          </label>
          <label>
            Return unit price
            <input
              name="unitPrice"
              type="number"
              min=".01"
              max={line?.unit_price || 0}
              step=".01"
              defaultValue={line ? Number(line.unit_price) : ""}
              key={lineKey}
              required
              disabled={!line}
            />
          </label>
          <label>
            Reason
            <textarea name="reason" maxLength={300} required disabled={!line} />
          </label>
          <button className="btn primary" disabled={!line}>
            Submit return
          </button>
        </form>
      </section>
      <section className="panel table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              {["Product", "Wholesaler", "Quantity", "Value", "Status"].map(
                (x) => (
                  <th key={x}>{x}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {returns.map((r: any) => (
              <tr key={r.id}>
                <td>{r.product_name}</td>
                <td>{r.business_name}</td>
                <td>
                  {r.quantity} {r.unit}
                </td>
                <td>{money(Number(r.quantity) * Number(r.unit_price))}</td>
                <td>
                  <span className={"badge " + tone(r.status)}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!returns.length && (
          <p className="empty-inline">No returns submitted.</p>
        )}
      </section>
    </div>
  );
}
