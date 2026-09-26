import { useEffect, useMemo, useState } from "react";
import {
  Package,
  RefreshCw,
  LogOut,
  Users,
  RotateCcw,
  ShoppingCart,
  IndianRupee,
  Upload,
  BadgeCheck,
  Star,
  Truck,
  ScanBarcode,
  Plus,
  ChevronRight,
  Settings,
  CircleHelp,
} from "lucide-react";
import QRCode from "qrcode";
import { api, logout } from "./api";
import { money } from "@/lib/store";
import { PasswordInput } from "./password-input";
import { ThemeToggle } from "./theme";
import { Notifications } from "./notifications";
import { Support } from "./support";
import { PaymentProof, prepareImage } from "./store-assets";
import { MobileScanner } from "@/components/mobile-scanner";
import { ProductLabel } from "@/components/product-label";
import { parseProductCode } from "@/lib/product-label";
import { orderFinancials } from "@/lib/wholesale-invoice";
import { WholesaleInvoiceButton } from "./wholesale-invoice-dialog";
import { Employees } from "./employees";
import { ProfileMenu } from "./profile-menu";
import { businessTypes } from "@/lib/vendors";
import { OfflineVendors } from "./offline-vendors";
import { AccountPassword } from "./account-password";

const paymentTime = (value: number | string) => new Date(Number(value)).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const statusTone = (status: string) =>
  ["completed", "paid", "processed", "received"].includes(status)
    ? "green"
    : ["cancelled", "rejected"].includes(status)
      ? "red"
      : "amber";
const orderLabel: Record<string, string> = {
  pending: "Order received",
  quoted: "Order received",
  approved: "Ready to pack",
  packed: "Packed",
  dispatched: "On the way",
  delivered: "Delivered",
  completed: "Closed",
  cancelled: "Cancelled",
};
const orderHelp: Record<string, string> = {
  pending: "Review the items and confirm the order for the vendor.",
  quoted: "No vendor confirmation is required. Pack the requested items.",
  approved: "Pack the requested items.",
  packed: "Record payment if collected, then send the products.",
  dispatched: "Record payment while delivering and confirm receipt.",
  delivered: "Update any remaining payment, then close the order.",
  completed: "This order is complete. Payment records remain available.",
  cancelled: "This order was cancelled.",
};
export function WholesalePortal() {
  const [data, setData] = useState<any>(),
    [tab, setTab] = useState("Overview"),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState<any>(),
    [lowStockOnly, setLowStockOnly] = useState(false),
    [scanner, setScanner] = useState(false),
    [productPhotoMode,setProductPhotoMode] = useState(false),
    [packingOrder, setPackingOrder] = useState<any>(),
    [scanCode, setScanCode] = useState("");
  async function load() {
    try {
      setData(await api("/api/wholesale/portal"));
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(()=>{if(!editing)setProductPhotoMode(false)},[editing]);
  useEffect(() => {
    if (data?.permissions && tab === "Overview" && !data.permissions.includes("dashboard"))
      setTab(["Requests", "Products", "Vendors", "Transactions", "Expenses", "Employees", "Account", "Settings", "Subscription", "Support"]
        .find((name) => {
          const key: Record<string, string> = {
            Requests: "purchases", Products: "inventory", Vendors: "customers",
            Transactions: "payments", Expenses: "reports",
            Reports: "reports", Employees: "employees", Settings: "settings",
          };
          return !key[name] || data.permissions.includes(key[name]);
        }) || "Support");
  }, [data, tab]);
  async function post(path: string, body: any) {
    try {
      const result = await api(path, body);
      await load();
      setMessage("Saved successfully.");
      setEditing(undefined);
      return result;
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function saveProduct(body: any) {
    try {
      await api("/api/marketplace/products", body);
      await load();
      setMessage("Catalogue product saved.");
      setEditing(undefined);
      setProductPhotoMode(false);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function useScannedCode(raw: string) {
    try {
      const draft = parseProductCode(raw),
        code = draft.barcode || "";
      const found = code
        ? data?.products?.find((p: any) => p.sku === code)
        : undefined;
      if (found) {
        setEditing(found);
        setMessage("Product found. Update its stock or price.");
      } else {
        setEditing({
          active: true,
          sku: code,
          name: draft.name || "",
          mrp: draft.mrp ?? "",
          category: "General",
          unit: "piece",
          min_qty: 1,
        });
        setMessage(
          draft.mrp
            ? "Barcode and MRP copied. Review the details and save."
            : "New barcode copied. Add the product details and save.",
        );
      }
      setTab("Products");
      setScanCode("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function verifyPacking(order: any, codes: string[]) {
    const scanned = new Map<string, number>();
    for (const raw of codes) {
      try {
        const barcode = parseProductCode(raw).barcode || raw.trim();
        scanned.set(barcode, (scanned.get(barcode) || 0) + 1);
      } catch { /* Bad labels stay unmatched. */ }
    }
    const missing = order.items.filter((item: any) => !item.sku ||
      (scanned.get(item.sku) || 0) < Number(item.quantity));
    if (missing.length) {
      setMessage("Order #" + order.id.slice(0, 8).toUpperCase() +
        " still needs " + missing.map((item: any) => item.name + " × " +
          Math.max(0, Number(item.quantity) - (scanned.get(item.sku) || 0)) +
          (item.sku ? "" : " (no barcode)" )).join(", ") +
        ". Check quantities and use Items are packed for products without a barcode.");
      return;
    }
    try {
      await api("/api/marketplace/requests/" + order.id + "/status", { status: "packed" });
      await load();
      setMessage("All requested items scanned. Order marked packed.");
    } catch (error) { setMessage((error as Error).message); }
  }
  if (!data)
    return (
      <main className="account-gate">
        {message || "Loading wholesale portal…"}
      </main>
    );
  const tabAccess: Record<string, string> = {
    Overview: "dashboard",
    Requests: "purchases",
    Products: "inventory",
    Vendors: "customers",
    Transactions: "payments",
    Expenses: "reports",
    Reports: "reports",
    Employees: "employees",
    Settings: "settings",
  };
  const tabs = [
    "Overview",
    "Requests",
    "Products",
    "Vendors",
    "Transactions",
    "Expenses",
    "Employees",
    "Subscription",
    "Settings",
    "Support",
  ].filter((name) =>
    !["Employees", "Settings", "Support", "Subscription"].includes(name) && (name === "Vendors"
      ? data.permissions?.some((permission: string) => ["customers", "payments"].includes(permission))
      : name === "Transactions" ? data.permissions?.some((permission:string)=>["payments","returns"].includes(permission))
      : !tabAccess[name] || data.permissions?.includes(tabAccess[name])),
  );
  return (
    <main className="wholesale-portal">
      <header className="wholesale-header">
        <div className="wholesale-identity">
          {data.profile.logo_image ? (
            <img
              className="wholesale-logo"
              src={data.profile.logo_image}
              alt=""
            />
          ) : (
            <Package />
          )}
          <b>{data.profile.business_name}</b>
          <small>Wholesale seller console</small>
        </div>
        <nav aria-label="Wholesale pages">
          {tabs.map((x) => (
            <button
              className={tab === x ? "active" : ""}
              onClick={() => setTab(x)}
              key={x}
            >
              {x}
            </button>
          ))}
        </nav>
        <div className="wholesale-header-actions">
          <ThemeToggle />
          <Notifications
            onNavigate={(page) =>
              setTab(page === "Payments" ? "Transactions" : page)
            }
          />
          <button
            className="btn icon-only"
            aria-label="Refresh wholesale data"
            title="Refresh"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={17} />
          </button>
          <ProfileMenu name={data.profile.name || data.profile.business_name}
            detail={data.profile.email || data.profile.business_name} logo={data.profile.logo_image}
            links={([
              {label: "My profile & settings", page: "Settings", icon: Settings},
              {label: "Payment history", page: "Transactions", icon: IndianRupee},
              {label: "Subscription", page: "Subscription", icon: ShoppingCart},
              {label: "Employees", page: "Employees", icon: Users},
              {label: "Help & support", page: "Support", icon: CircleHelp},
            ]).filter((item) => !tabAccess[item.page] || data.permissions?.includes(tabAccess[item.page]))}
            onNavigate={setTab} onLogout={logout} />
        </div>
      </header>
      <div className="page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">WHOLESALE MANAGEMENT</span>
            <h1>{tab}</h1>
            <p>
              {tab === "Requests"
                ? "See what the vendor needs, send the final price, then update delivery."
                : tab === "Products"
                  ? "Scan a pack or add a product without a barcode."
                  : "Manage products, vendor orders, returns and payments in one place."}
            </p>
          </div>
          {tab === "Products" && (
            <div className="actions wholesale-product-actions">
              <button
                className="btn wholesale-camera-button"
                onClick={() => setScanner(true)}
              >
                <ScanBarcode size={17} />
                Scan product
              </button>
              <button
                className="btn primary"
                onClick={() =>
                  setEditing({
                    active: true,
                    category: "General",
                    unit: "piece",
                    min_qty: 1,
                  })
                }
              >
                <Plus size={17} />
                Add without barcode
              </button>
            </div>
          )}
        </div>
        <div className="notice subscription-strip">
          <b>{data.subscription.daysRemaining} days remaining</b> ·{" "}
          {data.subscription.period}
          {data.subscription.validUntil
            ? " · Valid until " +
              new Date(data.subscription.validUntil).toLocaleDateString("en-IN")
            : ""}
          {data.subscription.daysRemaining <= 5 && <strong className="renew-urgent">Renew your wholesale subscription now. {data.subscription.daysRemaining} day(s) left before orders are locked. <button className="btn primary" onClick={() => setTab("Subscription")}>Renew subscription</button></strong>}
        </div>
        {message && (
          <p role="status" className="status-message">
            {message}
          </p>
        )}
        {tab === "Overview" && data.permissions?.includes("dashboard") && (
          <>
            <Overview data={data} onLowStock={() => {setLowStockOnly(true); setTab("Products");}} />
            {data.permissions?.includes("reports") && <WholesaleReports data={data} />}
            <WholesaleOnboarding data={data} />
          </>
        )}{" "}
        {tab === "Requests" && (
          <MarketplaceRequests
            data={data}
            reload={load}
            setMessage={setMessage}
            scanToPack={setPackingOrder}
          />
        )}{" "}
        {tab === "Products" && (
          <>
            <section className="wholesale-scan-panel">
              <div>
                <ScanBarcode size={24} />
                <span>
                  <b>Scan a product</b>
                  <small>
                    Use the mobile camera, a barcode photo, USB scanner, or type
                    the code.
                  </small>
                </span>
              </div>
              <form
                className="scan-strip wholesale-scan-strip"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (scanCode.trim()) useScannedCode(scanCode);
                }}
              >
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="Wholesale barcode"
                  placeholder="Scan or type barcode"
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                />
                <button className="btn" disabled={!scanCode.trim()}>
                  Find or add
                </button>
              </form>
            </section>
            <div className="request-view-tabs"><button className={lowStockOnly ? "btn primary" : "btn"} onClick={() => setLowStockOnly(!lowStockOnly)}>{lowStockOnly ? "Show all inventory" : "Low stock / out of stock"}</button></div>
            <Products data={data} edit={setEditing} lowStockOnly={lowStockOnly} />
          </>
        )}{" "}
        {tab === "Vendors" && <><VendorAccess data={data} post={post} openRequests={() => setTab("Requests")} /><OfflineVendors vendors={data.offlineVendors || []} ledger={data.offlineLedger || []} canEdit={data.permissions.includes("customers")} canPay={data.permissions.includes("payments")} save={post} /></>}{" "}
        {tab === "Transactions" && <WholesaleTransactionHub data={data} reload={load} setMessage={setMessage} post={post} />}{" "}
        {tab === "Expenses" && <WholesaleExpenses data={data} reload={load} />}{" "}
        {tab === "Employees" && <Employees onMessage={setMessage} />}{" "}
        {tab === "Subscription" && (
          <WholesaleSubscription data={data} reload={load} />
        )}{" "}
        {tab === "Settings" && <WholesaleSettings data={data} post={post} reload={load} />}{" "}
        {tab === "Account" && <WholesaleSettings data={data} post={post} reload={load} />}{" "}
        {tab === "Support" && <Support />}
        {editing && (
          <div className="panel wholesale-editor">
            <div className="panel-heading">
              <div>
                <h2>{editing.id ? "Update" : "Add"} product</h2>
                <p>Scan the pack or enter only the details printed on it.</p>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => setScanner(true)}
              >
                <ScanBarcode size={17} />
                Scan product
              </button>
            </div>
            <div className="product-capture-actions"><button type="button" className="btn" aria-expanded={productPhotoMode} onClick={()=>setProductPhotoMode(mode=>!mode)}><Upload size={16}/>{productPhotoMode?'Hide photo options':'Read label from photo (optional)'}</button></div>
            {productPhotoMode&&<ProductLabel
              apply={(draft) =>
                setEditing((p: any) => ({
                  ...p,
                  ...(draft.barcode ? { sku: draft.barcode } : {}),
                  ...(draft.name ? { name: draft.name } : {}),
                  ...(draft.mrp !== undefined ? { mrp: draft.mrp } : {}),
                }))
              }
            />}
            <form
              key={[editing.id, editing.sku, editing.name, editing.mrp].join(
                "|",
              )}
              className="form product-editor-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void saveProduct({
                  id: editing.id,
                  name: f.get("name"),
                  sku: f.get("sku"),
                  category: f.get("category"),
                  subcategory: f.get("subcategory"),
                  description: f.get("description"),
                  unit: f.get("unit"),
                  weight: f.get("weight"),
                  price: Number(f.get("price")),
                  mrp: f.get("mrp") === "" ? "" : Number(f.get("mrp")),
                  stock: Number(f.get("stock")),
                  minQty: Number(f.get("minQty")),
                  bulkQty:
                    f.get("bulkQty") === "" ? "" : Number(f.get("bulkQty")),
                  bulkPrice:
                    f.get("bulkPrice") === "" ? "" : Number(f.get("bulkPrice")),
                  hsnCode: f.get("hsnCode"),
                  gstRate: Number(f.get("gstRate") || 0),
                  specialActive: f.get("specialActive") === "on",
                  specialDiscount: Number(f.get("specialDiscount") || 0),
                  active: f.get("active") === "on",
                });
              }}
            >
              <label>
                Product name
                <input name="name" defaultValue={editing.name} required />
              </label>
              <label>
                Barcode / item code
                <input
                  name="sku"
                  defaultValue={editing.sku}
                  placeholder="Optional for products without barcode"
                />
              </label>
              <label>
                Category
                <input
                  name="category"
                  defaultValue={editing.category || "General"}
                  required
                />
              </label>
              <label>Product subcategory
                <input name="subcategory" maxLength={100} defaultValue={editing.subcategory || ""} placeholder="For example: Rice, lentils, 1 kg packs" />
              </label>
              <small>Save each pack weight as a separate product with its own barcode or internal item code.</small>
              <label>
                Pack / unit
                <input
                  name="unit"
                  defaultValue={editing.unit || "piece"}
                  required
                />
              </label>
              <label>Weight / size
                <input name="weight" maxLength={50} defaultValue={editing.weight || ""} placeholder="500 g, 1 kg, 750 ml" />
              </label>
              <label>
                Wholesale price
                <input
                  name="price"
                  type="number"
                  min=".01"
                  step=".01"
                  defaultValue={editing.price}
                  required
                />
              </label>
              <label>
                MRP
                <input
                  name="mrp"
                  type="number"
                  min=".01"
                  step=".01"
                  defaultValue={editing.mrp ?? ""}
                />
              </label>
              <label>
                Available stock
                <input
                  name="stock"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={editing.stock ?? ""}
                  required
                />
              </label>
              <label>
                Minimum quantity
                <input
                  name="minQty"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={editing.min_qty ?? 1}
                  required
                />
              </label>
              <label>
                Bulk quantity
                <input
                  name="bulkQty"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={editing.bulk_qty ?? ""}
                />
              </label>
              <label>
                Bulk unit price
                <input
                  name="bulkPrice"
                  type="number"
                  min=".01"
                  step=".01"
                  defaultValue={editing.bulk_price ?? ""}
                />
              </label>
              <label className="check-row"><input type="checkbox" name="specialActive" defaultChecked={editing.special_active === true}/>Feature as a special discount for vendors</label>
              <label>Special discount per unit (₹)<input name="specialDiscount" type="number" min="0" step=".01" defaultValue={editing.special_discount ?? 0}/></label>
              <label>
                HSN / SAC code
                <input
                  name="hsnCode"
                  maxLength={20}
                  defaultValue={editing.hsn_code || ""}
                  placeholder="Optional"
                />
              </label>
              <label>
                GST rate
                <select name="gstRate" defaultValue={String(editing.gst_rate || 0)}>
                  <option value="0">0% / exempt</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </label>
              <label className="full-field">
                Product note (optional)
                <textarea
                  name="description"
                  maxLength={500}
                  defaultValue={editing.description}
                />
              </label>
              <label className="check-row">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={editing.active !== false}
                />{" "}
                Show this product to vendors
              </label>
              <div className="actions full-field">
                <button className="btn primary">Save product</button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setEditing(undefined)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
        <MobileScanner
          open={scanner}
          onClose={() => setScanner(false)}
          onScan={useScannedCode}
        />
        <MobileScanner
          open={Boolean(packingOrder)}
          onClose={() => setPackingOrder(undefined)}
          onScan={() => {}}
          multi
          onScanMany={(codes) => {
            if (packingOrder) void verifyPacking(packingOrder, codes);
          }}
        />
      </div>
    </main>
  );
}

function Overview({ data, onLowStock }: { data: any; onLowStock: () => void }) {
  const sales = data.transactions
      .filter((x: any) => ["paid", "partial"].includes(x.payment_status))
      .reduce((sum: number, x: any) => sum + Number(x.amount), 0) - data.refunds.filter((x:any)=>x.status==="processed").reduce((sum:number,x:any)=>sum+Number(x.amount),0),
    totalExpenses = (data.expenses||[]).reduce((sum:number,e:any)=>sum+Number(e.amount),0),
    inventoryUnits = data.products.reduce(
      (sum: number, x: any) => sum + Number(x.stock),
      0,
    ),
    inventoryValue = data.products.reduce(
      (sum: number, x: any) => sum + Number(x.stock) * Number(x.price),
      0,
    ),
    outstanding = data.requests.reduce(
      (sum: number, r: any) =>
        sum +
        orderFinancials(r, data.transactions, data.returns, data.refunds)
          .balance,
      0,
    ),
    returns = data.returns.filter(
      (x: any) => !["received", "rejected"].includes(x.status),
    );
  return (
    <div className="wholesale-dashboard">
      <div className="metrics">
        {data.permissions?.includes("inventory") && <button type="button" className="metric wholesale-low-stock" onClick={onLowStock}>
          <div><span>Low / out of stock</span><span className="metric-icon tone-2"><Package size={18} /></span></div>
          <strong>{data.products.filter((x: any) => Number(x.stock) <= Number(x.min_qty || 1)).length}</strong>
          <small>Open filtered inventory →</small>
        </button>}
        <div className="metric">
          <div>
            <span>Products</span>
            <span className="metric-icon tone-0">
              <Package size={18} />
            </span>
          </div>
          <strong>{data.products.length}</strong>
          <small>
            {data.products.filter((x: any) => x.active).length} active products
          </small>
        </div>
        <div className="metric">
          <div>
            <span>Selected vendors</span>
            <span className="metric-icon tone-1">
              <Users size={18} />
            </span>
          </div>
          <strong>{data.vendors.filter((x: any) => x.selected).length}</strong>
          <small>Can view your catalog</small>
        </div>
        <div className="metric">
          <div>
            <span>Open orders</span>
            <span className="metric-icon tone-2">
              <ShoppingCart size={18} />
            </span>
          </div>
          <strong>
            {
              data.requests.filter(
                (x: any) => !["completed", "cancelled"].includes(x.status),
              ).length
            }
          </strong>
          <small>Pack, deliver or collect payment</small>
        </div>
        <div className="metric">
          <div>
            <span>Amount received</span>
            <span className="metric-icon tone-3">
              <IndianRupee size={18} />
            </span>
          </div>
          <strong>{money(sales)}</strong>
          <small>{returns.length} open returns</small>
        </div>
      </div>
      <div className="metrics wholesale-finance-metrics">
        <div className="metric">
          <div>
            <span>Inventory units</span>
            <span className="metric-icon tone-0">
              <Package size={18} />
            </span>
          </div>
          <strong>{inventoryUnits}</strong>
          <small>Across active and hidden items</small>
        </div>
        <div className="metric">
          <div>
            <span>Inventory sale value</span>
            <span className="metric-icon tone-1">
              <IndianRupee size={18} />
            </span>
          </div>
          <strong>{money(inventoryValue)}</strong>
          <small>Current stock × wholesale price</small>
        </div>
        <div className="metric">
          <div>
            <span>Revenue collected</span>
            <span className="metric-icon tone-2">
              <IndianRupee size={18} />
            </span>
          </div>
          <strong>{money(sales)}</strong>
          <small>Confirmed paid and partial receipts</small>
        </div>
        <div className="metric">
          <div>
            <span>Outstanding</span>
            <span className="metric-icon tone-3">
              <Truck size={18} />
            </span>
          </div>
          <strong>{money(outstanding)}</strong>
          <small>Pending across vendor orders</small>
        </div>
        {data.permissions.includes("reports")&&<div className="metric"><div><span>Expenses</span><span className="metric-icon tone-1"><IndianRupee size={18}/></span></div><strong>{money(totalExpenses)}</strong><small>Collected less expenses: {money(sales-totalExpenses)}</small></div>}
      </div>
      <div className="bottom-grid">
        <section className="panel padded">
          <h2>Recent vendor orders</h2>
          {data.requests.slice(0, 5).map((r: any) => (
            <div className="record-row" key={r.id}>
              <div>
                <b>{r.vendorName}</b>
                <small>
                  {r.items
                    .map((i: any) => i.name + " × " + i.quantity)
                    .join(", ")}
                </small>
              </div>
              <b>{money(Number(r.total))}</b>
              <span className={"badge " + statusTone(r.status)}>
                {orderLabel[r.status] || r.status}
              </span>
            </div>
          ))}
          {!data.requests.length && (
            <p className="empty-inline">No vendor orders yet.</p>
          )}
        </section>
        <section className="panel padded">
          <h2>Return alerts</h2>
          {data.returns.slice(0, 5).map((r: any) => (
            <div className="record-row" key={r.id}>
              <RotateCcw size={18} />
              <div>
                <b>{r.product_name}</b>
                <small>
                  {r.vendorName} · {r.quantity} {r.unit}
                </small>
              </div>
              <b>{money(Number(r.quantity) * Number(r.unit_price))}</b>
            </div>
          ))}
          {!data.returns.length && (
            <p className="empty-inline">No product returns yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
function WholesaleExpenses({data,reload}:{data:any;reload:()=>Promise<void>}) {
  const [editing,setEditing]=useState<any>(null),[message,setMessage]=useState("");
  const expenses=data.expenses||[], total=expenses.reduce((sum:number,e:any)=>sum+Number(e.amount),0);
  return <div className="wholesale-expenses"><section className="panel padded"><h2>Wholesale expenses</h2><p>Rent, delivery, wages and other business costs. Total recorded: <b>{money(total)}</b></p><form key={editing?.id||"new"} className="form expense-editor" onSubmit={async event=>{event.preventDefault();const form=event.currentTarget,f=new FormData(form);try{await api("/api/wholesale/expenses",{id:editing?.id,category:f.get("category"),description:f.get("description"),amount:Number(f.get("amount")),expenseDate:f.get("expenseDate")});setEditing(null);form.reset();setMessage("Expense saved.");await reload()}catch(error){setMessage((error as Error).message)}}}>
    <label>Category<select name="category" defaultValue={editing?.category||"Rent"}>{["Rent","Wages","Delivery","Utilities","Packaging","Maintenance","Other"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Description<input name="description" maxLength={300} defaultValue={editing?.description||""} placeholder="Optional note"/></label><label>Amount ₹<input name="amount" type="number" min="0.01" max="10000000" step="0.01" defaultValue={editing?.amount||""} required/></label><label>Date<input name="expenseDate" type="date" defaultValue={editing?.expense_date||new Date().toISOString().slice(0,10)} required/></label><button className="btn primary">{editing?"Update":"Add"} expense</button>{editing&&<button className="btn" type="button" onClick={()=>setEditing(null)}>Cancel</button>}</form><p role="status">{message}</p></section>
    <section className="panel padded"><h2>Expense history</h2>{expenses.map((e:any)=><div className="record-row" key={e.id}><div><b>{e.category} · {money(Number(e.amount))}</b><small>{e.expense_date} · {e.description||"No note"}</small></div><div className="actions"><button className="btn" onClick={()=>setEditing(e)}>Edit</button><button className="text-button danger" onClick={async()=>{if(!confirm("Delete this expense?"))return;try{await api("/api/wholesale/expenses/"+e.id+"/delete",{});await reload()}catch(error){setMessage((error as Error).message)}}}>Delete</button></div></div>)}{!expenses.length&&<p className="empty-inline">No expenses recorded yet.</p>}</section></div>;
}
function WholesaleReports({ data }: { data: any }) {
  const revenue = data.transactions
      .filter((x: any) => ["paid", "partial"].includes(x.payment_status))
      .reduce((sum: number, x: any) => sum + Number(x.amount), 0) - data.refunds.filter((x:any)=>x.status==="processed").reduce((sum:number,x:any)=>sum+Number(x.amount),0),
    outstanding = data.requests.reduce(
      (sum: number, r: any) =>
        sum +
        orderFinancials(r, data.transactions, data.returns, data.refunds)
          .balance,
      0,
    ),
    stockValue = data.products.reduce(
      (sum: number, p: any) => sum + Number(p.stock) * Number(p.price),
      0,
    ),
    expenses=(data.expenses||[]).reduce((sum:number,e:any)=>sum+Number(e.amount),0),
    units = data.products.reduce(
      (sum: number, p: any) => sum + Number(p.stock),
      0,
    );
  return (
    <div className="report-stack">
      <div className="metrics">
        <div className="metric">
          <span>Confirmed revenue</span>
          <strong>{money(revenue)}</strong>
          <small>Paid and partial receipts</small>
        </div>
        <div className="metric">
          <span>Outstanding</span>
          <strong>{money(outstanding)}</strong>
          <small>Yet to collect from vendors</small>
        </div>
        <div className="metric"><span>Expenses recorded</span><strong>{money(expenses)}</strong><small>Revenue after expenses: {money(revenue-expenses)}</small></div>
        <div className="metric">
          <span>Inventory value</span>
          <strong>{money(stockValue)}</strong>
          <small>{units} units in stock</small>
        </div>
        <div className="metric">
          <span>Delivered orders</span>
          <strong>
            {
              data.requests.filter((r: any) =>
                ["delivered", "completed"].includes(r.status),
              ).length
            }
          </strong>
          <small>Ready for invoices and payment</small>
        </div>
      </div>
      <section className="panel table-scroll">
        <div className="panel-heading">
          <div>
            <h2>Inventory report</h2>
            <p>Live wholesale stock and sale value.</p>
          </div>
        </div>
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Units</th>
              <th>Unit price</th>
              <th>Stock value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.products.map((p: any) => (
              <tr key={p.id}>
                <td>
                  <b>{p.name}</b>
                  <small className="block-text">{p.sku || "No barcode"}</small>
                </td>
                <td>{p.category}</td>
                <td>
                  {p.stock} {p.unit}
                </td>
                <td>{money(Number(p.price))}</td>
                <td>{money(Number(p.stock) * Number(p.price))}</td>
                <td>
                  <span className={"badge " + (p.active ? "green" : "amber")}>
                    {p.active ? "Active" : "Hidden"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.products.length && (
          <p className="empty-inline">
            Add products to see inventory reporting.
          </p>
        )}
      </section>
    </div>
  );
}
function WholesaleOnboarding({ data }: { data: any }) {
  const items = [
    [
      "Complete marketplace profile",
      !!data.profile.service_areas && !!data.profile.brands,
    ],
    ["Upload business logo", !!data.profile.logo_image],
    ["Add catalogue products", data.products.length > 0],
    [
      "Choose catalogue visibility",
      data.profile.visibility_mode === "public" ||
        data.vendors.some((x: any) => x.selected),
    ],
    [
      "Pack first vendor order",
      data.requests.some((x: any) =>
        ["packed", "dispatched", "delivered", "completed"].includes(x.status),
      ),
    ],
  ];
  return (
    <section className="panel padded onboarding-card">
      <div>
        <span className="eyebrow">GROW YOUR NETWORK</span>
        <h2>Wholesale launch checklist</h2>
        <p>
          {items.filter((x) => x[1]).length} of {items.length} completed
        </p>
      </div>
      <div className="onboarding-list">
        {items.map(([label, done]) => (
          <span className={done ? "done" : ""} key={String(label)}>
            {done ? "✓" : "○"} {label}
          </span>
        ))}
      </div>
    </section>
  );
}
function Requests({
  data,
  post,
}: {
  data: any;
  post: (p: string, b: any) => Promise<void>;
}) {
  return (
    <section className="panel table-scroll">
      <table className="ledger-table">
        <thead>
          <tr>
            {["Vendor", "Items", "Total", "Status", "Actions"].map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.requests.map((r: any) => (
            <tr key={r.id}>
              <td>{r.vendorName}</td>
              <td>
                {r.items
                  .map((i: any) => i.name + " × " + i.quantity)
                  .join(", ")}
              </td>
              <td>{money(Number(r.total))}</td>
              <td>
                <span className={"badge " + statusTone(r.status)}>
                  {r.status}
                </span>
              </td>
              <td className="actions">
                {r.status === "pending" && (
                  <button
                    className="btn"
                    onClick={() =>
                      void post("/api/wholesale/requests/" + r.id + "/status", {
                        status: "accepted",
                      })
                    }
                  >
                    Accept
                  </button>
                )}
                {["pending", "accepted"].includes(r.status) && (
                  <button
                    className="btn primary"
                    onClick={() =>
                      void post("/api/wholesale/requests/" + r.id + "/status", {
                        status: "completed",
                      })
                    }
                  >
                    Complete
                  </button>
                )}
                {["pending", "accepted"].includes(r.status) && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void post("/api/wholesale/requests/" + r.id + "/status", {
                        status: "cancelled",
                      })
                    }
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.requests.length && (
        <p className="empty-inline">Vendor requests will appear here.</p>
      )}
    </section>
  );
}
function MarketplaceRequests({
  data,
  reload,
  setMessage,
  scanToPack,
}: {
  data: any;
  reload: () => Promise<void>;
  setMessage: (x: string) => void;
  scanToPack: (order: any) => void;
}) {
  const [requestView, setRequestView] = useState<"open" | "completed">("open");
  const [archiveQuery,setArchiveQuery]=useState(""),[from,setFrom]=useState(""),[through,setThrough]=useState(""),[expanded,setExpanded]=useState("");
  async function call(path: string, body: any, message: string) {
    try {
      await api(path, body);
      setMessage(message);
      await reload();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const next: any = {
      pending: "approved",
      quoted: "approved",
      approved: "packed",
      packed: "dispatched",
      dispatched: "delivered",
      delivered: "completed",
    },
    action: any = {
      pending: "Confirm this order",
      quoted: "Confirm this order",
      approved: "Items are packed",
      packed: "Send for delivery",
      dispatched: "Vendor received items",
      delivered: "Close this order",
    };
  return (
    <>
      <section className="simple-flow">
        <div>
          <b>1. Confirm order</b>
          <small>Vendor immediately sees your confirmation.</small>
        </div>
        <div>
          <b>2. Pack & deliver</b>
          <small>Update one step at a time.</small>
        </div>
        <div>
          <b>3. Record payment</b>
          <small>Paid, partial or pending.</small>
        </div>
      </section>
      <div className="request-view-tabs" role="group" aria-label="Product request status">
        <button className={requestView === "open" ? "btn primary" : "btn"} onClick={() => setRequestView("open")}>To pack & deliver ({data.requests.filter((r: any) => !["completed", "cancelled"].includes(r.status)).length})</button>
        <button className={requestView === "completed" ? "btn primary" : "btn"} onClick={() => setRequestView("completed")}>Completed & cancelled ({data.requests.filter((r: any) => ["completed", "cancelled"].includes(r.status)).length})</button>
      </div>
      {requestView === "completed" && <div className="panel padded archive-orders"><div className="archive-filters"><label>Search vendor, product or order<input value={archiveQuery} onChange={e=>setArchiveQuery(e.target.value)} placeholder="Search completed orders"/></label><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={through} onChange={e=>setThrough(e.target.value)}/></label></div>
        {data.requests.filter((r:any)=>["completed","cancelled"].includes(r.status) && (!archiveQuery || (r.id+" "+r.vendorName+" "+r.items.map((i:any)=>i.name).join(" ")).toLowerCase().includes(archiveQuery.toLowerCase())) && (!from || new Date(Number(r.created_at)).toISOString().slice(0,10)>=from) && (!through || new Date(Number(r.created_at)).toISOString().slice(0,10)<=through)).map((r:any)=>{const finance=orderFinancials(r,data.transactions,data.returns,data.refunds),open=expanded===r.id;return <article className="archive-order" key={r.id}><button type="button" className="admin-business-row" aria-expanded={open} onClick={()=>setExpanded(open?"":r.id)}><span><b>{r.vendorName} · #{r.id.slice(0,8).toUpperCase()}</b><small>{new Date(Number(r.created_at)).toLocaleString("en-IN")} · {r.items.length} items</small></span><span className={"badge "+statusTone(r.status)}>{r.status}</span><b>{money(finance.payable)}</b></button>{open&&<div className="archive-detail"><p>{r.notes||"No order notes"} · {orderHelp[r.status]}</p>{r.items.map((i:any)=><div className="record-row" key={i.product_id}><b>{i.name}</b><small>{i.quantity} {i.unit}{i.weight?" · "+i.weight:""}</small><b>{money(Number(i.quantity)*Number(i.unit_price))}</b></div>)}<div className="payment-numbers"><span>Paid <b>{money(finance.paid)}</b></span><span>Pending <b>{money(finance.balance)}</b></span><span>Returns <b>{money(finance.returnCredit)}</b></span><span>Refund due <b>{money(finance.refundDue)}</b></span></div><h3>Payments</h3>{data.transactions.filter((t:any)=>t.request_id===r.id).map((t:any)=><div className="record-row" key={t.id}><b>{money(Number(t.amount))} · {t.payment_status}</b><small>{paymentTime(t.created_at)} · {t.reference||"No reference"}</small></div>)}<h3>Returns and refunds</h3>{data.returns.filter((x:any)=>x.request_id===r.id).map((x:any)=><div className="record-row" key={x.id}><b>{x.product_name} · {x.status}</b><small>{x.quantity} × {money(Number(x.unit_price))} · {x.reason}</small></div>)}{data.refunds.filter((x:any)=>data.transactions.some((t:any)=>t.request_id===r.id&&t.id===x.transaction_id)).map((x:any)=><div className="record-row" key={x.id}><b>Refund {money(Number(x.amount))} · {x.status}</b><small>{x.reason}</small></div>)}{r.status==="completed"&&<WholesaleInvoiceButton order={r} sellerName={data.profile.business_name} sellerGst={data.profile.gst_number} sellerAddress={data.profile.address} buyerName={r.vendorName} transactions={data.transactions} returns={data.returns} refunds={data.refunds}/>}</div>}</article>})}
      </div>}
      <div className="order-list wholesale-request-tiles">
        {data.requests.filter((r: any) => requestView === "open" && !["completed", "cancelled"].includes(r.status)).map((r: any) => {
          const finance = orderFinancials(
              r,
              data.transactions,
              data.returns,
              data.refunds,
            ),
            payments = data.transactions.filter(
              (t: any) => t.request_id === r.id,
            );
          return (
            <article className="panel padded order-card" key={r.id}>
              <div className="panel-heading">
                <div>
                  <b>{r.vendorName}</b>
                  <small>
                    Order #{r.id.slice(0, 8).toUpperCase()} ·{" "}
                    {new Date(Number(r.created_at)).toLocaleDateString("en-IN")}
                  </small>
                </div>
                <span className={"badge " + statusTone(r.status)}>
                  {orderLabel[r.status] || r.status}
                </span>
              </div>
              <div className="next-action">
                <b>Next step</b>
                <span>{orderHelp[r.status] || "Review this order."}</span>
              </div>
              <div className="simple-item-list">
                {r.items.map((i: any) => (
                  <span key={i.product_id}>
                    <b>{i.name}</b>
                    <em>
                      {i.quantity} {i.unit}{i.weight ? " · " + i.weight : ""}
                    </em>
                  </span>
                ))}
              </div>
              <div className="order-total">
                <span>Net payable {money(finance.payable)}</span>
                <span>Received {money(finance.paid)}</span>
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
                  Received returns credited: {money(finance.returnCredit)}
                </small>
              )}
              <div className="actions">
                {next[r.status] && (
                  <button
                    className="btn primary large-action"
                    onClick={() =>
                      void call(
                        "/api/marketplace/requests/" + r.id + "/status",
                        { status: next[r.status] },
                        action[r.status] + ".",
                      )
                    }
                  >
                    {action[r.status]}
                  </button>
                )}
                {r.status === "approved" && r.items.some((item: any) => item.sku) && (
                  <button className="btn" onClick={() => scanToPack(r)}>
                    <ScanBarcode size={16} /> Scan items to pack
                  </button>
                )}
                {["delivered", "completed"].includes(r.status) && (
                  <WholesaleInvoiceButton
                    order={r}
                    sellerName={data.profile.business_name}
                    sellerGst={data.profile.gst_number}
                    sellerAddress={data.profile.address}
                    buyerName={r.vendorName}
                    transactions={data.transactions}
                    returns={data.returns}
                    refunds={data.refunds}
                  />
                )}
              </div>
              {["packed", "dispatched", "delivered", "completed"].includes(
                r.status,
              ) && (
                <PaymentManager
                  order={r}
                  due={finance.balance}
                  payments={payments}
                  call={call}
                />
              )}
            </article>
          );
        })}
        {requestView === "open" && !data.requests.some((r: any) => !["completed", "cancelled"].includes(r.status)) && (
          <section className="panel padded">
            <p className="empty-inline">{requestView === "open" ? "No open vendor requests." : "No completed requests yet."}</p>
          </section>
        )}
      </div>
    </>
  );
}
function PaymentManager({
  order,
  due,
  payments,
  call,
}: {
  order: any;
  due: number;
  payments: any[];
  call: (path: string, body: any, message: string) => Promise<void>;
}) {
  const [status, setStatus] = useState(due > 0 ? "partial" : "paid");
  return (
    <section className="delivery-payment">
      <div>
        <b>Payment record</b>
        <small>
          {due > 0 ? money(due) + " still pending" : "Payment completed"}
        </small>
      </div>
      {due > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void call(
              "/api/marketplace/requests/" + order.id + "/payment",
              {
                paymentStatus: status,
                amount: status === "pending" ? 0 : Number(f.get("amount")),
                reference: f.get("reference"),
              },
              status === "pending"
                ? "Payment kept as pending."
                : "Payment recorded.",
            );
          }}
        >
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="partial">Part payment</option>
              <option value="paid">Fully paid</option>
              <option value="pending">Not paid</option>
            </select>
          </label>
          {status !== "pending" && (
            <label>
              Amount received
              <input
                name="amount"
                type="number"
                min=".01"
                max={due}
                step=".01"
                defaultValue={status === "paid" ? due : ""}
                key={status}
                required
              />
            </label>
          )}
          <label>
            Reference / note
            <input name="reference" placeholder="Cash, UPI number or note" />
          </label>
          <button className="btn">Save payment</button>
        </form>
      )}
      {payments.length > 0 && (
        <div className="payment-history">
          {payments.map((p) => (
            <span key={p.id}>
              <b>
                {p.payment_status === "pending"
                  ? "Pending"
                  : money(Number(p.amount))}
              </b>
              <small>
                {paymentTime(p.created_at) + (p.reference ? " · " + p.reference : "")}
              </small>
              {p.payment_status === "pending" && p.submitted_by_vendor && (
                <span className="actions">
                  <button
                    className="btn"
                    onClick={() =>
                      void call(
                        "/api/marketplace/payments/" + p.id + "/confirm",
                        {},
                        "Vendor payment confirmed.",
                      )
                    }
                  >
                    Confirm UPI
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() =>
                      void call(
                        "/api/marketplace/payments/" + p.id + "/reject",
                        {
                          reason:
                            prompt(
                              "Why is this payment rejected?",
                              "Transaction not found",
                            ) || "Transaction not found",
                        },
                        "Payment rejected.",
                      )
                    }
                  >
                    Reject
                  </button>
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
function Products({ data, edit, lowStockOnly }: { data: any; edit: (x: any) => void; lowStockOnly: boolean }) {
  return (
    <section className="panel table-scroll wholesale-products-table">
      <table className="ledger-table">
        <thead>
          <tr>
            {[
              "Product",
              "Category",
              "Barcode",
              "Unit",
              "Weight",
              "Price / bulk",
              "GST / HSN",
              "Minimum",
              "Stock",
              "Status",
              "",
            ].map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.products.filter((p: any) => !lowStockOnly || Number(p.stock) <= Number(p.min_qty || 1)).map((p: any) => (
            <tr key={p.id}>
              <td data-label="Product">
                <b>{p.name}</b>
                {p.special_active && <span className="badge green">Special −{money(Number(p.special_discount))}</span>}
                {p.description && (
                  <small className="block-text">{p.description}</small>
                )}
              </td>
              <td data-label="Category">{p.category}{p.subcategory && <small className="block-text">{p.subcategory}</small>}</td>
              <td data-label="Barcode">{p.sku || "No barcode"}</td>
              <td data-label="Unit">{p.unit}</td>
              <td data-label="Weight">{p.weight || "—"}</td>
              <td data-label="Price">
                {money(Number(p.price))}
                {p.bulk_qty && p.bulk_price && (
                  <small className="block-text">
                    {p.bulk_qty}+ · {money(Number(p.bulk_price))}
                  </small>
                )}
              </td>
              <td data-label="GST / HSN">
                {Number(p.gst_rate || 0)}%
                <small className="block-text">{p.hsn_code || "No HSN"}</small>
              </td>
              <td data-label="Minimum">{p.min_qty || 1}</td>
              <td data-label="Stock">{p.stock}</td>
              <td data-label="Status">
                <span className={"badge " + (p.active ? "green" : "amber")}>
                  {p.active ? "Active" : "Hidden"}
                </span>
              </td>
              <td data-label="Action">
                <button className="btn" onClick={() => edit(p)}>
                  Edit product
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.products.length && (
        <p className="empty-inline">
          Scan or add your first wholesale product.
        </p>
      )}
      {lowStockOnly && data.products.length > 0 && !data.products.some((p: any) => Number(p.stock) <= Number(p.min_qty || 1)) && <p className="empty-inline">No low-stock or out-of-stock wholesale items.</p>}
    </section>
  );
}
function VendorAccess({
  data,
  post,
  openRequests,
}: {
  data: any;
  post: (p: string, b: any) => Promise<void>;
  openRequests: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [activeId, setActiveId] = useState<string>("");
  useEffect(
    () =>
      setSelected(
        data.vendors.filter((v: any) => v.selected && !v.suspended).map((v: any) => v.id),
      ),
    [data.vendors],
  );
  const vendor = data.vendors.find((v: any) => v.id === activeId),
    orders = data.requests.filter((r: any) => r.vendor_id === activeId && r.status !== "cancelled"),
    payments = data.transactions.filter((t: any) => t.vendor_id === activeId),
    returns = data.returns.filter((r: any) => r.vendor_id === activeId),
    refunds = data.refunds.filter((refund: any) =>
      payments.some((payment: any) => payment.id === refund.transaction_id),
    ),
    summary = orders.reduce(
      (total: any, order: any) => {
        const finance = orderFinancials(order, data.transactions, data.returns, data.refunds);
        total.sales += finance.payable;
        total.paid += finance.paid;
        total.pending += finance.balance;
        total.refunds += finance.refundDue;
        return total;
      },
      { sales: 0, paid: 0, pending: 0, refunds: 0 },
    );
  return (
    <div className="vendor-management-layout">
      <section className="panel padded vendor-access-panel">
        <div className="panel-heading">
          <div>
            <h2>Vendor management</h2>
            <p>Select a vendor to view orders, payments, returns and balances.</p>
          </div>
          <span className="badge green">{selected.length} catalog users</span>
        </div>
        <div className="vendor-management-list">
          {data.vendors.map((v: any) => {
            const vendorOrders = data.requests.filter((r: any) => r.vendor_id === v.id && r.status !== "cancelled"),
              pending = vendorOrders.reduce(
                (sum: number, order: any) =>
                  sum + orderFinancials(order, data.transactions, data.returns, data.refunds).balance,
                0,
              );
            return (
              <article className={"vendor-management-row " + (activeId === v.id ? "active" : "")} key={v.id}>
                <label title="Allow this vendor to see your catalogue">
                  <input
                    type="checkbox"
                    disabled={Boolean(v.suspended) || !data.permissions.includes("customers")}
                    checked={selected.includes(v.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, v.id]
                          : selected.filter((id) => id !== v.id),
                      )
                    }
                  />
                </label>
                <button type="button" onClick={() => setActiveId(v.id)}>
                  <span><b>{v.name}</b><small>{vendorOrders.length} orders · {money(pending)} pending{v.suspended ? " · Store suspended" : ""}</small></span>
                  <ChevronRight size={18} />
                </button>
              </article>
            );
          })}
        </div>
        {!data.vendors.length && <p className="empty-inline">No active vendors are available.</p>}
        {data.permissions.includes("customers") && (
          <button className="btn primary" onClick={() => void post("/api/wholesale/access", { vendorIds: selected })}>
            Save catalogue access
          </button>
        )}
      </section>
      <section className="panel padded vendor-payment-details">
        {!data.permissions.includes("payments") ? (
          <p className="empty-inline">Payment details require Payments access.</p>
        ) : !vendor ? (
          <div className="empty-state"><Users size={32} /><h2>Choose a vendor</h2><p>All payment-related details will appear here.</p></div>
        ) : (
          <>
            <div className="panel-heading"><div><h2>{vendor.name}</h2><p>Complete account and payment view</p></div><span className={"badge " + (summary.pending ? "amber" : "green")}>{summary.pending ? money(summary.pending) + " due" : "Paid"}</span></div>
            <div className="vendor-payment-metrics">
              <span><small>Net sales</small><b>{money(summary.sales)}</b></span>
              <span><small>Received</small><b>{money(summary.paid)}</b></span>
              <span><small>Pending</small><b>{money(summary.pending)}</b></span>
              <span><small>Refund due</small><b>{money(summary.refunds)}</b></span>
            </div>
            <h3>Orders and balances</h3>
            <div className="vendor-order-ledger">
              {orders.map((order: any) => {
                const finance = orderFinancials(order, data.transactions, data.returns, data.refunds);
                return <div className="record-row" key={order.id}>
                  <div><b>#{order.id.slice(0, 8).toUpperCase()}</b><small>{new Date(Number(order.created_at)).toLocaleDateString("en-IN")} · {orderLabel[order.status] || order.status}</small></div>
                  <div><b>{money(finance.payable)}</b><small>{money(finance.paid)} paid · {money(finance.balance)} pending</small></div>
                  <div className="actions">
                    {["delivered", "completed"].includes(order.status) && <WholesaleInvoiceButton order={order} sellerName={data.profile.business_name} sellerGst={data.profile.gst_number} sellerAddress={data.profile.address} buyerName={vendor.name} transactions={data.transactions} returns={data.returns} refunds={data.refunds} />}
                  {data.permissions.includes("purchases") && <button className="btn" onClick={openRequests}>Manage order</button>}
                  </div>
                </div>;
              })}
              {!orders.length && <p className="empty-inline">No orders from this vendor.</p>}
            </div>
            <h3>Payment history</h3>
            {payments.map((payment: any) => <div className="record-row" key={payment.id}><div><b>{money(Number(payment.amount))} · #{payment.request_id.slice(0, 8).toUpperCase()}</b><small>{paymentTime(payment.created_at)} · {payment.reference || "No reference"}</small>{payment.rejection_reason && <small>Reason: {payment.rejection_reason}</small>}</div><span className={"badge " + statusTone(payment.payment_status)}>{payment.payment_status === "pending" && payment.submitted_by_vendor ? "UPI awaiting approval" : payment.payment_status}</span></div>)}
            {!payments.length && <p className="empty-inline">No payments recorded.</p>}
            <h3>Returns and refunds</h3>
            {returns.map((item: any) => <div className="record-row" key={item.id}><div><b>{item.product_name} · {item.quantity} {item.unit}</b><small>Order #{item.request_id.slice(0, 8).toUpperCase()} · {item.reason}</small></div><b>{money(Number(item.quantity) * Number(item.unit_price))}</b><span className={"badge " + statusTone(item.status)}>{item.status}</span></div>)}
            {refunds.map((item: any) => <div className="record-row" key={item.id}><div><b>Refund · {money(Number(item.amount))}</b><small>{item.reason}</small></div><span className={"badge " + statusTone(item.status)}>{item.status}</span></div>)}
            {!returns.length && !refunds.length && <p className="empty-inline">No returns or refunds.</p>}
          </>
        )}
      </section>
    </div>
  );
}
function WholesaleTransactionHub({data,reload,setMessage,post}:{data:any;reload:()=>Promise<void>;setMessage:(value:string)=>void;post:(path:string,body:any)=>Promise<void>}){
  const [view,setView]=useState("Payments");
  const tabs=[...(data.permissions.includes("payments")?["Payments"]:[]),...(data.permissions.includes("returns")?["Returns","Refunds"]:[])];
  const current=tabs.includes(view)?view:tabs[0];
  return <div><div className="console-tabs" role="tablist" aria-label="Transaction records">{tabs.map(x=><button key={x} role="tab" aria-selected={current===x} className={current===x?"active":""} onClick={()=>setView(x)}>{x}</button>)}</div>{current==="Payments"&&<Transactions data={data} reload={reload} setMessage={setMessage}/ >}{current==="Returns"&&<Returns data={data} post={post}/ >}{current==="Refunds"&&<Refunds data={data} post={post}/ >}</div>;
}
function Transactions({
  data,
  reload,
  setMessage,
}: {
  data: any;
  reload: () => Promise<void>;
  setMessage: (value: string) => void;
}) {
  const [selected,setSelected]=useState(""),[activeVendor,setActiveVendor]=useState("");
  const current=data.transactions.find((x:any)=>x.id===selected),currentOrder=data.requests.find((x:any)=>x.id===current?.request_id);
  const vendors = [...new Set(data.requests.map((r: any) => r.vendor_id))];
  async function settle(path: string, body: any) {
    try {
      await api(path, body);
      await reload();
      setMessage("Payment updated.");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="transaction-ledger">
      <section className="notice">
        <b>
          Payments and return credits update these balances automatically.
          Record new payments from Requests while packing or delivering.
        </b>
      </section>
      <section className="panel padded"><h2>Retail partners</h2><p>Open a retailer to see recent activity and full transaction history.</p><div className="admin-business-list">{vendors.map((id:any)=>{const orders=data.requests.filter((r:any)=>r.vendor_id===id&&!['cancelled'].includes(r.status));const latest=data.requests.find((r:any)=>r.vendor_id===id);const finance=orders.reduce((a:any,r:any)=>{const f=orderFinancials(r,data.transactions,data.returns,data.refunds);a.sales+=f.payable;a.paid+=f.paid;a.pending+=f.balance;return a},{sales:0,paid:0,pending:0});return <button type="button" className="admin-business-row" aria-expanded={activeVendor===id} key={id} onClick={()=>{setActiveVendor(activeVendor===id?'':id);setSelected('')}}><span><b>{latest?.vendorName||'Retailer'}</b><small>{orders.length} orders · Received {money(finance.paid)} · Sales {money(finance.sales)}</small></span><b>{money(finance.pending)} pending</b><span>View →</span></button>})}{!vendors.length&&<p className="empty-inline">No retailers with orders yet.</p>}</div></section>
      {activeVendor&&<><section className="panel padded"><h2>Recent activity · {data.requests.find((r:any)=>r.vendor_id===activeVendor)?.vendorName}</h2>{data.requests.filter((r:any)=>r.vendor_id===activeVendor).slice(0,3).map((r:any)=><div className="record-row" key={r.id}><b>Order #{r.id.slice(0,8).toUpperCase()} · {r.status}</b><small>{paymentTime(r.created_at)}</small></div>)}{data.transactions.filter((t:any)=>t.vendor_id===activeVendor).slice(0,3).map((t:any)=><div className="record-row" key={t.id}><b>Payment {money(Number(t.amount))} · {t.payment_status}</b><small>{paymentTime(t.created_at)}</small></div>)}</section>
      <section className="order-payment-list">
        {data.requests
          .filter((r: any) => r.vendor_id===activeVendor && !["cancelled"].includes(r.status))
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
                  <b>{r.vendorName}</b>
                  <small>Order #{r.id.slice(0, 8).toUpperCase()}</small>
                </div>
                <div className="payment-numbers">
                  <span>
                    Order <b>{money(f.total)}</b>
                  </span>
                  <span>
                    Returns <b>−{money(f.returnCredit)}</b>
                  </span>
                  <span>
                    Received <b>{money(f.paid)}</b>
                  </span>
                  <span>
                    {f.refundDue ? "Refund due" : "Pending"}{" "}
                    <b>{money(f.refundDue || f.balance)}</b>
                  </span>
                </div>
                {["delivered", "completed"].includes(r.status) && (
                  <WholesaleInvoiceButton
                    order={r}
                    sellerName={data.profile.business_name}
                    sellerGst={data.profile.gst_number}
                    sellerAddress={data.profile.address}
                    buyerName={r.vendorName}
                    transactions={data.transactions}
                    returns={data.returns}
                    refunds={data.refunds}
                  />
                )}
              </article>
            );
          })}
      </section>
      <section className="panel padded">
        <h2>Payment history</h2>
        {data.transactions.filter((t:any)=>t.vendor_id===activeVendor).map((t: any) => (
          <div className="record-row return-row" key={t.id} role="button" tabIndex={0} onClick={()=>setSelected(t.id)} onKeyDown={e=>{if(e.key==="Enter")setSelected(t.id)}}>
            <div>
              <b>
                {t.vendorName} ·{" "}
                {t.payment_status === "pending"
                  ? "No payment"
                  : money(Number(t.amount))}
              </b>
              <small>
                {paymentTime(t.created_at) + (t.reference ? " · " + t.reference : "")}
              </small>
            </div>
            <span className={"badge " + statusTone(t.payment_status)}>
              {t.payment_status}
            </span>
            {t.payment_status === "pending" && t.submitted_by_vendor && (
              <div className="actions">
                <button className="btn primary" onClick={e => {e.stopPropagation();void settle("/api/marketplace/payments/" + t.id + "/confirm", {})}}>Confirm UPI</button>
                <button className="btn" onClick={e => {e.stopPropagation();
                  const reason = prompt("Why is this payment rejected?", "Transaction not found");
                  if (reason !== null) void settle("/api/marketplace/payments/" + t.id + "/reject", { reason });
                }}>Reject</button>
              </div>
            )}
          </div>
        ))}
        {!data.transactions.length && (
          <p className="empty-inline">No payments recorded yet.</p>
        )}
      </section>
      <section className="panel padded"><h2>Returns and refunds</h2>{data.returns.filter((x:any)=>x.vendor_id===activeVendor).map((x:any)=><div className="record-row" key={x.id}><b>{x.product_name} · {x.status}</b><small>{x.quantity} {x.unit} · {x.reason}</small></div>)}{data.refunds.filter((x:any)=>data.transactions.some((t:any)=>t.id===x.transaction_id&&t.vendor_id===activeVendor)).map((x:any)=><div className="record-row" key={x.id}><b>Refund {money(Number(x.amount))} · {x.status}</b><small>{x.reason}</small></div>)}{!data.returns.some((x:any)=>x.vendor_id===activeVendor)&&!data.refunds.some((x:any)=>data.transactions.some((t:any)=>t.id===x.transaction_id&&t.vendor_id===activeVendor))&&<p>No returns or refunds for this retailer.</p>}</section>
      </>}{current&&<section className="panel padded return-details"><div className="panel-heading"><div><h2>Payment #{current.id.slice(0,8).toUpperCase()}</h2><p>{current.vendorName} · Order #{current.request_id.slice(0,8).toUpperCase()}</p></div><button className="btn" onClick={()=>setSelected("")}>Close</button></div><p>{paymentTime(current.created_at)} · {money(Number(current.amount))} · {current.payment_status} · {current.reference||"No reference"}</p><p>Order status: {currentOrder?.status||"Unavailable"}</p><h3>Order payments</h3>{data.transactions.filter((x:any)=>x.request_id===current.request_id).map((x:any)=><div className="record-row" key={x.id}><b>{money(Number(x.amount))} · {x.payment_status}</b><small>{paymentTime(x.created_at)} · {x.reference||"No reference"}</small></div>)}<h3>Returns and refunds</h3>{data.returns.filter((x:any)=>x.request_id===current.request_id).map((x:any)=><div className="record-row" key={x.id}><b>{x.product_name} · {x.status}</b><small>{x.reason}</small></div>)}{data.refunds.filter((x:any)=>data.transactions.some((t:any)=>t.request_id===current.request_id&&t.id===x.transaction_id)).map((x:any)=><div className="record-row" key={x.id}><b>Refund {money(Number(x.amount))} · {x.status}</b><small>{x.reason}</small></div>)}</section>}
    </div>
  );
}
function Returns({
  data,
  post,
}: {
  data: any;
  post: (p: string, b: any) => Promise<void>;
}) {
  const [selected,setSelected]=useState("");
  const current=data.returns.find((r:any)=>r.id===selected),order=data.requests.find((r:any)=>r.id===current?.request_id);
  return (
    <section className="panel table-scroll">
      <table className="ledger-table">
        <thead>
          <tr>
            {[
              "Vendor",
              "Product",
              "Quantity",
              "Unit price",
              "Return value",
              "Reason",
              "Status",
              "Action",
            ].map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.returns.map((r: any) => (
            <tr key={r.id}>
              <td>{r.vendorName}</td>
              <td><button className="text-button" onClick={()=>setSelected(r.id)}>{r.product_name} · View details</button></td>
              <td>
                {r.quantity} {r.unit}
              </td>
              <td>{money(Number(r.unit_price))}</td>
              <td>{money(Number(r.quantity) * Number(r.unit_price))}</td>
              <td>{r.reason}</td>
              <td>
                <span className={"badge " + statusTone(r.status)}>
                  {r.status}
                </span>
              </td>
              <td className="actions">
                {r.status === "pending" && (
                  <>
                    <button
                      className="btn"
                      onClick={() =>
                        void post(
                          "/api/wholesale/returns/" + r.id + "/status",
                          { status: "approved" },
                        )
                      }
                    >
                      Approve
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        void post(
                          "/api/wholesale/returns/" + r.id + "/status",
                          { status: "rejected" },
                        )
                      }
                    >
                      Reject
                    </button>
                  </>
                )}
                {r.status === "approved" && (
                  <button
                    className="btn primary"
                    onClick={() =>
                      void post("/api/wholesale/returns/" + r.id + "/status", {
                        status: "received",
                      })
                    }
                  >
                    Mark received
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.returns.length && (
        <p className="empty-inline">Vendor product returns will appear here.</p>
      )}
      {current&&<div className="return-details padded"><button className="btn" onClick={()=>setSelected("")}>Close details</button><h3>{current.product_name} · {current.vendorName}</h3><p>Order #{current.request_id.slice(0,8).toUpperCase()} · {order?.status||"Unavailable"} · Return {current.status}</p><p>{current.quantity} {current.unit} × {money(Number(current.unit_price))} = {money(Number(current.quantity)*Number(current.unit_price))} · {current.reason}</p><h4>Payment history</h4>{data.transactions.filter((p:any)=>p.request_id===current.request_id).map((p:any)=><div className="record-row" key={p.id}><b>{money(Number(p.amount))} · {p.payment_status}</b><small>{paymentTime(p.created_at)} · {p.reference}</small></div>)}</div>}
    </section>
  );
}
function Refunds({
  data,
  post,
}: {
  data: any;
  post: (p: string, b: any) => Promise<void>;
}) {
  const [selected,setSelected]=useState("");
  const current=data.refunds.find((r:any)=>r.id===selected),payment=data.transactions.find((p:any)=>p.id===current?.transaction_id),order=data.requests.find((r:any)=>r.id===payment?.request_id);
  return (
    <section className="panel padded">
      <h2>Payment refund management</h2>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void post("/api/wholesale/refunds", {
            transactionId: f.get("transactionId"),
            amount: Number(f.get("amount")),
            reason: f.get("reason"),
            status: f.get("status"),
          });
        }}
      >
        <select name="transactionId" required>
          {data.transactions.map((t: any) => (
            <option value={t.id} key={t.id}>
              {t.vendorName} · {money(Number(t.amount))}
            </option>
          ))}
        </select>
        <input
          name="amount"
          type="number"
          min=".01"
          step=".01"
          placeholder="Refund amount"
          required
        />
        <input name="reason" placeholder="Reason" required />
        <select name="status">
          <option value="processed">Processed</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>
        <button className="btn primary">Record refund</button>
      </form>
      {data.refunds.map((r: any) => (
        <button type="button" className="admin-business-row" key={r.id} onClick={()=>setSelected(r.id)}>
          <div>
            <b>{money(Number(r.amount))}</b>
            <small>{r.reason}</small>
          </div>
          <span className={"badge " + statusTone(r.status)}>{r.status}</span>
        </button>
      ))}
      {!data.refunds.length && (
        <p className="empty-inline">No payment refunds recorded.</p>
      )}
      {current&&<div className="return-details"><button className="btn" onClick={()=>setSelected("")}>Close details</button><h3>Refund {money(Number(current.amount))}</h3><p>{current.status} · {current.reason} · {paymentTime(current.created_at)}</p><p>Vendor {payment?.vendorName||"Unavailable"} · Order #{payment?.request_id?.slice(0,8).toUpperCase()||"—"} · {order?.status||"Unavailable"}</p><p>Original payment: {payment?money(Number(payment.amount)):"Unavailable"} · {payment?.payment_status||""} · {payment?.reference||"No reference"}</p></div>}
    </section>
  );
}
function WholesaleSubscription({
  data,
  reload,
}: {
  data: any;
  reload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(""),
    [qr, setQr] = useState(""),
    [message, setMessage] = useState("");
  const order = data.subscription.history.find(
    (x: any) => x.id === selected && x.status === "pending",
  );
  const uri =
    data.pricing.upiId && order
      ? "upi://pay?" +
        new URLSearchParams({
          pa: data.pricing.upiId,
          pn: data.pricing.payee,
          am: Number(order.amount).toFixed(2),
          cu: "INR",
          tn: "Shopkeeper wholesale " + order.plan,
        }).toString()
      : "";
  useEffect(() => {
    let live = true;
    setQr("");
    if (uri)
      QRCode.toDataURL(uri, { width: 280, margin: 3 }).then(
        (x) => live && setQr(x),
      );
    return () => {
      live = false;
    };
  }, [uri]);
  async function choose(plan: string) {
    try {
      const pending = data.subscription.history.find(
        (x: any) => x.plan === plan && x.status === "pending",
      );
      if (pending) {
        setSelected(pending.id);
        return;
      }
      const d = await api("/api/wholesale/subscriptions/order", {
        id: crypto.randomUUID(),
        plan,
      });
      setSelected(d.id);
      await reload();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <div className="pricing-page">
      <div className="pricing-grid">
        <article className="panel price-card">
          <h2>Free trial</h2>
          <strong className="plan-price">₹0</strong>
          <p>{data.pricing.trialDays} days</p>
          <p>
            Explore wholesale products, vendor requests, returns, payments, and
            reports.
          </p>
        </article>
        {(["monthly", "yearly"] as const).map((plan) => (
          <article
            className={
              "panel price-card " + (plan === "yearly" ? "featured" : "")
            }
            key={plan}
          >
            <h2>{plan === "monthly" ? "Monthly" : "Yearly"}</h2>
            <strong className="plan-price">
              {money(Number(data.pricing[plan]))}
            </strong>
            <p>{plan === "monthly" ? "30 days" : "365 days"}</p>
            <button className="btn primary" onClick={() => void choose(plan)}>
              Choose {plan}
            </button>
          </article>
        ))}
      </div>
      {message && <p className="notice error">{message}</p>}
      {order && (
        <section className="panel payment-panel">
          <h2>Pay {money(Number(order.amount))}</h2>
          {qr && (
            <img
              className="payment-qr"
              src={qr}
              alt="Wholesale subscription UPI QR code"
            />
          )}
          {uri ? (
            <a className="btn primary" href={uri}>
              Open UPI app
            </a>
          ) : (
            <p className="notice">
              Ask the administrator to configure the wholesale UPI payment ID.
            </p>
          )}
          <PaymentProof
            wholesale
            paymentId={order.id}
            hasProof={order.has_proof}
            upload
            onUploaded={reload}
          />
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api("/api/wholesale/subscriptions/reference", {
                  id: order.id,
                  reference: f.get("reference"),
                });
                setMessage("Payment submitted for administrator approval.");
                await reload();
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label>
              UPI transaction reference
              <input
                name="reference"
                required
                minLength={4}
                defaultValue={order.reference}
              />
            </label>
            <button className="btn">Submit payment reference</button>
          </form>
        </section>
      )}
      <section className="panel padded"><h2>Request a subscription extension</h2><p>Request extra days from the administrator. Access changes only after approval.</p><form className="form" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);try{await api('/api/wholesale/subscriptions/extension-request',{days:Number(f.get('days')),reason:f.get('reason')});form.reset();setMessage('Extension request sent for review.');await reload()}catch(error){setMessage((error as Error).message)}}}><label>Days requested<input name="days" type="number" min="1" max="3650" required/></label><label>Reason<input name="reason" maxLength={100} required/></label><button className="btn">Send request</button></form></section>
      <section className="panel table-scroll">
        <h2>Subscription history</h2>
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Days</th>
              <th>Status</th>
              <th>Valid until</th>
            </tr>
          </thead>
          <tbody>
            {data.subscription.history.map((x: any) => (
              <tr key={x.id}>
                <td>
                  {new Date(Number(x.created_at)).toLocaleDateString("en-IN")}
                </td>
                <td>{x.plan || x.kind}</td>
                <td>{money(Number(x.amount))}</td>
                <td>{x.days}</td>
                <td>
                  <span className={"badge " + statusTone(x.status)}>
                    {x.status}
                  </span>
                </td>
                <td>
                  {x.valid_until
                    ? new Date(Number(x.valid_until)).toLocaleDateString(
                        "en-IN",
                      )
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.subscription.history.length && (
          <p className="empty-inline">No subscription history yet.</p>
        )}
      </section>
    </div>
  );
}
function WholesaleSettings({
  data,
  reload,
}: {
  data: any;
  post: (p: string, b: any) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function logo(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      await api("/api/wholesale/logo", {
        image: await prepareImage(file, true),
      });
      setMessage("Logo updated.");
      await reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      await api("/api/marketplace/profile", {
        ...f,
        minOrder: Number(f.minOrder),
        deliveryDays: Number(f.deliveryDays),
      });
      setMessage("Marketplace profile saved.");
      await reload();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      <section className="panel padded logo-settings">
        <h2>Wholesale logo</h2>
        {data.profile.logo_image && (
          <img
            className="logo-preview"
            src={data.profile.logo_image}
            alt="Current wholesale logo"
          />
        )}
        <label className="btn">
          <Upload size={16} />
          {busy ? "Uploading…" : "Upload logo"}
          <input
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              void logo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {data.profile.logo_image && (
          <button
            className="text-button"
            onClick={async () => {
              await api("/api/wholesale/logo", { remove: true });
              await reload();
            }}
          >
            Remove logo
          </button>
        )}
        <p role="status">{message}</p>
      </section>
      <section className="panel padded">
        <div className="panel-heading">
          <div>
            <h2>Marketplace profile</h2>
            <p>
              Complete profiles are easier for vendors to discover and trust.
            </p>
          </div>
          {data.profile.verified && (
            <span className="badge green">
              <BadgeCheck size={14} /> Verified
            </span>
          )}
        </div>
        <form className="form" onSubmit={saveProfile}>
          <label>
            Contact name
            <input name="name" defaultValue={data.profile.name} required />
          </label>
          <label>
            Business name
            <input
              name="businessName"
              defaultValue={data.profile.business_name}
              required
            />
          </label>
          <label>
            Business category
            <select name="businessCategory" defaultValue={data.profile.business_category || "General store"}>
              {businessTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <small>Only vendors in this category can find your products or appear in Vendors.</small>
          </label>
          <label>
            GST number
            <input name="gstNumber" defaultValue={data.profile.gst_number} />
          </label>
          <label>
            Phone
            <input name="phone" defaultValue={data.profile.phone} />
          </label>
          <label>
            Address
            <textarea name="address" defaultValue={data.profile.address} />
          </label>
          <label>
            Service areas
            <input
              name="serviceAreas"
              defaultValue={data.profile.service_areas}
              placeholder="Hosur, Krishnagiri, Bengaluru"
            />
          </label>
          <label>
            Brands distributed
            <textarea
              name="brands"
              defaultValue={data.profile.brands}
              placeholder="Brand names separated by commas"
            />
          </label>
          <label>
            Minimum order value
            <input
              name="minOrder"
              type="number"
              min="0"
              step=".01"
              defaultValue={data.profile.min_order || 0}
              required
            />
          </label>
          <label>
            Normal delivery days
            <input
              name="deliveryDays"
              type="number"
              min="0"
              max="90"
              defaultValue={data.profile.delivery_days || 2}
              required
            />
          </label>
          <label>
            Catalogue visibility
            <select
              name="visibilityMode"
              defaultValue={data.profile.visibility_mode || "selected"}
            >
              <option value="selected">Approved vendors only</option>
              <option value="public">All active vendors</option>
            </select>
          </label>
          <button className="btn primary" disabled={busy}>
            Save marketplace profile
          </button>
        </form>
      </section>
      <section className="panel padded">
        <div className="panel-heading">
          <div>
            <h2>Vendor payment QR</h2>
            <p>Vendors use this UPI ID after receiving an order.</p>
          </div>
          <IndianRupee />
        </div>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              await api("/api/marketplace/payment-settings", {
                upiId: f.get("upiId"),
                payeeName: f.get("payeeName"),
              });
              setMessage("Vendor payment QR settings saved.");
              await reload();
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            UPI ID
            <input
              name="upiId"
              defaultValue={data.profile.payment_upi_id || ""}
              placeholder="business@bank"
              required
            />
          </label>
          <label>
            Payment name
            <input
              name="payeeName"
              defaultValue={
                data.profile.payment_payee_name || data.profile.business_name
              }
              required
            />
          </label>
          <button className="btn primary" disabled={busy}>
            Save payment settings
          </button>
        </form>
      </section>
      <AccountPassword title="Account security" email={data.profile.email} />
    </div>
  );
}
export function WholesalerManagement() {
  const [rows, setRows] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [reset, setReset] = useState("");
  async function load() {
    try {
      setRows((await api("/api/wholesalers")).wholesalers);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="panel padded">
      <h2>Wholesale seller accounts</h2>
      <p role="status">{message}</p>
      {reset && <div className="notice break-anywhere">{reset}</div>}
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          try {
            await api("/api/wholesalers", Object.fromEntries(f));
            form.reset();
            setMessage("Wholesale seller created.");
            await load();
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <input name="name" placeholder="Contact name" required />
        <input name="businessName" placeholder="Wholesale business" required />
        <select name="businessCategory" aria-label="Wholesale business category" defaultValue="General store">
          {businessTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <input name="email" type="email" placeholder="Email" required />
        <PasswordInput
          name="password"
          placeholder="Initial password"
          minLength={12}
          maxLength={128}
          required
        />
        <input name="phone" placeholder="Phone" />
        <input name="address" placeholder="Address" />
        <button className="btn primary">Add wholesale seller</button>
      </form>
      {rows.map((r) => (
        <div className="record-row" key={r.id}>
          <div>
            <b>{r.business_name}</b>
            <small>
              {r.name} · {r.email} · {r.business_category || "General store"}
            </small>
          </div>
          <span className={"badge " + (r.disabled ? "amber" : "green")}>
            {r.disabled ? "Disabled" : "Active"}
          </span>
          <div className="actions">
            <button
              className="btn"
              onClick={async () => {
                await api("/api/wholesalers/" + r.id, {
                  action: r.disabled ? "enable" : "disable",
                });
                await load();
              }}
            >
              {r.disabled ? "Enable" : "Disable"}
            </button>
            <button
              className="text-button"
              onClick={async () => {
                const d = await api("/api/wholesalers/" + r.id, {
                  action: "reset",
                });
                setReset(
                  location.origin +
                    "/wholesale/login#reset=" +
                    encodeURIComponent(d.code),
                );
              }}
            >
              Reset password
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

export function WholesalePricingAdmin() {
  const [config, setConfig] = useState<any>(),
    [message, setMessage] = useState("");
  useEffect(() => {
    api("/api/wholesale/pricing")
      .then(setConfig)
      .catch((e) => setMessage(e.message));
  }, []);
  if (!config)
    return (
      <section className="panel padded">
        <h2>Wholesale pricing</h2>
        <p>{message || "Loading…"}</p>
      </section>
    );
  return (
    <section className="panel padded">
      <h2>Wholesale pricing & UPI</h2>
      <p>
        New wholesale accounts receive the free trial. Payments require manual
        approval.
      </p>
      <form
        className="form"
        key={config.version}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          try {
            const d = await api("/api/wholesale/pricing", {
              ...f,
              version: config.version,
              monthly: Number(f.monthly),
              yearly: Number(f.yearly),
              trialDays: Number(f.trialDays),
            });
            setConfig(d);
            setMessage("Wholesale pricing saved.");
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <label>
          Free trial days
          <input
            name="trialDays"
            type="number"
            min="1"
            max="90"
            defaultValue={config.trialDays}
            required
          />
        </label>
        <label>
          30-day price (₹)
          <input
            name="monthly"
            type="number"
            min="1"
            step=".01"
            defaultValue={config.monthly}
            required
          />
        </label>
        <label>
          Yearly price (₹)
          <input
            name="yearly"
            type="number"
            min="1"
            step=".01"
            defaultValue={config.yearly}
            required
          />
        </label>
        <label>
          UPI ID
          <input
            name="upiId"
            defaultValue={config.upiId}
            placeholder="name@bank"
          />
        </label>
        <label>
          Payee name
          <input name="payee" defaultValue={config.payee} required />
        </label>
        <label>
          Heading
          <input name="headline" defaultValue={config.headline} required />
        </label>
        <button className="btn primary">Save wholesale pricing</button>
        <p role="status">{message}</p>
      </form>
    </section>
  );
}

export function WholesaleValidityAdmin() {
  const [rows, setRows] = useState<any[]>([]),
    [message, setMessage] = useState("");
  async function load() {
    try {
      setRows((await api("/api/wholesalers")).wholesalers);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="panel padded">
      <h2>Wholesale subscription validity</h2>
      <div className="table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Wholesale seller</th>
              <th>Period</th>
              <th>Days remaining</th>
              <th>Valid until</th>
              <th>Extend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.business_name}</b>
                  <small className="block-text">{r.email}</small>
                </td>
                <td>{r.period}</td>
                <td>{r.daysRemaining}</td>
                <td>
                  {r.validUntil
                    ? new Date(r.validUntil).toLocaleDateString("en-IN")
                    : "—"}
                </td>
                <td>
                  <button
                    className="btn"
                    onClick={async () => {
                      const value = prompt(
                          "Days to add to the remaining validity",
                          "30",
                        ),
                        days = Number(value);
                      if (!value) return;
                      try {
                        await api("/api/wholesale/subscriptions/extend", {
                          wholesalerId: r.id,
                          days,
                          reason: "Administrator extension",
                        });
                        setMessage(days + " days added.");
                        await load();
                      } catch (e) {
                        setMessage((e as Error).message);
                      }
                    }}
                  >
                    Extend
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p role="status">{message}</p>
    </section>
  );
}
