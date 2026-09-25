import { randomUUID } from "node:crypto";
import {
  email,
  hashPassword,
  limit,
  requireSuperAdmin,
  requireVendor,
  token,
  digest,
  wholesalePrincipal,
  employeePermissions,
  requireEmployeePermission,
} from "./security.mjs";
import { transaction } from "./db.mjs";
import {
  wholesalePricing,
  wholesaleSubscriptionInfo,
  wholesaleValidity,
  requireWholesaleActive,
} from "./wholesale-subscriptions.mjs";
import { recordActivity } from "./activities.mjs";
import { businessTypes } from "./domain/vendors.mjs";

const bad = (message, status = 400) =>
  Object.assign(Error(message), { status });
const text = (value, max = 200) =>
  typeof value === "string" && value.trim() && value.length <= max
    ? value.trim()
    : null;
const money = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= 10000000 &&
  Math.round(value * 100) === value * 100;
function seller(user) {
  if (user.role !== "wholesale")
    throw bad("Wholesale seller access required.", 403);
}
function vendorName(row) {
  try {
    return JSON.parse(row.vendor_data).settings.name;
  } catch {
    return "Vendor";
  }
}

async function sellerData(db, id) {
  const profile = await db
    .prepare(
      "SELECT w.*,u.email,u.name,u.disabled FROM wholesalers w JOIN users u ON u.id=w.user_id WHERE w.user_id=?",
    )
    .get(id);
  if (!profile) throw bad("Wholesale seller profile not found.", 404);
  const products = await db
    .prepare(
      "SELECT * FROM wholesale_products WHERE wholesaler_id=? ORDER BY updated_at DESC",
    )
    .all(id);
  const requests = await db
    .prepare(
      `SELECT r.*,v.data AS vendor_data,COALESCE(SUM(i.quantity*i.unit_price),0) AS total FROM wholesale_requests r JOIN vendors v ON v.id=r.vendor_id LEFT JOIN wholesale_request_items i ON i.request_id=r.id WHERE r.wholesaler_id=? GROUP BY r.id,v.data ORDER BY r.created_at DESC`,
    )
    .all(id);
  const items = await db
    .prepare(
      "SELECT i.*,p.name,p.unit,p.sku FROM wholesale_request_items i JOIN wholesale_products p ON p.id=i.product_id JOIN wholesale_requests r ON r.id=i.request_id WHERE r.wholesaler_id=? ORDER BY p.name",
    )
    .all(id);
  const transactions = await db
    .prepare(
      `SELECT t.*,r.vendor_id,v.data AS vendor_data FROM wholesale_transactions t JOIN wholesale_requests r ON r.id=t.request_id JOIN vendors v ON v.id=r.vendor_id WHERE r.wholesaler_id=? ORDER BY t.created_at DESC`,
    )
    .all(id);
  const refunds = await db
    .prepare(
      "SELECT f.* FROM wholesale_refunds f JOIN wholesale_transactions t ON t.id=f.transaction_id JOIN wholesale_requests r ON r.id=t.request_id WHERE r.wholesaler_id=? ORDER BY f.created_at DESC",
    )
    .all(id);
  const returns = await db
    .prepare(
      `SELECT wr.*,p.name AS product_name,p.unit,v.data AS vendor_data FROM wholesale_returns wr JOIN wholesale_products p ON p.id=wr.product_id JOIN vendors v ON v.id=wr.vendor_id WHERE wr.wholesaler_id=? ORDER BY wr.created_at DESC`,
    )
    .all(id);
  const vendors = await db
    .prepare(
      `SELECT v.id,v.data,v.business_type,v.suspended,CASE WHEN a.vendor_id IS NULL THEN FALSE ELSE TRUE END AS selected FROM vendors v LEFT JOIN wholesale_vendor_access a ON a.vendor_id=v.id AND a.wholesaler_id=? WHERE v.business_type=(SELECT business_category FROM wholesalers WHERE user_id=?) ORDER BY v.created_at,v.id`,
    )
    .all(id, id);
  const offlineVendors = await db.prepare(
    `SELECT v.*,COALESCE(SUM(CASE WHEN l.kind='sale' THEN l.amount WHEN l.kind='payment' THEN -l.amount ELSE l.amount END),0) AS balance FROM wholesale_offline_vendors v LEFT JOIN wholesale_offline_vendor_ledger l ON l.vendor_id=v.id WHERE v.wholesaler_id=? GROUP BY v.id ORDER BY v.name`,
  ).all(id);
  const offlineLedger = await db.prepare(
    `SELECT l.* FROM wholesale_offline_vendor_ledger l WHERE l.wholesaler_id=? ORDER BY l.created_at DESC,l.id DESC`,
  ).all(id);
  const expenses = await db.prepare(
    "SELECT * FROM wholesale_expenses WHERE wholesaler_id=? ORDER BY expense_date DESC,created_at DESC",
  ).all(id);
  const pricing = await wholesalePricing(db),
    subscription = await wholesaleSubscriptionInfo(db, profile, pricing);
  return {
    profile,
    pricing,
    subscription,
    products,
    requests: requests.map((r) => ({
      ...r,
      vendorName: vendorName(r),
      items: items.filter((i) => i.request_id === r.id),
    })),
    transactions: transactions.map((t) => ({
      ...t,
      vendorName: vendorName(t),
    })),
    refunds,
    returns: returns.map((r) => ({ ...r, vendorName: vendorName(r) })),
    vendors: vendors.map((v) => ({
      id: v.id,
      name: vendorName({ vendor_data: v.data }),
      category: v.business_type,
      selected: v.selected === true || v.selected === 1,
      suspended: v.suspended,
    })),
    offlineVendors,
    offlineLedger,
    expenses,
  };
}

async function vendorRequests(db, vendorId) {
  const requests = await db
    .prepare(
      `SELECT r.*,w.business_name,COALESCE(SUM(i.quantity*i.unit_price),0) AS total FROM wholesale_requests r JOIN wholesalers w ON w.user_id=r.wholesaler_id LEFT JOIN wholesale_request_items i ON i.request_id=r.id WHERE r.vendor_id=? GROUP BY r.id,w.business_name ORDER BY r.created_at DESC`,
    )
    .all(vendorId);
  const items = await db
    .prepare(
      "SELECT i.*,p.name,p.unit FROM wholesale_request_items i JOIN wholesale_products p ON p.id=i.product_id JOIN wholesale_requests r ON r.id=i.request_id WHERE r.vendor_id=?",
    )
    .all(vendorId);
  return requests.map((r) => ({
    ...r,
    items: items.filter((i) => i.request_id === r.id),
  }));
}
async function vendorReturns(db, vendorId) {
  return db
    .prepare(
      `SELECT wr.*,p.name AS product_name,p.unit,w.business_name FROM wholesale_returns wr JOIN wholesale_products p ON p.id=wr.product_id JOIN wholesalers w ON w.user_id=wr.wholesaler_id WHERE wr.vendor_id=? ORDER BY wr.created_at DESC`,
    )
    .all(vendorId);
}
async function vendorTransactions(db, vendorId) {
  return db
    .prepare(
      `SELECT t.*,r.wholesaler_id,w.business_name FROM wholesale_transactions t JOIN wholesale_requests r ON r.id=t.request_id JOIN wholesalers w ON w.user_id=r.wholesaler_id WHERE r.vendor_id=? ORDER BY t.created_at DESC`,
    )
    .all(vendorId);
}

export function registerWholesaleRoutes(app, db) {
  app.use("/api/wholesale", async (req, res, next) => {
    if (req.user.role === "wholesale")
      req.wholesalerId = await wholesalePrincipal(db, req.user);
    const path = req.originalUrl.split("?")[0],
      free = [
        "/api/wholesale/portal",
        "/api/wholesale/profile",
        "/api/wholesale/logo",
        "/api/wholesale/pricing",
        "/api/wholesale/subscriptions",
        "/api/wholesale/payment-proof",
      ];
    if (req.user.role === "vendor" && req.method !== "GET") {
      const needed = path.includes("/returns")
        ? "returns"
        : path.includes("/requests")
          ? "purchases"
          : null;
      if (needed) requireEmployeePermission(req.user, needed);
    }
    if (req.user.role === "wholesale" && req.method !== "GET") {
      const needed = path.includes("/products")
        ? "inventory"
        : path.includes("/offline-vendors")
          ? "customers"
        : path.includes("/access")
          ? "customers"
          : path.includes("/returns") || path.includes("/refunds")
            ? "returns"
          : path.includes("/transactions")
              ? "payments"
              : path.includes("/profile") || path.includes("/logo")
                ? "settings"
                : path.includes("/requests")
                  ? "purchases"
                  : null;
      if (needed) requireEmployeePermission(req.user, needed);
    }
    if (
      req.method === "POST" &&
      req.user.role === "wholesale" &&
      !free.some((x) => path.startsWith(x))
    )
      await requireWholesaleActive(db, req.user);
    if (req.method === "POST" && !free.some((x) => path.startsWith(x))) {
      const json = res.json.bind(res);
      res.json = (body) => {
        const names = path.includes("/returns")
          ? "Wholesale return updated"
          : path.includes("/requests")
            ? "Wholesale order request updated"
            : path.includes("/products")
              ? "Wholesale product updated"
              : path.includes("/transactions")
                ? "Wholesale transaction recorded"
                : path.includes("/refunds")
                  ? "Wholesale refund recorded"
                  : path.includes("/access")
                    ? "Catalog visibility updated"
                    : "Wholesale activity";
        const wholesalerId =
          req.user.role === "wholesale"
            ? req.wholesalerId
            : body?.requests?.[0]?.wholesaler_id || null;
        const vendorId =
          req.body?.vendorId || body?.requests?.[0]?.vendor_id || null;
        recordActivity(db, {
          actorId: req.user.id,
          wholesalerId,
          vendorId,
          scope:
            wholesalerId && vendorId
              ? "all"
              : wholesalerId
                ? "wholesale"
                : "vendor",
          category: path.includes("/returns") || path.includes("/refunds") ? "return" :
            path.includes("/transactions") ? "payment" : path.includes("/requests") ? "order" : "wholesale",
          title: names,
        }).then(
          () => json(body),
          () => json(body),
        );
        return res;
      };
    }
    next();
  });
  app.get("/api/wholesalers", async (req, res) => {
    requireSuperAdmin(req.user);
    const config = await wholesalePricing(db),
      rows = await db
        .prepare(
          "SELECT u.id,u.email,u.name,u.disabled,w.* FROM users u JOIN wholesalers w ON w.user_id=u.id WHERE u.role='wholesale' ORDER BY w.created_at DESC",
        )
        .all();
    res.json({
      wholesalers: rows.map((x) => ({
        ...x,
        ...wholesaleValidity(x, config.trialDays),
      })),
      pricing: config,
    });
  });
  app.post("/api/wholesalers", async (req, res) => {
    requireSuperAdmin(req.user);
    await limit(db, "wholesale-create:" + req.user.id, 20);
    const mail = email(req.body.email),
      name = text(req.body.name, 100),
      business = text(req.body.businessName, 150),
      category = text(req.body.businessCategory, 80) || "General store";
    if (!name || !business || !businessTypes.includes(category))
      throw bad("Enter the seller and wholesale business names.");
    const hash = await hashPassword(req.body.password),
      id = randomUUID();
    await transaction(db, async () => {
      if (await db.prepare("SELECT 1 FROM users WHERE email=?").get(mail))
        throw bad("An account already uses this email.", 409);
      await db
        .prepare(
          "INSERT INTO users(id,email,password_hash,role,name,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(id, mail, hash, "wholesale", name, Date.now());
      await db
        .prepare(
          "INSERT INTO wholesalers(user_id,business_name,phone,address,created_at,business_category) VALUES(?,?,?,?,?,?)",
        )
        .run(
          id,
          business,
          text(req.body.phone, 30) || "",
          text(req.body.address, 300) || "",
          Date.now(),
          category,
        );
    });
    res.json({ ok: true });
  });
  app.post("/api/wholesalers/:id", async (req, res) => {
    requireSuperAdmin(req.user);
    let code;
    await transaction(db, async () => {
      const target = await db
        .prepare(
          "SELECT * FROM users WHERE id=? AND role='wholesale' FOR UPDATE",
        )
        .get(req.params.id);
      if (!target) throw bad("Wholesale seller not found.", 404);
      if (["enable", "disable"].includes(req.body.action)) {
        await db
          .prepare("UPDATE users SET disabled=? WHERE id=?")
          .run(req.body.action === "disable", target.id);
        await db.prepare("DELETE FROM sessions WHERE user_id=?").run(target.id);
      } else if (req.body.action === "reset") {
        code = token();
        await db
          .prepare("DELETE FROM tokens WHERE email=? AND kind='reset'")
          .run(target.email);
        await db
          .prepare("INSERT INTO tokens VALUES(?,?,?,?,?)")
          .run(digest(code), target.email, null, "reset", Date.now() + 3600000);
      } else throw bad("Choose enable, disable or reset.");
    });
    res.json({ ok: true, ...(code ? { code } : {}) });
  });
  app.get("/api/wholesale/portal", async (req, res) => {
    seller(req.user);
    const data = await sellerData(db, req.wholesalerId),
      access = employeePermissions(req.user);
    if (!access.includes("inventory")) data.products = [];
    if (!access.some((x) => ["purchases", "payments", "returns"].includes(x)))
      data.requests = [];
    if (!access.includes("payments")) data.transactions = [];
    if (!access.some((x) => ["returns", "payments"].includes(x))) {
      data.returns = [];
      data.refunds = [];
    }
    if (!access.some((x) => ["customers", "payments"].includes(x)))
      data.vendors = [];
    if (!access.some((x) => ["customers", "payments"].includes(x))) {
      data.offlineVendors = [];
      data.offlineLedger = [];
    }
    if (!access.includes("reports")) data.expenses = [];
    res.json({ ...data, permissions: access });
  });
  app.post("/api/wholesale/expenses", async (req, res) => {
    seller(req.user);
    requireEmployeePermission(req.user, "reports");
    await requireWholesaleActive(db, req.user);
    const id = req.body.id || randomUUID();
    if (typeof id !== "string" || id.length > 100) throw bad("Invalid expense identifier.");
    const category = text(req.body.category, 80), description = typeof req.body.description === "string" && req.body.description.length <= 300 ? req.body.description.trim() : null;
    const date = req.body.expenseDate;
    const amount = Number(req.body.amount);
    if (!category || description === null || !Number.isFinite(amount) || amount <= 0 || amount > 10000000 || Math.round(amount*100) !== amount*100 || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw bad("Enter a valid category, date and expense amount.");
    if (Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw bad("Enter a valid expense date.");
    const owner = await wholesalePrincipal(db, req.user);
    const result = await db.prepare("INSERT INTO wholesale_expenses(id,wholesaler_id,category,description,amount,expense_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category=EXCLUDED.category,description=EXCLUDED.description,amount=EXCLUDED.amount,expense_date=EXCLUDED.expense_date,updated_at=EXCLUDED.updated_at WHERE wholesale_expenses.wholesaler_id=EXCLUDED.wholesaler_id")
      .run(id,owner,category,description,amount,date,Date.now(),Date.now());
    if (!result.changes) throw bad("Expense not found.",404);
    res.json({ expenses: await db.prepare("SELECT * FROM wholesale_expenses WHERE wholesaler_id=? ORDER BY expense_date DESC,created_at DESC").all(owner) });
  });
  app.post("/api/wholesale/expenses/:id/delete", async (req, res) => {
    seller(req.user);
    requireEmployeePermission(req.user, "reports");
    await requireWholesaleActive(db, req.user);
    const owner = await wholesalePrincipal(db, req.user);
    const result = await db.prepare("DELETE FROM wholesale_expenses WHERE id=? AND wholesaler_id=?").run(req.params.id, owner);
    if (!result.changes) throw bad("Expense not found.",404);
    res.json({ ok:true });
  });
  app.post("/api/wholesale/offline-vendors", async (req, res) => {
    seller(req.user);
    const v = req.body;
    const name = text(v.name, 160);
    if (!name || ["contactName", "phone", "address", "notes"].some((key) => typeof v[key] !== "string") ||
        v.contactName.length > 160 || v.phone.length > 40 || v.address.length > 400 || v.notes.length > 500)
      throw bad("Enter a business name and valid contact details.");
    const id = v.id || randomUUID(), now = Date.now();
    if (v.id && !await db.prepare("SELECT id FROM wholesale_offline_vendors WHERE id=? AND wholesaler_id=?").get(id, req.wholesalerId))
      throw bad("Offline vendor not found.", 404);
    await db.prepare(`INSERT INTO wholesale_offline_vendors(id,wholesaler_id,name,contact_name,phone,address,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,contact_name=EXCLUDED.contact_name,phone=EXCLUDED.phone,address=EXCLUDED.address,notes=EXCLUDED.notes,updated_at=EXCLUDED.updated_at WHERE wholesale_offline_vendors.wholesaler_id=EXCLUDED.wholesaler_id`)
      .run(id, req.wholesalerId, name, v.contactName.trim(), v.phone.trim(), v.address.trim(), v.notes.trim(), now, now);
    res.json({ ok: true, savedVendorId: id });
  });
  app.post("/api/wholesale/offline-vendors/:id/ledger", async (req, res) => {
    seller(req.user);
    requireEmployeePermission(req.user, "payments");
    const vendor = await db.prepare("SELECT id FROM wholesale_offline_vendors WHERE id=? AND wholesaler_id=?").get(req.params.id, req.wholesalerId);
    if (!vendor) throw bad("Offline vendor not found.", 404);
    const { kind, amount: value, note } = req.body;
    if (!["sale", "payment", "refund"].includes(kind) || !money(value) || typeof note !== "string" || note.length > 300)
      throw bad("Enter a valid sale, payment or refund and amount.");
    await db.prepare("INSERT INTO wholesale_offline_vendor_ledger(id,wholesaler_id,vendor_id,kind,amount,note,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(randomUUID(), req.wholesalerId, vendor.id, kind, value, note.trim(), Date.now());
    res.json({ ok: true });
  });
  app.post("/api/wholesale/profile", async (req, res) => {
    seller(req.user);
    const business = text(req.body.businessName, 150),
      name = text(req.body.name, 100);
    if (!business || !name)
      throw bad("Enter contact and wholesale business names.");
    await transaction(db, async () => {
      await db
        .prepare(
          "UPDATE wholesalers SET business_name=?,phone=?,address=? WHERE user_id=?",
        )
        .run(
          business,
          text(req.body.phone, 30) || "",
          text(req.body.address, 300) || "",
          req.wholesalerId,
        );
      await db
        .prepare("UPDATE users SET name=? WHERE id=?")
        .run(name, req.wholesalerId);
    });
    await recordActivity(db, {
      actorId: req.user.id,
      wholesalerId: req.wholesalerId,
      scope: "wholesale",
      category: "profile",
      title: "Wholesale profile updated",
    });
    res.json(await sellerData(db, req.wholesalerId));
  });
  app.post("/api/wholesale/access", async (req, res) => {
    seller(req.user);
    const ids = req.body.vendorIds;
    if (
      !Array.isArray(ids) ||
      ids.length > 500 ||
      ids.some((id) => typeof id !== "string")
    )
      throw bad("Choose valid vendors.");
    const unique = [...new Set(ids)];
    await transaction(db, async () => {
      if (unique.length) {
        const found = await db
          .prepare("SELECT v.id FROM vendors v JOIN wholesalers w ON w.user_id=? WHERE v.id=ANY(?) AND v.suspended=FALSE AND v.business_type=w.business_category")
          .all(req.wholesalerId, unique);
        if (found.length !== unique.length)
          throw bad("One or more vendors are unavailable.");
      }
      await db
        .prepare("DELETE FROM wholesale_vendor_access WHERE wholesaler_id=?")
        .run(req.wholesalerId);
      for (const id of unique)
        await db
          .prepare(
            "INSERT INTO wholesale_vendor_access(wholesaler_id,vendor_id,created_at) VALUES(?,?,?)",
          )
          .run(req.wholesalerId, id, Date.now());
    });
    res.json(await sellerData(db, req.wholesalerId));
  });
  app.post("/api/wholesale/products", async (req, res) => {
    seller(req.user);
    const p = req.body,
      id = p.id || randomUUID(),
      name = text(p.name),
      unit = text(p.unit, 50),
      sku = typeof p.sku === "string" ? p.sku.trim().slice(0, 100) : "";
    if (
      !name ||
      !unit ||
      !money(Number(p.price)) ||
      !Number.isInteger(Number(p.stock)) ||
      Number(p.stock) < 0 ||
      Number(p.stock) > 10000000
    )
      throw bad("Enter a valid product, unit, price and stock.");
    await db
      .prepare(
        `INSERT INTO wholesale_products(id,wholesaler_id,name,sku,unit,price,stock,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,sku=EXCLUDED.sku,unit=EXCLUDED.unit,price=EXCLUDED.price,stock=EXCLUDED.stock,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at WHERE wholesale_products.wholesaler_id=EXCLUDED.wholesaler_id`,
      )
      .run(
        id,
        req.wholesalerId,
        name,
        sku,
        unit,
        Number(p.price),
        Number(p.stock),
        p.active !== false,
        Date.now(),
        Date.now(),
      );
    res.json(await sellerData(db, req.wholesalerId));
  });
  app.get("/api/wholesale/catalog", async (req, res) => {
    if (req.user.role === "vendor") requireEmployeePermission(req.user, "purchases");
    const vendor = await requireVendor(
      db,
      req.user,
      String(req.query.vendor || ""),
    );
    const products = await db
      .prepare(
        `SELECT p.*,w.business_name FROM wholesale_products p JOIN wholesale_vendor_access a ON a.wholesaler_id=p.wholesaler_id AND a.vendor_id=? JOIN wholesalers w ON w.user_id=p.wholesaler_id JOIN users u ON u.id=p.wholesaler_id WHERE p.active=TRUE AND p.stock>0 AND u.disabled=FALSE AND w.business_category=? ORDER BY w.business_name,p.name`,
      )
      .all(vendor.id, vendor.business_type);
    res.json({
      products,
      requests: await vendorRequests(db, vendor.id),
      returns: await vendorReturns(db, vendor.id),
      transactions: await vendorTransactions(db, vendor.id),
    });
  });
  app.post("/api/wholesale/requests", async (req, res) => {
    const vendor = await requireVendor(db, req.user, req.body.vendorId);
    if (
      !Array.isArray(req.body.items) ||
      !req.body.items.length ||
      req.body.items.length > 100
    )
      throw bad("Choose at least one wholesale product.");
    const ids = req.body.items.map((x) => x.productId);
    const products = await db
      .prepare(
        "SELECT * FROM wholesale_products WHERE id=ANY(?) AND active=TRUE FOR UPDATE",
      )
      .all(ids);
    if (products.length !== new Set(ids).size)
      throw bad("One or more wholesale products are unavailable.");
    const wholesaler = products[0].wholesaler_id;
    if (products.some((p) => p.wholesaler_id !== wholesaler))
      throw bad("Create a separate request for each wholesale seller.");
    if (
      !(await db
        .prepare(
          "SELECT 1 FROM wholesale_vendor_access a JOIN wholesalers w ON w.user_id=a.wholesaler_id WHERE a.wholesaler_id=? AND a.vendor_id=? AND w.business_category=?",
        )
        .get(wholesaler, vendor.id, vendor.business_type))
    )
      throw bad("This wholesale catalog is not shared with your store.", 403);
    const id = randomUUID();
    await transaction(db, async () => {
      await db
        .prepare(
          "INSERT INTO wholesale_requests(id,wholesaler_id,vendor_id,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          id,
          wholesaler,
          vendor.id,
          "pending",
          text(req.body.notes, 500) || "",
          Date.now(),
          Date.now(),
        );
      for (const item of req.body.items) {
        const p = products.find((x) => x.id === item.productId);
        if (
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > p.stock
        )
          throw bad("Requested quantity exceeds available wholesale stock.");
        await db
          .prepare(
            "INSERT INTO wholesale_request_items(request_id,product_id,quantity,unit_price) VALUES(?,?,?,?)",
          )
          .run(id, p.id, item.quantity, p.price);
      }
    });
    res.json({
      ok: true,
      requests: await vendorRequests(db, vendor.id),
      returns: await vendorReturns(db, vendor.id),
      transactions: await vendorTransactions(db, vendor.id),
    });
  });
  app.post("/api/wholesale/requests/:id/status", async (req, res) => {
    seller(req.user);
    if (!["accepted", "completed", "cancelled"].includes(req.body.status))
      throw bad("Choose a valid request status.");
    await transaction(db, async () => {
      const row = await db
        .prepare(
          "SELECT * FROM wholesale_requests WHERE id=? AND wholesaler_id=? FOR UPDATE",
        )
        .get(req.params.id, req.wholesalerId);
      if (!row) throw bad("Request not found.", 404);
      if (row.status === "completed" || row.status === "cancelled")
        throw bad("This request is already closed.");
      if (req.body.status === "completed") {
        const items = await db
          .prepare("SELECT * FROM wholesale_request_items WHERE request_id=?")
          .all(row.id);
        for (const item of items) {
          const changed = await db
            .prepare(
              "UPDATE wholesale_products SET stock=stock-?,updated_at=? WHERE id=? AND wholesaler_id=? AND stock>=?",
            )
            .run(
              item.quantity,
              Date.now(),
              item.product_id,
              req.wholesalerId,
              item.quantity,
            );
          if (!changed.changes)
            throw bad("Insufficient wholesale stock to complete this request.");
        }
      }
      await db
        .prepare(
          "UPDATE wholesale_requests SET status=?,updated_at=? WHERE id=?",
        )
        .run(req.body.status, Date.now(), row.id);
    });
    res.json(await sellerData(db, req.wholesalerId));
  });
  app.post("/api/wholesale/returns", async (req, res) => {
    const vendor = await requireVendor(db, req.user, req.body.vendorId);
    const quantity = Number(req.body.quantity),
      unitPrice = Number(req.body.unitPrice),
      reason = text(req.body.reason, 300);
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      !money(unitPrice) ||
      !reason
    )
      throw bad("Enter a valid return quantity, unit price and reason.");
    await transaction(db, async () => {
      const line = await db
        .prepare(
          `SELECT r.id,r.wholesaler_id,r.status,i.product_id,i.quantity,i.unit_price FROM wholesale_requests r JOIN wholesale_request_items i ON i.request_id=r.id WHERE r.id=? AND r.vendor_id=? AND i.product_id=? FOR UPDATE`,
        )
        .get(req.body.requestId, vendor.id, req.body.productId);
      if (!line || !["delivered", "completed"].includes(line.status))
        throw bad("Only delivered wholesale orders can be returned.");
      if (unitPrice > Number(line.unit_price))
        throw bad("Return price cannot exceed the original wholesale price.");
      const used = await db
        .prepare(
          "SELECT COALESCE(SUM(quantity),0) AS quantity FROM wholesale_returns WHERE request_id=? AND product_id=? AND status<>'rejected'",
        )
        .get(line.id, line.product_id);
      if (quantity > Number(line.quantity) - Number(used.quantity))
        throw bad("Return quantity exceeds the remaining purchased quantity.");
      await db
        .prepare(
          "INSERT INTO wholesale_returns(id,wholesaler_id,vendor_id,request_id,product_id,quantity,unit_price,reason,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          line.wholesaler_id,
          vendor.id,
          line.id,
          line.product_id,
          quantity,
          unitPrice,
          reason,
          "pending",
          Date.now(),
          Date.now(),
        );
    });
    res.json({
      ok: true,
      requests: await vendorRequests(db, vendor.id),
      returns: await vendorReturns(db, vendor.id),
      transactions: await vendorTransactions(db, vendor.id),
    });
  });
  app.post("/api/wholesale/returns/:id/status", async (req, res) => {
    seller(req.user);
    if (!["approved", "received", "rejected"].includes(req.body.status))
      throw bad("Choose approved, received or rejected.");
    await transaction(db, async () => {
      const row = await db
        .prepare(
          "SELECT * FROM wholesale_returns WHERE id=? AND wholesaler_id=? FOR UPDATE",
        )
        .get(req.params.id, req.wholesalerId);
      if (!row) throw bad("Return not found.", 404);
      if (["received", "rejected"].includes(row.status))
        throw bad("This return is already closed.");
      if (row.status === "pending" && req.body.status === "received")
        throw bad("Approve the return before marking it received.");
      if (req.body.status === "received")
        await db
          .prepare(
            "UPDATE wholesale_products SET stock=stock+?,updated_at=? WHERE id=? AND wholesaler_id=?",
          )
          .run(row.quantity, Date.now(), row.product_id, req.wholesalerId);
      await db
        .prepare(
          "UPDATE wholesale_returns SET status=?,updated_at=? WHERE id=?",
        )
        .run(req.body.status, Date.now(), row.id);
    });
    res.json(await sellerData(db, req.wholesalerId));
  });
  app.post("/api/wholesale/transactions", async (req, res) => {
    seller(req.user);
    if (
      !money(Number(req.body.amount)) ||
      !["pending", "paid", "partial"].includes(req.body.paymentStatus)
    )
      throw bad("Enter a valid transaction amount and status.");
    const request = await db
      .prepare(
        "SELECT id FROM wholesale_requests WHERE id=? AND wholesaler_id=?",
      )
      .get(req.body.requestId, req.wholesalerId);
    if (!request) throw bad("Request not found.", 404);
    await db
      .prepare(
        "INSERT INTO wholesale_transactions(id,request_id,amount,payment_status,reference,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        request.id,
        Number(req.body.amount),
        req.body.paymentStatus,
        text(req.body.reference, 200) || "",
        Date.now(),
      );
    res.json(await sellerData(db, req.wholesalerId));
  });
  app.post("/api/wholesale/refunds", async (req, res) => {
    seller(req.user);
    if (
      !money(Number(req.body.amount)) ||
      !text(req.body.reason, 300) ||
      !["pending", "processed", "rejected"].includes(req.body.status)
    )
      throw bad("Enter valid refund details.");
    const t = await db
      .prepare(
        "SELECT t.* FROM wholesale_transactions t JOIN wholesale_requests r ON r.id=t.request_id WHERE t.id=? AND r.wholesaler_id=?",
      )
      .get(req.body.transactionId, req.wholesalerId);
    if (!t || Number(req.body.amount) > Number(t.amount))
      throw bad("Refund exceeds the transaction amount.");
    await db
      .prepare(
        "INSERT INTO wholesale_refunds(id,transaction_id,amount,reason,status,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        t.id,
        Number(req.body.amount),
        req.body.reason.trim(),
        req.body.status,
        Date.now(),
      );
    res.json(await sellerData(db, req.wholesalerId));
  });
}
