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
  Camera,
} from "lucide-react";
import { api } from "./api";
import { money } from "@/lib/store";
import { orderFinancials } from "@/lib/wholesale-invoice";
import { WholesaleInvoiceButton } from "./wholesale-invoice-dialog";
import { UpiPaymentButton } from "./upi-payment";
import { MobileScanner } from "@/components/mobile-scanner";
import { parseProductCode } from "@/lib/product-label";

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
  weight?: string;
  category: string;
  description: string;
  price: number;
  special_active?: boolean;
  special_discount?: number;
  mrp?: number;
  stock: number;
  min_qty: number;
  bulk_qty?: number;
  bulk_price?: number;
  rating: number;
  reviews: number;
};
const offerPrice=(p:Product,quantity:number)=>Math.round(((quantity>=Number(p.bulk_qty||Infinity)&&p.bulk_price!=null?Number(p.bulk_price):Number(p.price))-(p.special_active?Number(p.special_discount||0):0))*100)/100;
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
  const [transactionView, setTransactionView] = useState("Payments");
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
          offerPrice(p,qty[p.id]) * qty[p.id],
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
  const tabs = [
    ["Overview", "Home"],
    ["Discover", "Buy stock"],
    ["Orders", "My orders"],
    ["Transactions", "Transactions"],
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
          <section className="panel padded wholesale-home-actions">
            <h2>What would you like to do?</h2>
            <p>Open one section to manage each task. Orders, returns and payments stay together in their own views.</p>
            <div className="actions">
              <button className="btn primary" onClick={() => setTab("Discover")}>Buy stock</button>
              <button className="btn" onClick={() => setTab("Orders")}>My orders ({data.requests.length})</button>
              <button className="btn" onClick={() => {setTab("Transactions");setTransactionView("Returns")}}>Return items</button>
              <button className="btn" onClick={() => {setTab("Transactions");setTransactionView("Payments")}}>Payments</button>
            </div>
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
                  {p.special_active && <span className="badge green">Special discount −{money(Number(p.special_discount))} per unit</span>}
                  <small>
                    {p.business_name} · {p.weight ? p.weight + " · " : ""}{p.unit}
                    {p.sku ? " · " + p.sku : ""}
                  </small>
                  {p.description && <p>{p.description}</p>}
                  <div className="market-price">
                    <strong>{money(offerPrice(p,qty[p.id]||1))}</strong>
                    {p.mrp && <del>{money(Number(p.mrp))}</del>}
                  </div>
                  {p.bulk_qty && p.bulk_price && (
                    <span className="bulk-deal">
                      Buy {p.bulk_qty}+ at {money(offerPrice(p,Number(p.bulk_qty)))}
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
                        offerPrice(p,qty[p.id]) * qty[p.id],
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
      {tab === "Transactions" && <div className="console-tabs" role="tablist" aria-label="Transaction records">{["Payments","Returns","Refunds"].map(x=><button key={x} role="tab" aria-selected={transactionView===x} className={transactionView===x?"active":""} onClick={()=>setTransactionView(x)}>{x}</button>)}</div>}
      {tab === "Transactions" && transactionView === "Returns" && (
        <ReturnManager
          vendorId={vendorId}
          requests={data.requests}
          returns={data.returns}
          transactions={data.transactions}
          refunds={data.refunds}
          reload={load}
          setMessage={setMessage}
        />
      )}{" "}
      {tab === "Transactions" && transactionView === "Payments" && <VendorPaymentLedger data={data} />}
      {tab === "Transactions" && transactionView === "Refunds" && <section className="panel padded"><h2>Refund history</h2>{data.refunds.map((refund:any)=><button type="button" className="admin-business-row" key={refund.id} onClick={()=>{setTransactionView("Payments");setMessage("Refund #"+refund.id.slice(0,8).toUpperCase()+" belongs to order #"+refund.request_id.slice(0,8).toUpperCase())}}><span><b>{refund.business_name} · {money(Number(refund.amount))}</b><small>{refund.reason} · {new Date(Number(refund.created_at)).toLocaleString("en-IN")}</small></span><span className={"badge "+tone(refund.status)}>{refund.status}</span></button>)}{!data.refunds.length&&<p className="empty-inline">No refunds yet.</p>}</section>}
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
    [margins, setMargins] = useState<Record<string, number>>(defaults),
    [barcodes, setBarcodes] = useState<Record<string, string>>({}),
    [scanningId, setScanningId] = useState(""),
    [scanError, setScanError] = useState(""),
    [inventory, setInventory] = useState<any[]>([]);
  useEffect(() => {
    let active = true;
    api("/api/store?vendor=" + encodeURIComponent(vendorId)).then((result) => {
      if (active) setInventory(result.state?.products || []);
    }).catch(() => {});
    return () => { active = false; };
  }, [vendorId]);
  return (
    <>
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
          { vendorId, sellingPrices, barcodes },
          "Items added to inventory with your selling prices.",
        );
      }}
    >
      <div>
        <b>Set your margin before adding stock</b>
        <small>Margin is your selling price minus wholesale cost. New products are created in inventory; matching barcodes update existing stock.</small>
      </div>
      {order.items.map((i: any) => {
        const cost = Number(i.unit_price),
          margin = Number(margins[i.product_id] || 0),
          selling = round2(cost + margin),
          code = barcodes[i.product_id] ?? i.sku ?? "",
          existing = code ? inventory.find((p: any) => p.barcode === code.trim()) : inventory.find((p: any) => p.name.toLowerCase() === i.name.toLowerCase());
        return (
          <div className="received-item" key={i.product_id}>
            <span>
              <b>{i.name}</b>
              <small>
                {i.quantity} {i.unit}{i.weight ? " · " + i.weight : ""} · Cost {money(cost)}
                {i.mrp ? " · MRP " + money(Number(i.mrp)) : ""}
              </small>
              <small className="block-text">{existing ? `Updates ${existing.name} in inventory (${existing.stock} currently)` : "New product — added to inventory on receipt"}</small>
            </span>
            <label>
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
            </label>
            <label className="receive-barcode">
              Barcode to save in inventory
              <span><input aria-label={"Barcode for " + i.name} value={code} maxLength={199} placeholder="Scan or type; optional" onChange={(e) => setBarcodes({ ...barcodes, [i.product_id]: e.target.value })} />
              <button className="btn" type="button" aria-label={"Scan barcode for " + i.name} onClick={() => setScanningId(i.product_id)}><Camera size={16} /> Scan</button></span>
            </label>
            <strong>Sell at {money(selling)}</strong>
          </div>
        );
      })}
      {scanError && <p role="alert" className="notice error">{scanError}</p>}
      <button className="btn primary large-action">
        Received — add to my stock
      </button>
    </form>
    <MobileScanner open={Boolean(scanningId)} onClose={() => setScanningId("")} onScan={(raw) => {
      try {const code = parseProductCode(raw).barcode; if (code) {setBarcodes((value) => ({...value,[scanningId]:code}));setScanError("");}}
      catch (error) {setScanError((error as Error).message);}
    }} />
    </>
  );
}
const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
function VendorPaymentLedger({ data }: { data: any }) {
  const [selected,setSelected]=useState(""),[activeSupplier,setActiveSupplier]=useState("");
  const payment=data.transactions.find((t:any)=>t.id===selected), order=data.requests.find((r:any)=>r.id===payment?.request_id), orderPayments=data.transactions.filter((t:any)=>t.request_id===payment?.request_id), orderReturns=data.returns.filter((r:any)=>r.request_id===payment?.request_id), orderRefunds=data.refunds.filter((r:any)=>r.request_id===payment?.request_id);
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
      <section className="panel padded"><h2>Wholesale partners</h2><p>Select a wholesaler to view recent activity and transaction history.</p><div className="admin-business-list">{suppliers.map((partner:any)=>{const orders=data.requests.filter((r:any)=>r.wholesaler_id===partner.id&&!['cancelled'].includes(r.status));const summary=orders.reduce((a:any,r:any)=>{const f=orderFinancials(r,data.transactions,data.returns,data.refunds);a.total+=f.payable;a.paid+=f.paid;a.balance+=f.balance;return a},{total:0,paid:0,balance:0});return <button type="button" className="admin-business-row" key={partner.id} aria-expanded={activeSupplier===partner.id} onClick={()=>{setActiveSupplier(activeSupplier===partner.id?'':partner.id);setSelected('')}}><span><b>{partner.name}</b><small>{orders.length} orders · Paid {money(summary.paid)} · Purchases {money(summary.total)}</small></span><b>{money(summary.balance)} pending</b><span>View →</span></button>})}{!suppliers.length&&<p className="empty-inline">No wholesale partners with orders yet.</p>}</div></section>
      {activeSupplier&&<><section className="panel padded"><h2>Recent activity · {suppliers.find((p:any)=>p.id===activeSupplier)?.name}</h2>{data.requests.filter((r:any)=>r.wholesaler_id===activeSupplier).slice(0,3).map((r:any)=><div className="record-row" key={r.id}><b>Order #{r.id.slice(0,8).toUpperCase()} · {r.status}</b><small>{new Date(Number(r.created_at)).toLocaleString('en-IN')}</small></div>)}{data.transactions.filter((t:any)=>t.wholesaler_id===activeSupplier).slice(0,3).map((t:any)=><div className="record-row" key={t.id}><b>Payment {money(Number(t.amount))} · {t.payment_status}</b><small>{new Date(Number(t.created_at)).toLocaleString('en-IN')}</small></div>)}</section>
      <section className="order-payment-list">
        {data.requests
          .filter((r: any) => r.wholesaler_id===activeSupplier && !["cancelled"].includes(r.status))
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
            {data.transactions.filter((p:any)=>p.wholesaler_id===activeSupplier).map((payment: any) => (
              <tr key={payment.id} className="return-row" tabIndex={0} onClick={()=>setSelected(payment.id)} onKeyDown={e=>{if(e.key==="Enter"){setSelected(payment.id)}}}>
                <td>
                  {new Date(Number(payment.created_at)).toLocaleString(
                    "en-IN", { dateStyle: "medium", timeStyle: "short" },
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
      <section className="panel padded"><h2>Returns and refunds</h2>{data.returns.filter((x:any)=>x.wholesaler_id===activeSupplier).map((x:any)=><div className="record-row" key={x.id}><b>{x.product_name} · {x.status}</b><small>{x.quantity} {x.unit} · {x.reason}</small></div>)}{data.refunds.filter((x:any)=>x.wholesaler_id===activeSupplier).map((x:any)=><div className="record-row" key={x.id}><b>Refund {money(Number(x.amount))} · {x.status}</b><small>{x.reason}</small></div>)}{!data.returns.some((x:any)=>x.wholesaler_id===activeSupplier)&&!data.refunds.some((x:any)=>x.wholesaler_id===activeSupplier)&&<p>No returns or refunds for this wholesaler.</p>}</section>
      </>}{payment&&<section className="panel padded return-details"><div className="panel-heading"><div><h2>Transaction #{payment.id.slice(0,8).toUpperCase()}</h2><p>{payment.business_name} · Order #{payment.request_id.slice(0,8).toUpperCase()}</p></div><button className="btn" onClick={()=>setSelected("")}>Close</button></div><p><b>Payment:</b> {money(Number(payment.amount))} · {payment.payment_status} · {payment.reference||"No reference"}</p><p><b>Order:</b> {order?.status||"Unavailable"} · {order?.items?.map((i:any)=>i.name+" × "+i.quantity).join(", ")}</p><h3>Payment history</h3>{orderPayments.map((p:any)=><div className="record-row" key={p.id}><b>{money(Number(p.amount))} · {p.payment_status}</b><small>{new Date(Number(p.created_at)).toLocaleString("en-IN")} · {p.reference||"No reference"}</small></div>)}<h3>Returns and refunds</h3>{orderReturns.map((r:any)=><div className="record-row" key={r.id}><b>{r.product_name} · {r.status}</b><small>{r.quantity} {r.unit} × {money(Number(r.unit_price))}</small></div>)}{orderRefunds.map((r:any)=><div className="record-row" key={r.id}><b>Refund {money(Number(r.amount))} · {r.status}</b><small>{r.reason}</small></div>)}</section>}
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
  transactions,
  refunds,
  reload,
  setMessage,
}: {
  vendorId: string;
  requests: any[];
  returns: any[];
  transactions: any[];
  refunds: any[];
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
    [lineKey, setLineKey] = useState(""),
    [selectedReturn, setSelectedReturn] = useState("");
  const line = lines.find((x) => x.requestId + "|" + x.product_id === lineKey);
  const available = line ? Math.max(0, Number(line.quantity) - returns.filter((r:any) => r.request_id === line.requestId && r.product_id === line.product_id && r.status !== "rejected").reduce((sum:number,r:any) => sum + Number(r.quantity), 0)) : 0;
  const detail = returns.find((r:any) => r.id === selectedReturn),
    detailOrder = requests.find((r:any) => r.id === detail?.request_id),
    detailPayments = transactions.filter((p:any) => p.request_id === detail?.request_id),
    detailRefunds = refunds.filter((refund:any) => detailPayments.some((p:any) => p.id === refund.transaction_id)),
    financials = detailOrder ? orderFinancials(detailOrder, transactions, returns, refunds) : null;
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
          {line && <p className="notice compact"><b>Wholesale dealer: {line.businessName}</b> · Order #{line.requestId.slice(0,8).toUpperCase()} · {available} {line.unit} available to return · Paid price {money(Number(line.unit_price))} each</p>}
          <label>
            Return quantity
            <input
              name="quantity"
              type="number"
              min="1"
              max={available || 1}
              required
              disabled={!line || !available}
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
          <button className="btn primary" disabled={!line || !available}>
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
              <tr key={r.id} className={selectedReturn === r.id ? "return-row selected" : "return-row"} tabIndex={0} aria-selected={selectedReturn === r.id} onClick={() => setSelectedReturn(selectedReturn === r.id ? "" : r.id)} onKeyDown={(e) => {if(e.key === "Enter" || e.key === " "){e.preventDefault();setSelectedReturn(selectedReturn === r.id ? "" : r.id)}}}>
                <td><b>{r.product_name}</b><small className="block-text">Order #{r.request_id.slice(0,8).toUpperCase()} · Click for details</small></td>
                <td><b>{r.business_name}</b><small className="block-text">Wholesale dealer</small></td>
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
      {detail && <section className="panel padded return-details" aria-live="polite">
        <div className="panel-heading"><div><h2>{detail.product_name} return</h2><p>Wholesale dealer: <b>{detail.business_name}</b> · Order #{detail.request_id.slice(0,8).toUpperCase()}</p></div><button className="btn" onClick={() => setSelectedReturn("")}>Close details</button></div>
        <div className="return-detail-grid">
          <span><small>Return status</small><b>{detail.status}</b></span>
          <span><small>Order status</small><b>{detailOrder ? orderLabel[detailOrder.status] || detailOrder.status : "Unavailable"}</b></span>
          <span><small>Quantity / price</small><b>{detail.quantity} {detail.unit} × {money(Number(detail.unit_price))}</b></span>
          <span><small>Return value</small><b>{money(Number(detail.quantity) * Number(detail.unit_price))}</b></span>
          {financials && <><span><small>Order paid</small><b>{money(financials.paid)}</b></span><span><small>Balance due</small><b>{money(financials.balance)}</b></span><span><small>Return credit applied</small><b>{money(financials.returnCredit)}</b></span><span><small>Refund due</small><b>{money(financials.refundDue)}</b></span></>}
        </div>
        <p><b>Reason:</b> {detail.reason}</p>
        <p className="muted small">Return requested {new Date(Number(detail.created_at)).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}. Credit applies to the order when the wholesaler marks the return received.</p>
        <h3>Order payment history</h3>
        {detailPayments.map((p:any) => <div className="record-row" key={p.id}><div><b>{p.payment_status}</b><small>{new Date(Number(p.created_at)).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})} · {p.reference || "No reference"}</small></div><b>{money(Number(p.amount))}</b></div>)}
        {!detailPayments.length && <p className="empty-inline">No payments recorded for this order.</p>}
        {detailRefunds.length > 0 && <><h3>Refunds</h3>{detailRefunds.map((r:any) => <div className="record-row" key={r.id}><div><b>{r.status} · {r.reason}</b></div><b>{money(Number(r.amount))}</b></div>)}</>}
      </section>}
    </div>
  );
}
