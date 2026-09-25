import { usePageRoute } from "./routes";
import { AdminManagement } from "./admin-management";
import { StoreLogo } from "./store-assets";
("use client");
import { useState, useEffect, useRef } from "react";
import {
  LogOut,
  Store,
  LayoutDashboard,
  ScanBarcode,
  Package,
  ShoppingBag,
  Users,
  Truck,
  ChartNoAxesCombined,
  Settings,
  CircleHelp,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Download,
  IndianRupee,
  Receipt,
  TriangleAlert,
  Wallet,
  ChevronRight,
  Camera,
  Minus,
  Trash2,
  RefreshCw,
  Printer,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import {
  useSidebar,
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  State,
  Product,
  Sale,
  initial,
  money,
  productDiscount,
  netPrice,
  roundMoney,
  supplierAccounts,
  isLow,
  stockThreshold,
  stockTarget,
} from "@/lib/store";
import { VendorSummary, businessTypes } from "@/lib/vendors";
import { BillScanner } from "@/components/bill-scanner";
import { MobileScanner } from "@/components/mobile-scanner";
import { FinanceCards, FinanceReport } from "./finance";
import { SupplierAccounts } from "./supplier-accounts";
import {
  Pricing,
  PricingEditor,
  SubscriptionHistory,
  PricingConfig,
  Subscription,
} from "./pricing";
import { InventoryImport } from "./inventory-import";
import { VendorSubscription } from "./vendor-subscription";
import { SubscriptionApprovals } from "./subscription-approvals";
import { VendorWholesale } from "./vendor-wholesale";
import { ProfileMenu } from "./profile-menu";
import {
  WholesalerManagement,
  WholesalePricingAdmin,
  WholesaleValidityAdmin,
} from "./wholesale-portal";
import { PasswordInput } from "./password-input";
import { SaleReceipt } from "@/components/sale-receipt";
import { ProductLabel } from "@/components/product-label";
import { parseProductCode } from "@/lib/product-label";
import { prepareBarcodeBatch } from "@/lib/barcode-batch";
import { ThemeToggle } from "./theme";
import { Notifications } from "./notifications";
import { Support } from "./support";
import { SupplyHub } from "./supply-hub";
import { MarketplaceAdmin } from "./marketplace-admin";
import { Employees } from "./employees";
import { storeFetch, api, logout } from "./api";
type Access = {
  members: { userId: string; vendorId: string; email: string }[];
  invites: { email: string; vendorId: string; expires: number }[];
};
type Reply = {
  logo: string | null;
  pricing: PricingConfig;
  subscription: Subscription;
  version: number;
  state: State;
  vendorId: string;
  vendors: VendorSummary[];
  role: "owner" | "admin" | "vendor";
  permissions: string[];
  email: string;
  access?: Access;
  accessCode?: string;
  error: string;
};
const nav = [
  ["Dashboard", LayoutDashboard],
  ["Point of sale", ScanBarcode],
  ["Inventory", Package],
  ["Purchases", ShoppingBag],
  ["Supply hub", Truck],
  ["Reports", ChartNoAxesCombined],
  ["Expenses", Wallet],
  ["Settings", Settings],
  ["Vendors", Store],
  ["Wholesale", Truck],
  ["Vendor access", Users],
  ["Subscription approvals", Check],
  ["Scan bill", Camera],
  ["Account", Users],
  ["Employees", Users],
  ["Pricing", IndianRupee],
  ["Support", Users],
  ["Super admin", Users],
] as const;
const pagePermission: Record<string, string> = {
  Vendors: "stores",
  Wholesale: "wholesale",
  "Vendor access": "vendor_access",
  "Subscription approvals": "subscriptions",
  Pricing: "pricing",
  Inventory: "inventory",
  "Point of sale": "sales",
  Sales: "sales",
  Purchases: "purchases",
  "Supply hub": "purchases",
  "Scan bill": "purchases",
  Reports: "reports",
  Expenses: "reports",
  Customers: "sales",
  Settings: "stores",
  Employees: "vendor_access",
};
const employeePagePermission: Record<string, string> = {
  Dashboard: "dashboard",
  "Point of sale": "sales",
  Inventory: "inventory",
  Sales: "sales",
  Purchases: "purchases",
  "Supply hub": "purchases",
  "Scan bill": "purchases",
  Customers: "customers",
  Reports: "reports",
  Expenses: "reports",
  Settings: "settings",
  Employees: "employees",
};
const blank: Product = {
  id: "",
  name: "",
  barcode: "",
  category: "Staples",
  price: NaN,
  discountMode: "none",
  cost: NaN,
  stock: NaN,
  min: 10,
  target: NaN,
  unit: "piece",
};
function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (s: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((x) => (
          <SelectItem key={x} value={x}>
            {x}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function RailToggle() {
  const { state, toggleSidebar } = useSidebar();
  const expanded = state === "expanded";
  return (
    <button
      type="button"
      className="rail-toggle"
      aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
      aria-expanded={expanded}
      title={expanded ? "Collapse navigation" : "Expand navigation"}
      onClick={toggleSidebar}
    >
      <ChevronRight
        size={17}
        aria-hidden="true"
        style={{ transform: expanded ? "rotate(180deg)" : undefined }}
      />
    </button>
  );
}
export default function Home() {
  const [s, setS] = useState<State>(initial()),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All categories"),
    [lowOnly, setLowOnly] = useState(false),
    [modal, setModal] = useState(""),
    [product, setProduct] = useState<Product>(blank),
    [cart, setCart] = useState<{ id: string; qty: number; unitPrice?: number }[]>([]),
    [barcode, setBarcode] = useState(""),
    [discount, setDiscount] = useState(0),
    [payment, setPayment] = useState("Cash"),
    [receipt, setReceipt] = useState<Sale | null>(null),
    [period, setPeriod] = useState("Last 7 days"),
    [camera, setCamera] = useState(false),
    [cameraPurpose, setCameraPurpose] = useState<"sale" | "inventory" | "product">("sale"),
    [batchNotice, setBatchNotice] = useState(""),
    [historyExpanded, setHistoryExpanded] = useState(false);
  const [version, setVersion] = useState(0),
    [codeKind, setCodeKind] = useState("activate");
  const [role, setRole] = useState(""),
    [permissions, setPermissions] = useState<string[]>([]),
    [email, setEmail] = useState(""),
    [access, setAccess] = useState<Access>({ members: [], invites: [] }),
    [accessCode, setAccessCode] = useState("");
  const [vendors, setVendors] = useState<VendorSummary[]>([]),
    [vendorId, setVendorId] = useState(
      new URLSearchParams(location.search).get("store") || "",
    ),
    [vendorKind, setVendorKind] = useState("All vendors");
  const requestVersion = useRef(0);
  const video = useRef<HTMLVideoElement>(null),
    scan = useRef<HTMLInputElement>(null),
    saleId = useRef(""),
    billRef = useRef<HTMLElement>(null),
    historyRef = useRef<HTMLElement>(null);
  const [view, setView] = usePageRoute();
  const [logo, setLogo] = useState<string | null>(null);
  const isAdmin = role === "owner" || role === "admin";
  const allowedPage = (name: string) => {
    if (role === "vendor" && name === "Dashboard" && permissions.includes("sales")) return true;
    if (role === "vendor" && name === "Supply hub")
      return ["purchases", "payments", "returns", "inventory"].some((permission) =>
        permissions.includes(permission),
      );
    const required = role === "vendor" ? employeePagePermission[name] : pagePermission[name];
    return !required || role === "owner" || permissions.includes(required);
  };
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [posMode, setPosMode] = useState("Barcode");
  const [pricing, setPricing] = useState<PricingConfig>(),
    [subscription, setSubscription] = useState<Subscription>();
  const saleLocked =
    !subscription?.validUntil || subscription.validUntil <= clock;
  useEffect(() => {
    document.title = view + " · " + s.settings.name;
  }, [view, s.settings.name]);
  function accept(d: Reply) {
    const url = new URL(location.href);
    if (d.vendorId) url.searchParams.set("store", d.vendorId);
    else url.searchParams.delete("store");
    history.replaceState(null, "", url.pathname + url.search);
    setLogo(d.logo);
    setPricing(d.pricing);
    setSubscription(d.subscription);
    setVersion(d.version);
    setS(d.state);
    setVendorId(d.vendorId);
    setVendors(d.vendors);
    setRole(d.role);
    setPermissions(d.permissions || []);
    setEmail(d.email);
    setAccess(d.access ?? { members: [], invites: [] });
    if (d.accessCode) setAccessCode(d.accessCode);
  }
  async function refresh(selected = vendorId) {
    const revision = ++requestVersion.current;
    setError("");
    setLoading(true);
    try {
      const r = await storeFetch(
        "/api/store" +
          (selected ? "?vendor=" + encodeURIComponent(selected) : ""),
      );
      const d = (await r.json()) as Reply;
      if (!r.ok) throw Error(d.error);
      if (revision === requestVersion.current) accept(d);
    } catch (e) {
      if (revision === requestVersion.current) setError((e as Error).message);
    } finally {
      if (revision === requestVersion.current) setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (view === "Sales") {
      setHistoryExpanded(true);
      setView("Dashboard");
      window.setTimeout(() => historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } else if (view === "Customers") setView("Dashboard");
  }, [view]);
  useEffect(() => {
    const back = () => {
      const target = new URLSearchParams(location.search).get("store") || "";
      if (target !== vendorId) {
        setCart([]);
        setModal("");
        void refresh(target);
      }
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [vendorId]);
  useEffect(() => {
    if (
      role &&
      ((view === "Super admin" && role !== "owner") ||
        (role === "admin" &&
          pagePermission[view] &&
          !permissions.includes(pagePermission[view])) ||
        (role === "vendor" && !allowedPage(view)) ||
        (["Vendors", "Vendor access", "Subscription approvals"].includes(
          view,
        ) &&
          !isAdmin))
    )
      go(role === "vendor" && !permissions.includes("dashboard")
        ? nav.map(([name]) => name).find((name) => allowedPage(name) && !["Vendors", "Vendor access", "Subscription approvals", "Super admin"].includes(name)) || "Account"
        : "Dashboard");
  }, [role, permissions, view]);
  useEffect(() => {
    if (role !== "vendor" || !vendorId) return;
    let active = true;
    const check = () => {
      if (active)
        void storeFetch(
          "/api/vendors/" + encodeURIComponent(vendorId) + "/access",
        ).catch(() => {});
    };
    const timer = setInterval(check, 30000);
    window.addEventListener("focus", check);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [role, vendorId]);
  async function act(a: any) {
    if (loading || busy || (!vendorId && a.type !== "claim_access"))
      return null;
    setBusy(true);
    try {
      const r = await storeFetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...a,
          vendorId,
          ...(a.type === "product" ? { version } : {}),
        }),
      });
      const d = (await r.json()) as Reply;
      if (!r.ok) throw Error(d.error);
      accept(d);
      return d.state;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function switchVendor(id: string) {
    if (loading || busy || id === vendorId) return;
    if (cart.length) {
      toast.error(
        "Complete or clear the current bill before switching stores.",
      );
      return;
    }
    setCamera(false);
    setModal("");
    setAccessCode("");
    setReceipt(null);
    setDiscount(0);
    setPayment("Cash");
    setBarcode("");
    saleId.current = "";
    go("Dashboard");
    await refresh(id);
  }
  function go(v: string) {
    setView(v);
    setQuery("");
    setCategory("All categories");
    setLowOnly(false);
  }
  function add(p: Product) {
    if (loading || busy) return;
    if (p.stock <= 0) {
      toast.error("This item is out of stock.");
      return;
    }
    setCart((c) => {
      const found = c.find((x) => x.id === p.id);
      if ((found?.qty || 0) >= p.stock) {
        toast.error("No more stock available.");
        return c;
      }
      return found
        ? c.map((x) => (x.id === p.id ? { ...x, qty: x.qty + 1 } : x))
        : [...c, { id: p.id, qty: 1 }];
    });
    toast.success(p.name + " added to bill");
  }
  function scanCode(raw: string) {
    try {
      const draft = parseProductCode(raw);
      const p = draft.barcode
        ? s.products.find((x) => x.barcode === draft.barcode)
        : undefined;
      if (p) {
        if (view === "Inventory") {
          setProduct(p);
          setModal("product");
        } else {
          setView("Point of sale");
          add(p);
        }
      } else {
        setProduct({
          ...blank,
          barcode: draft.barcode ?? "",
          name: draft.name ?? "",
          ...(draft.mrp !== undefined ? { mrp: draft.mrp, price: draft.mrp } : {}),
        });
        setModal("product");
        toast(
          draft.mrp !== undefined
            ? "MRP read from QR and used as selling price. Review cost and stock, then save."
            : "New barcode — use Scan product name & MRP to photograph the label.",
        );
      }
      setBarcode("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function scanProductForm(raw: string) {
    try {
      const draft = parseProductCode(raw);
      const existing = s.products.find((item) => item.barcode && item.barcode === draft.barcode);
      if (existing) {
        setProduct(existing);
        toast("Product already exists. Edit its stock and details before saving.");
      } else {
        setProduct((current) => ({ ...current,
          barcode: draft.barcode ?? current.barcode,
          name: draft.name ?? current.name,
          ...(draft.mrp !== undefined ? {mrp: draft.mrp, price: Number.isFinite(current.price) ? current.price : draft.mrp} : {}),
        }));
        toast.success("Barcode added to the product form. Review all fields before saving.");
      }
    } catch (error) { toast.error((error as Error).message); }
  }
  function scanBatch(codes: string[]) {
    const result = prepareBarcodeBatch(codes, s.products, cart);
    setCart(result.cart);
    setView("Point of sale");
    setBatchNotice(result.added
      ? `${result.added} scanned items are in your bill. Check the total and tap Complete sale below.${result.missing.length ? " Not added: " + result.missing.join(", ") : ""}`
      : `No items added. Save these products in Inventory first: ${result.missing.join(", ")}`);
    if (result.added) window.setTimeout(() => billRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 160);
    toast[result.missing.length ? "warning" : "success"](
      `${result.added} items added. ${result.missing.length ? "Check unknown or unavailable codes: " + result.missing.join(", ") : "Ready to checkout."}`,
    );
  }
  useEffect(() => {
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      ctx.registerTool(
        {
          name: "search_inventory",
          description: "Find saved shop products by name or barcode.",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async (input: any) => {
            if (typeof input.query !== "string")
              throw Error("query must be a string");
            return s.products.filter((p) =>
              (p.name + " " + p.barcode)
                .toLowerCase()
                .includes(input.query.toLowerCase()),
            );
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, [s.products]);
  const supplierBalances = supplierAccounts(s);
  const low = s.products.filter((p) => isLow(p, s));
  const dateKey = (v: string) =>
    new Date(v).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const today = dateKey(new Date().toISOString()),
    todays = s.sales.filter((x) => dateKey(x.date) === today),
    revenue = todays.reduce((t, x) => t + x.total, 0),
    stockValue = s.products.reduce((t, p) => t + p.stock * p.cost, 0);
  const days = period === "Last 30 days" ? 30 : 7;
  const chart = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = dateKey(d.toISOString());
    return {
      day: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      sales: s.sales
        .filter((x) => dateKey(x.date) === key)
        .reduce((t, x) => t + x.total, 0),
    };
  });
  const filtered = s.products.filter(
    (p) =>
      (p.name + " " + p.barcode).toLowerCase().includes(query.toLowerCase()) &&
      (category === "All categories" || p.category === category) &&
      (!lowOnly || isLow(p, s)),
  );
  const cartItems = cart
      .map((x) => ({ ...s.products.find((p) => p.id === x.id)!, qty: x.qty,
        ...(x.unitPrice !== undefined ? { price: x.unitPrice, discountMode: 'none' as const, customDiscount: 0 } : {}) }))
      .filter((x) => x.name),
    subtotal = roundMoney(cartItems.reduce((t, p) => t + p.price * p.qty, 0)),
    itemSavings = roundMoney(
      cartItems.reduce((t, p) => t + productDiscount(p) * p.qty, 0),
    ),
    netSubtotal = roundMoney(subtotal - itemSavings);
  const posProducts =
    posMode === "Product name" && query.trim().length
      ? s.products.filter((p) =>
          p.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : [];
  const top = s.products
    .map((p) => ({
      ...p,
      sold: s.sales.reduce(
        (n, x) =>
          n +
          x.items.filter((i) => i.id === p.id).reduce((t, i) => t + i.qty, 0),
        0,
      ),
    }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 4);
  function exportCSV(kind: "inventory" | "sales" = "inventory") {
    const rows =
      kind === "sales"
        ? [
            ["Invoice", "Date", "Customer", "Payment", "Total"],
            ...s.sales.map((x) => [
              x.id,
              x.date,
              x.customer,
              x.payment,
              x.total,
            ]),
          ]
        : [
            [
              "Name",
              "Barcode",
              "Category",
              "Price",
              "Discount per unit",
              "Net price",
              "Cost",
              "Stock",
              "Unit",
            ],
            ...s.products.map((p) => [
              p.name,
              p.barcode,
              p.category,
              p.price,
              productDiscount(p),
              netPrice(p),
              p.cost,
              p.stock,
              p.unit,
            ]),
          ];
    const safe = (v: any) => {
      let t = String(v);
      if (/^[=+@-]/.test(t)) t = "'" + t;
      return '"' + t.replaceAll('"', '""') + '"';
    };
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + rows.map((r) => r.map(safe).join(",")).join("\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download =
      (s.demo ? "demo-" : "") +
      s.settings.name.replace(/[^a-z0-9]/gi, "-") +
      "-" +
      (kind === "sales" ? "sales" : "inventory") +
      ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function checkout() {
    if (saleLocked) {
      toast.error(
        "Renew your subscription and wait for administrator approval to make sales.",
      );
      return;
    }
    if (!cart.length) return;
    if (!saleId.current) saleId.current = crypto.randomUUID();
    const result = await act({
      type: "sale",
      id: saleId.current,
      items: cart,
      discount,
      payment,
      customer: "Walk-in customer",
    });
    if (result) {
      setReceipt(result.sales.find((x) => x.id === saleId.current)!);
      setModal("receipt");
      setCart([]);
      setBatchNotice("");
      setDiscount(0);
      saleId.current = "";
      toast.success("Sale saved. Inventory updated.");
    }
  }
  function productTable(items: Product[]) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "Product",
              "Barcode",
              "Category",
              "Weight",
              "Selling price",
              "Stock",
              "Status",
              "",
            ].map((h, i) => (
              <TableHead key={i}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <div className="product-name">
                  <span
                    className={
                      "product-icon tone-" + (s.products.indexOf(p) % 4)
                    }
                  >
                    <Package size={20} />
                  </span>
                  <span>
                    <b>{p.name}</b>
                    <small>{p.unit}</small>
                  </span>
                </div>
              </TableCell>
              <TableCell className="mono">{p.barcode}</TableCell>
              <TableCell>{p.category}{p.subcategory && <small className="block-text">{p.subcategory}</small>}</TableCell>
              <TableCell>{p.weight || "—"}</TableCell>
              <TableCell>
                <b>{money(netPrice(p))}</b>
                {productDiscount(p) > 0 && (
                  <small style={{ display: "block" }}>
                    {money(p.price)} − {money(productDiscount(p))} discount
                  </small>
                )}
              </TableCell>
              <TableCell>
                <b>{p.stock}</b>{" "}
                <span className="muted">/ {stockTarget(p)} target</span>
              </TableCell>
              <TableCell>
                <span
                  className={
                    "badge " +
                    (p.stock === 0 ? "red" : isLow(p, s) ? "amber" : "green")
                  }
                >
                  {p.stock === 0
                    ? "Out of stock"
                    : isLow(p, s)
                      ? "Low stock"
                      : "In stock"}
                </span>
              </TableCell>
              <TableCell>
                <button
                  className="text-button"
                  onClick={() => {
                    setProduct(p);
                    setModal("product");
                  }}
                >
                  Edit <ChevronRight size={14} />
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }
  if (!loading && !vendorId)
    return (
      <main className="account-gate">
        <Toaster richColors />
        <section className="panel">
          <Store size={36} />
          <h1>Welcome to Shopkeeper</h1>
          <p>
            {error ||
              "Signed in as " +
                email +
                ". Enter the access code from your store administrator."}
          </p>
          {error ? (
            <>
              <button className="btn primary" onClick={logout}>
                Sign in again
              </button>
              <button className="btn" onClick={() => refresh()}>
                Retry
              </button>
            </>
          ) : (
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (await act({ type: "claim_access", code: f.get("code") })) {
                  setError("");
                  go("Dashboard");
                }
              }}
            >
              <label>
                Store access code
                <input name="code" required autoComplete="off" />
              </label>
              <button className="btn primary" disabled={busy}>
                Activate my store
              </button>
            </form>
          )}
          <button className="text-button" onClick={logout}>
            Use another account
          </button>
        </section>
      </main>
    );
  return (
    <SidebarProvider
      defaultOpen={false}
      style={{ "--sidebar-width-icon": "76px" } as React.CSSProperties}
    >
      <Toaster richColors position="top-right" />
      <Sidebar className="shop-sidebar" collapsible="icon">
        <SidebarHeader>
          <a
            className="brand"
            href="/app/dashboard"
            aria-label={s.settings.name + " home"}
            title={s.settings.name}
          >
            <span>
              {logo ? (
                <img
                  className="store-logo"
                  src={logo}
                  alt={s.settings.name + " logo"}
                />
              ) : (
                <Store size={24} />
              )}
            </span>
            <span className="brand-name">{s.settings.name}</span>
          </a>
          <RailToggle />
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-label">WORKSPACE</p>
          <SidebarMenu>
            {nav
              .slice(0, 5)
              .filter(
                ([name]) =>
                  allowedPage(name),
              )
              .map(([name, Icon]) => (
                <SidebarMenuItem key={name}>
                  <SidebarMenuButton
                    tooltip={name}
                    aria-label={name}
                    isActive={view === name}
                    onClick={() => go(name)}
                  >
                    <Icon />
                    <span>{name}</span>
                    {name === "Inventory" && low.length > 0 && (
                      <em>{low.length}</em>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
          <p className="nav-label">BUSINESS</p>
          <SidebarMenu>
            {nav
              .slice(5)
              .filter(
                ([name]) =>
                  !["Reports", "Settings", "Account", "Employees", "Support"].includes(name) &&
                  (name === "Super admin"
                    ? role === "owner"
                    : isAdmin ||
                      ![
                        "Vendors",
                        "Vendor access",
                        "Subscription approvals",
                        "Wholesale",
                      ].includes(name)) &&
                  allowedPage(name),
              )
              .map(([name, Icon]) => (
                <SidebarMenuItem key={name}>
                  <SidebarMenuButton
                    tooltip={name}
                    aria-label={name}
                    isActive={view === name}
                    onClick={() => go(name)}
                  >
                    <Icon />
                    <span>{name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="sidebar-tip">
            <ScanBarcode size={23} />
            <b>A faster way to bill</b>
            <p>Scan a barcode and keep your checkout moving.</p>
            <button onClick={() => go("Point of sale")}>
              Open point of sale <ArrowRight size={16} />
            </button>
          </div>
          <div className="owner">
            <span>M</span>
            <div>
              <b>
                {role === "owner"
                  ? "Super admin"
                  : role === "admin"
                    ? "Administrator"
                    : "Vendor account"}
              </b>
              <small>{email}</small>
            </div>
            <Settings size={17} />
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>{view}</b>
          </div>
          <div className="top-actions">
            <ThemeToggle />
            <Notifications
              onNavigate={(page) =>
                go(["Orders", "Payments"].includes(page) ? "Supply hub" : page)
              }
            />
            {vendors.length > 1 && (
              <Select
                value={vendorId}
                onValueChange={switchVendor}
                disabled={loading || busy}
              >
                <SelectTrigger
                  className="store-chooser"
                  aria-label="Switch vendor store"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <span className="store-open">
              {logo && <img className="header-logo" src={logo} alt="" />}
              {s.settings.name}
              {s.demo ? " · Demo" : ""}
            </span>
            <button
              className="icon-button"
              aria-label="Refresh store"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={18} />
            </button>
            <ProfileMenu name={s.settings.name} detail={email} logo={logo}
              links={([
                {label: "My profile", page: "Account", icon: Users},
                {label: "Payment history & plans", page: "Pricing", icon: IndianRupee},
                {label: "Account settings", page: "Settings", icon: Settings},
                {label: "Employees", page: "Employees", icon: Users},
                {label: "Help & support", page: "Support", icon: CircleHelp},
              ]).filter((item) => allowedPage(item.page))}
              onNavigate={go} onLogout={logout} />
          </div>
        </header>
        <div className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR BUSINESS, AT A GLANCE</div>
              <h1>{view === "Dashboard" ? "Store overview" : view}</h1>
              <p>
                {view === "Dashboard"
                  ? "Here’s what’s happening in your store today."
                  : view === "Point of sale"
                    ? "Scan, add items, and complete the sale."
                    : view === "Inventory"
                      ? "Keep every item, price, and stock level up to date."
                      : "Keep your business records in one place."}
              </p>
            </div>
            <div className="actions">
              {["Dashboard", "Inventory"].includes(view) && (
                <button className="btn" onClick={() => exportCSV()}>
                  <Download size={16} />
                  Export
                </button>
              )}
              {["Dashboard", "Inventory", "Vendors"].includes(
                view,
              ) && (
                <button
                  className="btn primary"
                  onClick={() => {
                    if (view === "Vendors") {
                      if (cart.length) {
                        toast.error(
                          "Complete or clear your current bill first.",
                        );
                        return;
                      }
                      setModal("vendor");
                    } else if (view === "Inventory") {
                      setProduct(blank);
                      setModal("product");
                    } else go("Point of sale");
                  }}
                >
                  <Plus size={18} />
                  {view === "Vendors"
                    ? "Add vendor"
                    : view === "Inventory"
                      ? "Add product"
                      : "New sale"}
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="notice error">
              {error}
              <button onClick={() => refresh()}>Retry</button>
            </div>
          )}
          {loading && <div className="notice">Loading your store…</div>}
          {s.demo && view !== "Super admin" && (
            <div className="demo-note">
              Demo store · All products, contacts and transactions are
              fictional. Try billing here, then switch to your own store for
              real business.
            </div>
          )}
          {subscription && view !== "Super admin" && (
            <div className="notice subscription-strip">
              <b>
                {subscription.validUntil
                  ? Math.max(
                      0,
                      Math.ceil((subscription.validUntil - clock) / 86400000),
                    )
                  : 0}{" "}
                days remaining
              </b>
              <span>
                {subscription.period}
                {subscription.validUntil
                  ? " · Valid until " +
                    new Date(subscription.validUntil).toLocaleDateString(
                      "en-IN",
                    )
                  : ""}
              </span>
              <button className="btn" onClick={() => go("Pricing")}>
                View plans
              </button>
              {subscription.validUntil && subscription.validUntil > clock && subscription.validUntil - clock <= 5 * 86400000 &&
                <strong className="renew-urgent">Renew your subscription now. {Math.ceil((subscription.validUntil - clock) / 86400000)} day(s) left before sales are locked.</strong>}
            </div>
          )}
          {saleLocked && view !== "Super admin" && (
            <div className="notice error">
              Sales are locked. Renew your plan and wait for administrator
              approval.
              <button className="btn" onClick={() => go("Pricing")}>
                Renew subscription
              </button>
              <button className="btn" onClick={() => refresh()}>
                Check approval
              </button>
            </div>
          )}
          {view === "Dashboard" && (
            <>
              <h2>Today’s sales and profit</h2>
              <FinanceCards s={s} from={today} to={today} dashboard />
              {(role === "owner" || permissions.includes("reports")) && <FinanceReport key={vendorId} s={s} />}
              <div className="notice">
                Current supplier payable:{" "}
                <b>
                  {money(supplierBalances.reduce((t, a) => t + a.pending, 0))}
                </b>{" "}
                · Supplier credit / refund due:{" "}
                <b>
                  {money(supplierBalances.reduce((t, a) => t + a.credit, 0))}
                </b>
                {supplierBalances.some((a) => a.unknown) && (
                  <p>
                    Older purchases have unknown payment status. Reconcile them
                    in Supplier accounts for complete balances.
                  </p>
                )}
                <button
                  className="text-button"
                  onClick={() => go("Supplier accounts")}
                >
                  View supplier accounts
                </button>
              </div>
              <div className="metrics">
                {[
                  [
                    "Today’s sales",
                    money(revenue),
                    IndianRupee,
                    "Sales recorded today",
                  ],
                  [
                    "Transactions",
                    todays.length,
                    Receipt,
                    "Completed bills today",
                  ],
                  [
                    "Inventory value",
                    money(stockValue),
                    Package,
                    s.products.length + " products in your store",
                  ],
                  [
                    "Low-stock items",
                    low.length,
                    TriangleAlert,
                    "Products that need attention",
                  ],
                ].map(([title, value, Icon, detail]: any, i) => (
                  <div className="metric" key={title}>
                    <div>
                      <span>{title}</span>
                      <span className={"metric-icon tone-" + i}>
                        <Icon size={19} />
                      </span>
                    </div>
                    <strong>{value}</strong>
                    <small className={i === 3 && low.length ? "warning" : ""}>
                      {i === 3 && low.length ? (
                        <TriangleAlert size={13} />
                      ) : null}
                      {detail}
                    </small>
                  </div>
                ))}
              </div>
              <div className="dashboard-middle">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Sales overview</h2>
                      <p>Your sales performance over time</p>
                    </div>
                    <Choice
                      value={period}
                      onChange={setPeriod}
                      options={["Last 7 days", "Last 30 days"]}
                      label="Date range"
                    />
                  </div>
                  <div className="chart-total">
                    {money(chart.reduce((t, p) => t + p.sales, 0))}
                    <span>
                      <i /> Total sales
                    </span>
                  </div>
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chart}
                        margin={{ top: 15, right: 12, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                            <stop
                              offset="0%"
                              stopColor="#16866b"
                              stopOpacity={0.2}
                            />
                            <stop
                              offset="100%"
                              stopColor="#16866b"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          vertical={false}
                          stroke="#edf0f2"
                          strokeDasharray="4 4"
                        />
                        <XAxis
                          dataKey="day"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 12, fill: "#7a8694" }}
                          minTickGap={30}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 12, fill: "#7a8694" }}
                          tickFormatter={(v) => "₹" + v}
                          width={52}
                        />
                        <Tooltip formatter={(v: any) => money(Number(v))} />
                        <Area
                          type="monotone"
                          dataKey="sales"
                          stroke="#16866b"
                          strokeWidth={3}
                          fill="url(#fill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {!s.sales.length && (
                    <p className="chart-caption">
                      Your first sale will bring this chart to life.
                    </p>
                  )}
                </section>
                <section className="panel quick-panel">
                  <h2>Quick actions</h2>
                  <p>A little less admin. More business.</p>
                  {[
                    [
                      ScanBarcode,
                      "Create a new sale",
                      "Scan items and start billing",
                      "Point of sale",
                    ],
                    [
                      Package,
                      "Manage inventory",
                      "Add products and update stock",
                      "Inventory",
                    ],
                    [
                      ShoppingBag,
                      "Record a purchase",
                      "Receive stock from a supplier",
                      "Purchases",
                    ],
                  ].map(([Icon, title, desc, v]: any) => (
                    <button
                      className="quick-action"
                      key={title}
                      onClick={() => go(v)}
                    >
                      <span>
                        <Icon size={21} />
                      </span>
                      <div>
                        <b>{title}</b>
                        <small>{desc}</small>
                      </div>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                  <div className="daily-note">
                    <Store size={18} />
                    <span>
                      Everything your local shop needs,
                      <br />
                      <b>in one place.</b>
                    </span>
                  </div>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Inventory watchlist{" "}
                      <span className="count">{low.length}</span>
                    </h2>
                    <p>Keep your shelves stocked and sales moving.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      go("Inventory");
                      setLowOnly(true);
                    }}
                  >
                    View low-stock inventory <ArrowUpRight size={16} />
                  </button>
                </div>
                {low.length ? (
                  productTable(low.slice(0, 4))
                ) : (
                  <div className="empty-inline">
                    <Package size={26} />
                    <div>
                      <b>
                        {s.products.length
                          ? "Your stock is looking healthy"
                          : "Your shelves are ready for their first products"}
                      </b>
                      <p>
                        {s.products.length
                          ? "No products are below their stock threshold."
                          : "Add your inventory or explore with sample items."}
                      </p>
                    </div>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => {
                        if (!s.products.length) switchVendor("demo-grocery");
                        else go("Inventory");
                      }}
                    >
                      {s.products.length
                        ? "View inventory"
                        : "Explore demo store"}
                    </button>
                  </div>
                )}
              </section>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Recent sales</h2>
                    <button className="text-button" onClick={() => {setHistoryExpanded(true);
                      window.setTimeout(() => historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);}}>
                      View all sales history <ArrowRight size={15} />
                    </button>
                  </div>
                  {s.sales.length ? (
                    s.sales.slice(0, 3).map((x) => (
                      <button
                        className="record-row"
                        key={x.id}
                        onClick={() => {
                          setReceipt(x);
                          setModal("receipt");
                        }}
                      >
                        <span className="product-icon">
                          <Receipt size={18} />
                        </span>
                        <div>
                          <b>{x.customer}</b>
                          <small>
                            {new Date(x.date).toLocaleString("en-IN")}
                          </small>
                        </div>
                        <b>{money(x.total)}</b>
                        <span className="badge green">{x.payment}</span>
                      </button>
                    ))
                  ) : (
                    <div className="empty-inline muted">
                      No sales yet. Create your first bill to get started.
                    </div>
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Top-selling products</h2>
                    <span className="muted small">All time</span>
                  </div>
                  {top.some((x) => x.sold) ? (
                    top
                      .filter((x) => x.sold)
                      .map((p, i) => (
                        <div className="record-row" key={p.id}>
                          <span className="rank">0{i + 1}</span>
                          <div>
                            <b>{p.name}</b>
                            <small>{p.category}</small>
                          </div>
                          <b>{p.sold} sold</b>
                        </div>
                      ))
                  ) : (
                    <div className="empty-inline muted">
                      Your best sellers will appear after your first sale.
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {view === "Inventory" && (
            <InventoryImport busy={busy || loading} save={act} />
          )}
          {view === "Inventory" && (
            <section className="panel">
              <div className="toolbar">
                <div className="search">
                  <Search size={18} />
                  <input
                    aria-label="Search inventory"
                    placeholder="Search product name or barcode…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <Choice
                  value={category}
                  onChange={setCategory}
                  options={[
                    "All categories",
                    ...Array.from(new Set(s.products.map((x) => x.category))),
                  ]}
                  label="Category"
                />
                <button
                  className={"btn " + (lowOnly ? "selected" : "")}
                  onClick={() => setLowOnly(!lowOnly)}
                >
                  <SlidersHorizontal size={16} />
                  Low stock
                </button>
                <button className="btn" onClick={() => go("Scan bill")}>
                  <Camera size={16} />
                  Scan bill
                </button>
                <button className="btn" onClick={() => {setCameraPurpose("inventory");setCamera(true)}}>
                  <Camera size={16} />
                  Scan product to add
                </button>
              </div>
              <Choice
                label="Find product by"
                value={posMode}
                onChange={setPosMode}
                options={["Barcode", "Product name"]}
              />
              {posMode === "Barcode" && (
                <form
                  className="scan-strip"
                  onSubmit={(e) => {
                    e.preventDefault();
                    scanCode(barcode);
                  }}
                >
                  <ScanBarcode size={20} />
                  <input
                    aria-label="Inventory barcode"
                    placeholder="Scan barcode to find or add a product"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                  />
                  <button className="text-button">
                    Find item <ArrowRight size={16} />
                  </button>
                </form>
              )}
              {productTable(filtered)}
              {!filtered.length && (
                <div className="empty-inline">
                  No matching products. Add a product to get started.
                </div>
              )}
              <div className="table-footer">
                {filtered.length} products{" "}
                <span>Stock updates automatically after every sale</span>
              </div>
            </section>
          )}

          {view === "Point of sale" && (
            <div className="pos-layout">
              <section className="panel">
                <div className="panel-heading">
                  <h2>Sell by barcode or product name</h2>
                  <span className="badge green">{s.products.length} items</span>
                </div>
                <Choice
                  label="Find product by"
                  value={posMode}
                  onChange={setPosMode}
                  options={["Barcode", "Product name"]}
                />
                {posMode === "Barcode" && (
                  <form
                    className="scan-strip"
                    onSubmit={(e) => {
                      e.preventDefault();
                      scanCode(barcode);
                    }}
                  >
                    <ScanBarcode size={22} />
                    <input
                      ref={scan}
                      autoFocus
                      aria-label="Scan barcode"
                      placeholder="Scan barcode or enter code + Enter"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                    />
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Scan multiple barcodes with camera"
                      title="Scan multiple barcodes"
                      onClick={() => {setCameraPurpose("sale");setCamera(true)}}
                    >
                      <Camera size={19} />
                    </button>
                  </form>
                )}
                {posMode === "Product name" && (
                  <div className="toolbar">
                    <div className="search">
                      <Search size={18} />
                      <input
                        aria-label="Search products"
                        placeholder="Type product name — no barcode needed"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                <div className="product-grid">
                  {posProducts.map((p) => (
                    <button
                      className="catalog-card"
                      key={p.id}
                      onClick={() => add(p)}
                      disabled={!p.stock}
                    >
                      <span
                        className={
                          "product-icon tone-" + (s.products.indexOf(p) % 4)
                        }
                      >
                        <Package size={24} />
                      </span>
                      <b>{p.name}</b>
                      <small>
                        {p.unit} · {p.stock} in stock
                      </small>
                      <div>
                        <strong>{money(netPrice(p))}</strong>
                        {productDiscount(p) > 0 && (
                          <small>{money(productDiscount(p))} off</small>
                        )}
                        <Plus size={18} />
                      </div>
                    </button>
                  ))}
                </div>
                {posMode === "Product name" && !query.trim() && (
                  <div className="empty-inline">
                    Type a product name to show matching items.
                  </div>
                )}
                {posMode === "Product name" &&
                  !!query.trim() &&
                  !posProducts.length && (
                    <div className="empty-inline">No matching product.</div>
                  )}
                <button
                  className="btn"
                  onClick={() => {
                    setProduct(blank);
                    setModal("product");
                  }}
                >
                  <Plus size={16} />
                  Add other item without barcode
                </button>
                {!s.products.length && (
                  <div className="empty-inline">
                    Add products in Inventory before creating a bill.
                  </div>
                )}
              </section>
              <section className="panel bill" ref={billRef}>
                <div className="panel-heading">
                  <h2>
                    Current bill{" "}
                    <span className="count">
                      {cart.reduce((t, p) => t + p.qty, 0)}
                    </span>
                  </h2>
                  <button className="text-button" onClick={() => {setCart([]);setBatchNotice("")}}>
                    Clear
                  </button>
                </div>
                <div className="bill-body">
                  {batchNotice && <p role="status" className="notice scan-batch-notice">{batchNotice}</p>}
                  <div className="cart-items">
                    {!cartItems.length && (
                      <div className="cart-empty">
                        <ScanBarcode size={42} />
                        <b>Ready for your first item</b>
                        <p>Scan a barcode or select a product.</p>
                      </div>
                    )}
                    {cartItems.map((p) => (
                      <div className="cart-line" key={p.id}>
                        <div>
                          <b>{p.name}</b>
                          <small>
                            {money(netPrice(p))} each
                            {productDiscount(p) > 0 &&
                              " · " + money(productDiscount(p)) + " off"}
                          </small>
                          <label className="sale-line-field">Quantity
                            <input type="number" min="1" max={s.products.find((x) => x.id === p.id)?.stock || 1} step="1" value={p.qty}
                              onChange={(e) => { const value = Number(e.target.value); const available = s.products.find((x) => x.id === p.id)?.stock || 0;
                                if (Number.isInteger(value) && value >= 1 && value <= available)
                                  setCart((rows) => rows.map((row) => row.id === p.id ? { ...row, qty: value } : row)); }} />
                          </label>
                          <label className="sale-line-field">Selling price (₹)
                            <input type="number" min="0" max={p.mrp ?? 10000000} step=".01" value={netPrice(p)}
                              onChange={(e) => { if (e.target.value === '') return; const value = Number(e.target.value);
                                if (Number.isFinite(value) && value >= 0 && value <= (p.mrp ?? 10000000) && Math.round(value * 100) === value * 100)
                                  setCart((rows) => rows.map((row) => row.id === p.id ? { ...row, unitPrice: value } : row)); }} />
                          </label>
                          <div className="quantity">
                            <button
                              aria-label={"Decrease " + p.name}
                              onClick={() =>
                                setCart((c) =>
                                  c
                                    .map((x) =>
                                      x.id === p.id
                                        ? { ...x, qty: x.qty - 1 }
                                        : x,
                                    )
                                    .filter((x) => x.qty > 0),
                                )
                              }
                            >
                              <Minus size={13} />
                            </button>
                            {p.qty}
                            <button
                              aria-label={"Increase " + p.name}
                              onClick={() => add(p)}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>
                        <div>
                          <b>{money(netPrice(p) * p.qty)}</b>
                          <button
                            className="icon-button"
                            aria-label={"Remove " + p.name}
                            onClick={() =>
                              setCart((c) => c.filter((x) => x.id !== p.id))
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bill-total">
                    <span>Subtotal</span>
                    <b>{money(subtotal)}</b>
                  </div>
                  <div className="bill-total">
                    <span>Product discounts</span>
                    <b>−{money(itemSavings)}</b>
                  </div>
                  <label className="bill-total">
                    Extra bill discount (₹)
                    <input
                      type="number"
                      min="0"
                      max={netSubtotal}
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                    />
                  </label>
                  <div className="bill-total grand">
                    <b>Total</b>
                    <strong>
                      {money(Math.max(0, netSubtotal - discount))}
                    </strong>
                  </div>
                  <label>
                    Payment method
                    <Choice
                      value={payment}
                      onChange={setPayment}
                      options={["Cash", "UPI", "Card"]}
                      label="Payment method"
                    />
                  </label>
                  <p className="small muted">
                    Records payment received; does not process payments.
                  </p>
                  <button
                    className="btn primary checkout"
                    disabled={
                      saleLocked ||
                      busy ||
                      !cart.length ||
                      discount > netSubtotal ||
                      discount < 0
                    }
                    onClick={checkout}
                  >
                    <Check size={18} />
                    {busy ? "Saving…" : "Complete sale"}
                    <span>{money(Math.max(0, netSubtotal - discount))}</span>
                  </button>
                </div>
              </section>
            </div>
          )}
          {view === "Dashboard" && historyExpanded && (
            <section className="panel sales-history-panel" ref={historyRef} id="sales-history">
              <div className="panel-heading">
                <h2>Sales history</h2>
                <div className="actions"><span className="muted">{s.sales.length} invoices</span>
                  <button className="btn" onClick={() => exportCSV("sales")}>Export sales</button>
                  <button className="text-button" onClick={() => setHistoryExpanded(false)}>Hide history</button></div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      "Invoice",
                      "Date",
                      "Customer",
                      "Items",
                      "Payment",
                      "Total",
                      "",
                    ].map((x) => (
                      <TableHead key={x}>{x}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.sales.map((x) => (
                    <TableRow key={x.id}>
                      <TableCell className="mono">
                        #
                        {(x.id.startsWith("demo-")
                          ? x.id
                          : x.id.slice(0, 8)
                        ).toUpperCase()}
                      </TableCell>
                      <TableCell>
                        {new Date(x.date).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell>{x.customer}</TableCell>
                      <TableCell>
                        {x.items.reduce((t, p) => t + p.qty, 0)}
                      </TableCell>
                      <TableCell>
                        <span className="badge green">{x.payment}</span>
                      </TableCell>
                      <TableCell>{money(x.total)}</TableCell>
                      <TableCell>
                        <button
                          className="text-button"
                          onClick={() => {
                            setReceipt(x);
                            setModal("receipt");
                          }}
                        >
                          Receipt <Printer size={15} />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!s.sales.length && (
                <div className="empty-inline">No sales recorded yet.</div>
              )}
            </section>
          )}
          {view === "Supply hub" && (
            <SupplyHub
              s={s}
              vendorId={vendorId}
              busy={busy || loading}
              save={act}
              onAddSupplier={() => setModal("contact")}
            />
          )}
          {view === "Purchases" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Stock received</h2>
                  <p>Record received purchases to increase inventory.</p>
                </div>
                <button
                  className="btn primary"
                  disabled={!s.products.length}
                  onClick={() => setModal("purchase")}
                >
                  <Plus size={16} />
                  Receive stock
                </button>
              </div>
              {!s.products.length && (
                <div className="notice">Add a product in Inventory first.</div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Date", "Product", "Supplier", "Quantity", "Cost"].map(
                      (x) => (
                        <TableHead key={x}>{x}</TableHead>
                      ),
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.purchases.map((x) => (
                    <TableRow key={x.id}>
                      <TableCell>
                        {new Date(x.date).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell>{x.product}</TableCell>
                      <TableCell>{x.supplier}</TableCell>
                      <TableCell>{x.qty}</TableCell>
                      <TableCell>{money(x.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!s.purchases.length && (
                <div className="empty-inline">No purchases recorded yet.</div>
              )}
            </section>
          )}
          {view === "Expenses" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Business expenses</h2>
                <button
                  className="btn primary"
                  onClick={() => setModal("expense")}
                >
                  <Plus size={16} />
                  Add expense
                </button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.expenses.map((x) => (
                    <TableRow key={x.id}>
                      <TableCell>
                        {new Date(x.date).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell>{x.name}</TableCell>
                      <TableCell>{money(x.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!s.expenses.length && (
                <div className="empty-inline">
                  Record rent, utilities, and other shop expenses here.
                </div>
              )}
            </section>
          )}
          {view === "Reports" && <FinanceReport key={vendorId} s={s} />}
          {view === "Super admin" && role === "owner" && (
            <>
              <AdminManagement />
            </>
          )}
          {view === "Wholesale" && isAdmin && (role === "owner" || permissions.includes("wholesale")) && (
            <div className="wholesale-admin-hub">
              <header className="panel padded"><span className="eyebrow">WHOLESALE MANAGEMENT</span><h2>Wholesale operations</h2>
                <p>Manage wholesale sellers, verification, subscription validity and pricing in one place.</p></header>
              <MarketplaceAdmin />
              {role === "owner" && <WholesalerManagement />}
              {role === "owner" && <WholesaleValidityAdmin />}
              {(role === "owner" || permissions.includes("pricing")) && <WholesalePricingAdmin />}
            </div>
          )}
          {view === "Page not found" && (
            <section className="panel padded">
              <h2>Page not found</h2>
              <button className="btn" onClick={() => go("Dashboard")}>
                Return to dashboard
              </button>
            </section>
          )}
          {view === "Settings" && (
            <StoreLogo
              key={vendorId}
              vendorId={vendorId}
              logo={logo}
              onChange={setLogo}
            />
          )}
          {view === "Settings" && (
            <section className="panel settings">
              <div className="panel-heading"><div><h2>Store category</h2><p>Wholesalers in this category can discover your store.</p></div></div>
              <form className="form" onSubmit={async (e) => {
                e.preventDefault();
                const businessType = String(new FormData(e.currentTarget).get("businessType"));
                if (await act({ type: "vendor_category", businessType })) toast.success("Store category updated");
              }}>
                <label>Business category
                  <select name="businessType" key={vendors.find((v) => v.id === vendorId)?.type} defaultValue={vendors.find((v) => v.id === vendorId)?.type || "General store"}>
                    {businessTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <button className="btn primary" disabled={busy}>Save category</button>
              </form>
            </section>
          )}
          {view === "Settings" && (
            <section className="panel settings">
              <div className="panel-heading">
                <div>
                  <h2>Store details</h2>
                  <p>These details appear on your printed receipts.</p>
                </div>
              </div>
              <form
                key={s.settings.name + s.settings.phone}
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  if (
                    await act({
                      type: "settings",
                      ...Object.fromEntries(f),
                      lowPercent: Number(f.get("lowPercent")),
                    })
                  )
                    toast.success("Store details saved");
                }}
              >
                <label>
                  Store name
                  <input name="name" required defaultValue={s.settings.name} />
                </label>
                <label>
                  Phone
                  <input name="phone" defaultValue={s.settings.phone} />
                </label>
                <label>
                  Address
                  <textarea name="address" defaultValue={s.settings.address} />
                </label>
                <label>
                  Low-stock alert (%)
                  <input
                    name="lowPercent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    required
                    defaultValue={s.settings.lowPercent ?? 20}
                  />
                </label>
                <p className="muted small">
                  Alert when remaining stock is at or below this percentage of
                  the product’s target stock. Example: 20% of a 100-unit target
                  alerts at 20 units. Set each target in Inventory → Edit
                  product.
                </p>
                <button className="btn primary" disabled={busy}>
                  Save changes
                </button>
                <p className="muted small">
                  Prices are recorded as final selling prices. This app provides
                  sales receipts; it does not calculate tax or file returns.
                </p>
              </form>
            </section>
          )}
          {view === "Vendors" && isAdmin && (
            <>
              <div className="vendor-intro">
                <div>
                  <span className="eyebrow">ONE WORKSPACE. EVERY SHOP.</span>
                  <h2>A home for every vendor</h2>
                  <p>
                    Manage different types of shops with separate stock, sales,
                    customers and expenses.
                  </p>
                </div>
                <span className="badge green">
                  {vendors.filter((v) => !v.demo).length} live stores ·{" "}
                  {vendors.filter((v) => v.demo).length} demo stores
                </span>
              </div>
              <section className="panel">
                <div className="toolbar">
                  <div className="search">
                    <Search size={18} />
                    <input
                      aria-label="Search vendors"
                      placeholder="Find a shop, owner or business type…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <Choice
                    value={vendorKind}
                    onChange={setVendorKind}
                    options={["All vendors", "My stores", "Demo stores"]}
                    label="Vendor filter"
                  />
                </div>
                <div className="table-scroll">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        {[
                          "Store",
                          "Owner",
                          "Type",
                          "Status",
                          "Days left",
                          "Products",
                          "Sales",
                          "Revenue",
                          "Action",
                        ].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vendors
                        .filter(
                          (v) =>
                            (v.name + " " + v.owner + " " + v.type)
                              .toLowerCase()
                              .includes(query.toLowerCase()) &&
                            (vendorKind === "All vendors" ||
                              (vendorKind === "Demo stores"
                                ? v.demo
                                : !v.demo)),
                        )
                        .map((v) => (
                          <tr key={v.id}>
                            <td>
                              {v.name}
                              {v.demo ? " · Demo" : ""}
                            </td>
                            <td>{v.owner}</td>
                            <td>{v.type}</td>
                            <td>
                              <span
                                className={
                                  "badge " + (v.suspended ? "amber" : "green")
                                }
                              >
                                {v.suspended ? "Suspended" : "Active"}
                              </span>
                            </td>
                            <td>{v.daysRemaining ?? 0}</td>
                            <td>{v.products}</td>
                            <td>{v.sales}</td>
                            <td>{money(v.revenue)}</td>
                            <td>
                              <button
                                className="btn"
                                disabled={loading || busy}
                                onClick={() => {
                                  if (v.id === vendorId) go("Vendor access");
                                  else void switchVendor(v.id);
                                }}
                              >
                                {v.id === vendorId
                                  ? "Manage access"
                                  : "Open store"}
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <div className="notice vendor-help">
                Open a store and select Vendor access to assign its owner a
                sign-in. Each vendor sees only assigned active stores. Use
                Subscription access here to suspend an unpaid store or
                reactivate it after payment.
              </div>
            </>
          )}
          {view === "Scan bill" && (
            <section className="panel">
              <BillScanner
                key={vendorId}
                products={s.products}
                storeName={s.settings.name}
                busy={busy || loading}
                save={async (a) => {
                  const result = await act(a);
                  if (result) {
                    toast.success("Bill imported. Products and stock updated.");
                    return true;
                  }
                  return false;
                }}
              />
            </section>
          )}
          {view === "Subscription approvals" && isAdmin && (
            <SubscriptionApprovals />
          )}
          {view === "Vendor access" &&
            isAdmin &&
            vendors.find((v) => v.id === vendorId) && (
              <VendorSubscription
                key={vendorId}
                info={subscription}
                vendor={vendors.find((v) => v.id === vendorId)!}
                busy={busy || loading}
                save={act}
              />
            )}
          {view === "Vendor access" && isAdmin && (
            <section className="panel settings">
              <div className="panel-heading">
                <div>
                  <h2>Access to {s.settings.name}</h2>
                  <p>Vendors sign in with their own email and password.</p>
                </div>
              </div>
              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  setAccessCode("");
                  setCodeKind("activate");
                  if (
                    await act({ type: "invite_vendor", email: f.get("email") })
                  )
                    toast.success("Access code created. No message was sent.");
                }}
              >
                <label>
                  Vendor sign-in email
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="vendor@example.com"
                  />
                </label>
                <button className="btn primary" disabled={busy || loading}>
                  Create 7-day activation code
                </button>
                <p className="muted small">
                  Share the activation link privately with the vendor. They
                  enter this email and choose their own password. Existing users
                  can redeem the code under Account. Codes are single-use; this
                  app does not send emails.
                </p>
                {accessCode && (
                  <div className="access-code">
                    <b>Copy this code now</b>
                    <code>{accessCode}</code>
                    <a
                      href={
                        location.origin +
                        "/#" +
                        codeKind +
                        "=" +
                        encodeURIComponent(accessCode)
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open{" "}
                      {codeKind === "reset" ? "password reset" : "activation"}{" "}
                      page
                    </a>
                    <button
                      type="button"
                      className="btn"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            location.origin +
                              "/#" +
                              codeKind +
                              "=" +
                              encodeURIComponent(accessCode),
                          );
                          toast.success("Code copied");
                        } catch {
                          toast.error("Select and copy the code manually.");
                        }
                      }}
                    >
                      Copy private link
                    </button>
                  </div>
                )}
              </form>
              <div className="panel-heading">
                <h2>Assigned accounts</h2>
              </div>
              {[
                ...access.members
                  .filter((m) => m.vendorId === vendorId)
                  .map((m) => ({ ...m, status: "Active" })),
                ...access.invites
                  .filter((m) => m.vendorId === vendorId)
                  .map((m) => ({ ...m, status: "Pending" })),
              ].map((m, i) => (
                <div className="record-row" key={m.email + i}>
                  <div>
                    <b>{m.email}</b>
                    <small>{m.status}</small>
                  </div>
                  <div className="actions">
                    {m.status === "Active" && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={async () => {
                          setCodeKind("reset");
                          setAccessCode("");
                          if (
                            await act({
                              type: "reset_vendor_password",
                              email: m.email,
                            })
                          )
                            toast.success(
                              "One-hour reset link created. Share it privately.",
                            );
                        }}
                      >
                        Reset password
                      </button>
                    )}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await act({ type: "revoke_access", email: m.email })
                        ) {
                          setAccessCode("");
                          toast.success("Store access revoked");
                        }
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
          {view === "Support" && <Support />}
          {view === "Employees" && (
            <Employees
              vendorId={vendorId}
              onMessage={(value) => toast.success(value)}
            />
          )}
          {view === "Pricing" && (
            <>
              {isAdmin && pricing && (
                <PricingEditor
                  config={pricing}
                  save={act}
                  busy={busy || loading}
                />
              )}
              {isAdmin && (role === "owner" || permissions.includes("wholesale")) &&
                <button className="btn" onClick={() => go("Wholesale")}>Manage wholesale accounts and pricing</button>}
              {role === "admin" && permissions.includes("pricing") && !permissions.includes("wholesale") && <WholesalePricingAdmin />}
              <Pricing
                key={vendorId}
                s={s}
                busy={busy || loading}
                save={act}
                config={pricing}
                info={subscription}
                admin={isAdmin}
                reload={() => void refresh()}
              />
            </>
          )}
          {view === "Account" && (
            <section className="panel settings">
              <div className="panel-heading">
                <div>
                  <h2>My account</h2>
                  <p>{email}</p>
                </div>
              </div>
              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const f = new FormData(form);
                  try {
                    await api("/api/auth/password", {
                      currentPassword: f.get("current"),
                      password: f.get("password"),
                    });
                    form.reset();
                    toast.success(
                      "Password changed. Other sessions signed out.",
                    );
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <label>
                  Current password
                  <PasswordInput
                    name="current"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label>
                  New password
                  <PasswordInput
                    name="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                  />
                </label>
                <button className="btn primary">Change password</button>
              </form>
              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  if (cart.length) {
                    toast.error("Complete or clear your current bill first.");
                    return;
                  }
                  if (
                    await act({ type: "claim_access", code: f.get("code") })
                  ) {
                    go("Dashboard");
                    toast.success("Additional store activated");
                  }
                }}
              >
                <label>
                  Activate another assigned store
                  <input
                    name="code"
                    required
                    autoComplete="off"
                    placeholder="One-time activation code"
                  />
                </label>
                <button className="btn">Redeem code</button>
              </form>
            </section>
          )}
          <footer className="page-footer">
            <span>
              shopkeeper.{" "}
              <span className="muted">Made for the everyday business.</span>
            </span>
            <span className="muted">INR ₹ · India</span>
          </footer>
        </div>
      </main>
      <Dialog
        open={!!modal && !(camera && cameraPurpose === "product")}
        onOpenChange={(o) => {
          if (!o && !busy && !(camera && cameraPurpose === "product")) setModal("");
        }}
      >
        <DialogContent className="app-dialog">
          <DialogTitle>
            {modal === "vendor"
              ? "Add vendor store"
              : modal === "product"
                ? product.id
                  ? "Edit product"
                  : "Add product"
                : modal === "contact"
                  ? "Add supplier"
                  : modal === "purchase"
                    ? "Receive stock"
                    : modal === "receipt"
                      ? "Sale receipt"
                      : "Add expense"}
          </DialogTitle>
          <DialogDescription>
            {modal === "product"
              ? "Update the item details and stock below."
              : modal === "receipt"
                ? "Sale saved and inventory updated."
                : "Save this record to your store."}
          </DialogDescription>
          {modal === "vendor" && (
            <VendorForm
              busy={busy}
              save={async (a) => {
                if (await act(a)) {
                  setModal("");
                  go("Dashboard");
                  setCart([]);
                  setDiscount(0);
                  saleId.current = "";
                  toast.success(
                    "Vendor store created. Add products to start trading.",
                  );
                }
              }}
            />
          )}
          {modal === "product" && (
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                const completed = {...product, price: Number.isFinite(product.price) ? product.price : product.mrp};
                if (await act({ type: "product", product: completed })) {
                  setModal("");
                  toast.success("Product saved");
                }
              }}
            >
              <ProductLabel
                key={product.id || "new"}
                apply={(draft) =>
                  setProduct((p) => ({
                    ...p,
                    ...(draft.barcode ? { barcode: draft.barcode } : {}),
                    ...(draft.mrp !== undefined ? { mrp: draft.mrp } : {}),
                    ...(draft.name ? { name: draft.name } : {}),
                    ...(draft.mrp !== undefined && !Number.isFinite(p.price) ? {price: draft.mrp} : {}),
                  }))
                }
              />
              <button type="button" className="btn" onClick={() => {setCameraPurpose("product");setCamera(true)}}>
                <Camera size={16} /> Scan barcode with camera
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setProduct((p) => ({
                    ...p,
                    barcode: "ITEM-" + crypto.randomUUID(),
                  }))
                }
              >
                No barcode? Generate item code
              </button>
              <label>
                MRP (₹, optional)
                <input
                  type="number"
                  min={Number.isFinite(product.price) ? product.price : 0}
                  step=".01"
                  value={product.mrp ?? ""}
                  onChange={(e) => setProduct((current) => {
                    const mrp = e.target.value === "" ? undefined : Number(e.target.value);
                    return {...current,mrp,...(mrp !== undefined && !Number.isFinite(current.price) ? {price:mrp} : {})};
                  })}
                />
              </label>
              <p className="muted small">Each weight or package size needs its own product. If two sizes share a printed barcode, give one a separate internal item code so the scanner cannot select the wrong price.</p>
              <label>Product subcategory
                <input value={product.subcategory ?? ""} maxLength={100} placeholder="For example: Rice, biscuits, 500 ml packs"
                  onChange={(e) => setProduct({ ...product, subcategory: e.target.value })} />
              </label>
              <label>Weight / size
                <input value={product.weight ?? ""} maxLength={50} placeholder="For example: 500 g, 1 kg, 750 ml"
                  onChange={(e) => setProduct({ ...product, weight: e.target.value })} />
              </label>
              {product.mrp !== undefined && (
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    setProduct({ ...product, price: product.mrp! })
                  }
                >
                  Use MRP as selling price
                </button>
              )}
              {(
                [
                  "name",
                  "barcode",
                  "category",
                  "unit",
                  "price",
                  "cost",
                  "stock",
                  "target",
                ] as const
              ).map((k) => (
                <label key={k}>
                  {
                    {
                      name: "Product name",
                      barcode: "Barcode",
                      category: "Category",
                      unit: "Pack / unit",
                      price: "Selling price (₹)",
                      cost: "Cost price (₹)",
                      stock: "Stock quantity",
                      target: "Target stock quantity",
                    }[k]
                  }
                  <input
                    required={k !== "barcode" && !(k === "price" && product.mrp !== undefined)}
                    placeholder={
                      k === "barcode"
                        ? "Optional — leave empty for items without barcode"
                        : k === "price" ? "Leave empty to use MRP"
                        : undefined
                    }
                    type={
                      ["price", "cost", "stock", "target"].includes(k)
                        ? "number"
                        : "text"
                    }
                    min="0"
                    step={["price", "cost"].includes(k) ? ".01" : "1"}
                    value={
                      typeof product[k] === "number" &&
                      !Number.isFinite(product[k])
                        ? ""
                        : (product[k] ?? "")
                    }
                    onChange={(e) =>
                      setProduct({
                        ...product,
                        [k]: ["price", "cost", "stock", "target"].includes(k)
                          ? e.target.value === ""
                            ? NaN
                            : Number(e.target.value)
                          : e.target.value,
                      })
                    }
                  />
                </label>
              ))}
              <label>
                Product discount
                <Choice
                  label="Product discount mode"
                  value={product.discountMode ?? "none"}
                  options={["none", "auto", "custom"]}
                  onChange={(value) =>
                    setProduct({
                      ...product,
                      discountMode: value as Product["discountMode"],
                      customDiscount: product.customDiscount ?? NaN,
                    })
                  }
                />
              </label>
              <label>
                Automatic discount based on
                <Choice
                  label="Discount basis"
                  value={product.discountBasis ?? "cost"}
                  options={["cost", "price"]}
                  onChange={(value) =>
                    setProduct({
                      ...product,
                      discountBasis: value as "cost" | "price",
                    })
                  }
                />
              </label>
              <p className="muted small">
                Cost = purchase cost; price = selling price. Up to ₹50: no
                automatic discount; above ₹50 through ₹100: ₹3 off; above ₹100:
                ₹10 off per unit. Custom replaces this rule, including for
                low-cost items.
              </p>
              {product.discountMode === "custom" && (
                <label>
                  Custom discount per unit (₹)
                  <input
                    type="number"
                    min="0"
                    max={
                      Number.isFinite(product.price) ? product.price : undefined
                    }
                    step="0.01"
                    required
                    value={
                      Number.isFinite(product.customDiscount)
                        ? product.customDiscount
                        : ""
                    }
                    onChange={(e) =>
                      setProduct({
                        ...product,
                        customDiscount: Number(e.target.value),
                      })
                    }
                  />
                </label>
              )}
              <div className="notice">
                {Number.isFinite(product.price) &&
                Number.isFinite(product.cost) ? (
                  <>
                    Discount: {money(productDiscount(product))} · Customer pays:{" "}
                    <b>{money(netPrice(product))}</b> per unit
                  </>
                ) : (
                  <>Enter cost and selling price to preview the discount.</>
                )}
              </div>
              <p className="muted small">
                Current alert: {s.settings.lowPercent ?? 20}% of target
                {Number.isFinite(product.target)
                  ? " (" + stockThreshold(product, s) + " units)"
                  : ""}
                .
              </p>
              <button className="btn primary" disabled={busy}>
                Save product
              </button>
            </form>
          )}
          {modal === "contact" && (
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget));
                if (
                  await act({
                    type: "contact",
                    kind: "suppliers",
                    ...f,
                  })
                ) {
                  setModal("");
                  toast.success("Contact saved");
                }
              }}
            >
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Phone
                <input name="phone" type="tel" />
              </label>
              <button className="btn primary" disabled={busy}>
                Save contact
              </button>
            </form>
          )}
          {modal === "purchase" && (
            <PurchaseForm
              s={s}
              busy={busy}
              save={async (a) => {
                if (await act(a)) {
                  setModal("");
                  toast.success("Stock received");
                }
              }}
            />
          )}
          {modal === "expense" && (
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  await act({
                    type: "expense",
                    name: f.get("name"),
                    amount: Number(f.get("amount")),
                  })
                ) {
                  setModal("");
                  toast.success("Expense saved");
                }
              }}
            >
              <label>
                Description
                <input name="name" required />
              </label>
              <label>
                Amount (₹)
                <input
                  name="amount"
                  type="number"
                  min=".01"
                  step=".01"
                  required
                />
              </label>
              <button className="btn primary" disabled={busy}>
                Save expense
              </button>
            </form>
          )}
          {modal === "receipt" && receipt && (
            <SaleReceipt sale={receipt} settings={s.settings} demo={s.demo} />
          )}
        </DialogContent>
      </Dialog>
      <MobileScanner
        open={camera}
        onClose={() => setCamera(false)}
        onScan={cameraPurpose === "product" ? scanProductForm : scanCode}
        multi={cameraPurpose === "sale"}
        onScanMany={scanBatch}
        batchActionLabel="Review bill and complete sale"
        describeCode={(raw) => {
          try { const code = parseProductCode(raw).barcode;
            const item = s.products.find((product) => product.barcode && product.barcode === code);
            return item ? `${item.name} · ${item.unit}` : "Product not saved";
          } catch { return "Invalid code"; }
        }}
      />
    </SidebarProvider>
  );
}
function PurchaseForm({
  s,
  busy,
  save,
}: {
  s: State;
  busy: boolean;
  save: (a: any) => void;
}) {
  const [id, setId] = useState(s.products[0]?.id || "");
  const operation = useRef(crypto.randomUUID());
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save({
          type: "purchase",
          id: operation.current,
          product: id,
          qty: Number(f.get("qty")),
          cost: Number(f.get("cost")),
          supplier: f.get("supplier"),
          paidAmount: Number(f.get("paidAmount")),
        });
      }}
    >
      <label>
        Product
        <Select value={id} onValueChange={setId}>
          <SelectTrigger aria-label="Product">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {s.products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <p className="muted">
        Selected: {s.products.find((p) => p.id === id)?.name}
      </p>
      <label>
        Supplier
        <input
          name="supplier"
          list="suppliers"
          required
          placeholder="Supplier name"
        />
        <datalist id="suppliers">
          {s.suppliers.map((x) => (
            <option key={x.id} value={x.name} />
          ))}
        </datalist>
      </label>
      <label>
        Quantity received
        <input name="qty" type="number" min="1" step="1" required />
      </label>
      <label>
        Unit cost (₹)
        <input name="cost" type="number" min="0" step=".01" required />
      </label>
      <label>
        Amount paid now (₹)
        <input
          name="paidAmount"
          type="number"
          min="0"
          step=".01"
          defaultValue="0"
          required
        />
      </label>
      <p className="muted small">
        Enter zero for a credit purchase. Unpaid amounts appear in Supplier
        accounts.
      </p>
      <button className="btn primary" disabled={busy}>
        Receive stock
      </button>
    </form>
  );
}

function VendorForm({ busy, save }: { busy: boolean; save: (a: any) => void }) {
  const [kind, setKind] = useState("General store");
  const id = useRef("vendor-" + crypto.randomUUID());
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget));
        save({
          ...f,
          type: "vendor_create",
          id: id.current,
          businessType: kind,
        });
      }}
    >
      <label>
        Store name
        <input
          name="name"
          required
          maxLength={150}
          placeholder="e.g. Hosur Home Essentials"
        />
      </label>
      <label>
        Owner name
        <input name="owner" required maxLength={150} />
      </label>
      <label>
        Business type
        <Choice
          value={kind}
          onChange={setKind}
          options={businessTypes}
          label="Business type"
        />
      </label>
      <label>
        Phone
        <input name="phone" type="tel" maxLength={30} />
      </label>
      <p className="muted small">
        A new store starts empty. Demo data stays in the demo stores.
      </p>
      <button className="btn primary" disabled={busy}>
        {busy ? "Creating…" : "Create vendor store"}
      </button>
    </form>
  );
}
