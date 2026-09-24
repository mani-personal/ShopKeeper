import { randomUUID } from "node:crypto";
import { transaction } from "./db.mjs";
import {
  requireVendor,
  requirePermission,
  isAdmin,
  wholesalePrincipal,
  requireEmployeePermission,
  employeePermissions,
} from "./security.mjs";
import { recordActivity } from "./activities.mjs";
import { roundMoney } from "./domain/store.mjs";
import { businessTypes } from "./domain/vendors.mjs";

const bad = (message, status = 400) =>
  Object.assign(Error(message), { status });
const clean = (value, max = 200) =>
  typeof value === "string" && value.trim() && value.length <= max
    ? value.trim()
    : "";
const amount = (value) =>
  Number.isFinite(Number(value)) &&
  Number(value) >= 0 &&
  Number(value) <= 10000000 &&
  Math.round(Number(value) * 100) === Number(value) * 100;
const whole = (value, min = 0, max = 10000000) =>
  Number.isInteger(Number(value)) &&
  Number(value) >= min &&
  Number(value) <= max;
const seller = (user) => {
  if (user.role !== "wholesale")
    throw bad("Wholesale seller access required.", 403);
};
const admin = (user) => {
  if (!isAdmin(user)) throw bad("Administrator access required.", 403);
  requirePermission(user, "wholesale");
};
const storeName = (row) => {
  try {
    return JSON.parse(row.vendor_data || row.data).settings.name;
  } catch {
    return "Vendor";
  }
};

async function orderRows(db, where, value) {
  const rows = await db
    .prepare(
      `SELECT r.*,w.business_name,w.logo_image,w.verified,w.payment_upi_id,w.payment_payee_name,w.gst_number,w.address AS seller_address,v.data AS vendor_data,COALESCE(SUM(i.quantity*i.unit_price),0) AS item_total FROM wholesale_requests r JOIN wholesalers w ON w.user_id=r.wholesaler_id JOIN vendors v ON v.id=r.vendor_id LEFT JOIN wholesale_request_items i ON i.request_id=r.id WHERE ${where}=? GROUP BY r.id,w.business_name,w.logo_image,w.verified,w.payment_upi_id,w.payment_payee_name,w.gst_number,w.address,v.data ORDER BY r.created_at DESC`,
    )
    .all(value);
  const items = await db
    .prepare(
      `SELECT i.*,p.name,p.sku,p.unit,p.category,p.mrp,p.min_qty FROM wholesale_request_items i JOIN wholesale_products p ON p.id=i.product_id JOIN wholesale_requests r ON r.id=i.request_id WHERE ${where.replace("r.", "r.")}=? ORDER BY p.name`,
    )
    .all(value);
  return rows.map((r) => ({
    ...r,
    vendorName: storeName(r),
    total: Number(r.item_total),
    items: items.filter((i) => i.request_id === r.id),
  }));
}

async function marketplaceCatalog(db, vendorId) {
  const products = await db
    .prepare(
      `SELECT p.*,w.business_name,w.business_category,w.logo_image,w.service_areas,w.brands,w.min_order,w.delivery_days,w.verified,w.visibility_mode,u.disabled,COALESCE(rv.rating,0) AS rating,COALESCE(rv.reviews,0) AS reviews,EXISTS(SELECT 1 FROM wholesale_vendor_favourites f WHERE f.vendor_id=? AND f.wholesaler_id=w.user_id) AS favourite FROM wholesale_products p JOIN wholesalers w ON w.user_id=p.wholesaler_id JOIN users u ON u.id=w.user_id JOIN vendors v ON v.id=? LEFT JOIN (SELECT wholesaler_id,ROUND(AVG(rating),1) AS rating,COUNT(*) AS reviews FROM wholesale_reviews GROUP BY wholesaler_id) rv ON rv.wholesaler_id=w.user_id WHERE p.active=TRUE AND p.stock>0 AND u.disabled=FALSE AND w.business_category=v.business_type AND (w.visibility_mode='public' OR EXISTS(SELECT 1 FROM wholesale_vendor_access a WHERE a.vendor_id=? AND a.wholesaler_id=w.user_id)) ORDER BY w.verified DESC,w.business_name,p.name`,
    )
    .all(vendorId, vendorId, vendorId);
  return {
    products,
    requests: await orderRows(db, "r.vendor_id", vendorId),
    returns: await db
      .prepare(
        `SELECT wr.*,p.name AS product_name,p.unit,w.business_name FROM wholesale_returns wr JOIN wholesale_products p ON p.id=wr.product_id JOIN wholesalers w ON w.user_id=wr.wholesaler_id WHERE wr.vendor_id=? ORDER BY wr.created_at DESC`,
      )
      .all(vendorId),
    transactions: await db
      .prepare(
        `SELECT t.*,r.wholesaler_id,w.business_name FROM wholesale_transactions t JOIN wholesale_requests r ON r.id=t.request_id JOIN wholesalers w ON w.user_id=r.wholesaler_id WHERE r.vendor_id=? ORDER BY t.created_at DESC`,
      )
      .all(vendorId),
    refunds: await db
      .prepare(
        `SELECT f.*,t.request_id,r.wholesaler_id,w.business_name FROM wholesale_refunds f JOIN wholesale_transactions t ON t.id=f.transaction_id JOIN wholesale_requests r ON r.id=t.request_id JOIN wholesalers w ON w.user_id=r.wholesaler_id WHERE r.vendor_id=? ORDER BY f.created_at DESC`,
      )
      .all(vendorId),
  };
}

async function paymentBalance(db, requestId) {
  const order = await db
    .prepare(
      "SELECT r.*,COALESCE(SUM(i.quantity*i.unit_price),0) AS order_total FROM wholesale_requests r LEFT JOIN wholesale_request_items i ON i.request_id=r.id WHERE r.id=? GROUP BY r.id",
    )
    .get(requestId);
  if (!order) return null;
  const paidRow = await db
      .prepare(
        "SELECT COALESCE(SUM(CASE WHEN t.payment_status IN ('paid','partial') THEN t.amount ELSE 0 END),0)-COALESCE((SELECT SUM(f.amount) FROM wholesale_refunds f JOIN wholesale_transactions rt ON rt.id=f.transaction_id WHERE rt.request_id=? AND f.status='processed'),0) AS paid FROM wholesale_transactions t WHERE t.request_id=?",
      )
      .get(order.id, order.id),
    creditRow = await db
      .prepare(
        "SELECT COALESCE(SUM(quantity*unit_price),0) AS credit FROM wholesale_returns WHERE request_id=? AND status='received'",
      )
      .get(order.id),
    total = Number(order.order_total),
    payable = roundMoney(Math.max(0, total - Number(creditRow.credit))),
    paid = Number(paidRow.paid);
  return {
    order,
    payable,
    paid,
    due: roundMoney(Math.max(0, payable - paid)),
  };
}

export function registerMarketplaceRoutes(app, db) {
  app.use("/api/marketplace", async (req, _res, next) => {
    if (req.user.role === "wholesale") {
      req.wholesalerId = await wholesalePrincipal(db, req.user);
      if (req.method !== "GET") {
        const path = req.originalUrl.split("?")[0],
          needed = path.includes("/products")
            ? "inventory"
            : path.includes("/profile") || path.includes("/payment-settings")
              ? "settings"
              : path.includes("/payment") || path.includes("/payments")
                ? "payments"
              : path.includes("/returns") || path.includes("/refund")
                ? "returns"
                : path.includes("/requests")
                    ? "purchases"
                    : null;
        if (needed) requireEmployeePermission(req.user, needed);
      }
    } else if (req.user.role === "vendor") {
      const path = req.originalUrl.split("?")[0];
      const needed = path === "/api/marketplace/catalog"
        ? null
        : path === "/api/marketplace/favourite" || path.endsWith("/repeat")
          ? "purchases"
          : path.endsWith("/receive")
            ? "inventory"
            : path.endsWith("/payment-submit")
              ? "payments"
              : path.includes("/requests")
                ? "purchases"
                : path.includes("/reviews")
                  ? "purchases"
                  : null;
      if (needed) requireEmployeePermission(req.user, needed);
    }
    next();
  });
  app.get("/api/marketplace/catalog", async (req, res) => {
    if (
      req.user.role === "vendor" &&
      !["purchases", "payments", "returns", "inventory"].some((section) =>
        employeePermissions(req.user).includes(section),
      )
    )
      requireEmployeePermission(req.user, "purchases");
    const vendor = await requireVendor(
      db,
      req.user,
      String(req.query.vendor || ""),
    );
    const catalog = await marketplaceCatalog(db, vendor.id);
    if (req.user.role === "vendor") {
      const access = employeePermissions(req.user);
      if (!access.includes("purchases")) catalog.products = [];
      if (!access.some((section) => ["purchases", "payments", "returns", "inventory"].includes(section)))
        catalog.requests = [];
      if (!access.includes("returns")) {
        catalog.returns = [];
        catalog.refunds = [];
      }
      if (!access.includes("payments")) catalog.transactions = [];
    }
    res.json(catalog);
  });
  app.post("/api/marketplace/favourite", async (req, res) => {
    const vendor = await requireVendor(db, req.user, req.body.vendorId),
      wholesaler = clean(req.body.wholesalerId, 100);
    if (
      !wholesaler ||
      !(await db
        .prepare("SELECT 1 FROM wholesalers WHERE user_id=?")
        .get(wholesaler))
    )
      throw bad("Wholesale seller not found.", 404);
    if (req.body.favourite === false)
      await db
        .prepare(
          "DELETE FROM wholesale_vendor_favourites WHERE vendor_id=? AND wholesaler_id=?",
        )
        .run(vendor.id, wholesaler);
    else
      await db
        .prepare(
          "INSERT INTO wholesale_vendor_favourites(vendor_id,wholesaler_id,created_at) VALUES(?,?,?) ON CONFLICT DO NOTHING",
        )
        .run(vendor.id, wholesaler, Date.now());
    res.json(await marketplaceCatalog(db, vendor.id));
  });
  app.post("/api/marketplace/profile", async (req, res) => {
    seller(req.user);
    const business = clean(req.body.businessName, 150),
      name = clean(req.body.name, 100),
      gst = clean(req.body.gstNumber, 30),
      areas = clean(req.body.serviceAreas, 300),
      brands = clean(req.body.brands, 500),
      mode = req.body.visibilityMode,
      businessCategory = clean(req.body.businessCategory, 80) ||
        (await db.prepare("SELECT business_category FROM wholesalers WHERE user_id=?").get(req.wholesalerId))?.business_category;
    if (
      !business ||
      !businessTypes.includes(businessCategory) ||
      !name ||
      !["selected", "public"].includes(mode) ||
      !amount(req.body.minOrder) ||
      !whole(req.body.deliveryDays, 0, 90)
    )
      throw bad("Enter valid marketplace profile details.");
    await transaction(db, async () => {
      await db
        .prepare(
          "UPDATE wholesalers SET business_name=?,phone=?,address=?,gst_number=?,service_areas=?,brands=?,min_order=?,delivery_days=?,visibility_mode=?,business_category=? WHERE user_id=?",
        )
        .run(
          business,
          clean(req.body.phone, 30),
          clean(req.body.address, 300),
          gst,
          areas,
          brands,
          Number(req.body.minOrder),
          Number(req.body.deliveryDays),
          mode,
          businessCategory,
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
      title: "Marketplace profile updated",
    });
    res.json({ ok: true });
  });
  app.post("/api/marketplace/payment-settings", async (req, res) => {
    seller(req.user);
    const upiId = clean(req.body.upiId, 128),
      payee = clean(req.body.payeeName, 100);
    if (!upiId || !/^[\w.-]{2,128}@[\w]{2,64}$/.test(upiId) || !payee)
      throw bad("Enter a valid UPI ID and payment name.");
    await db
      .prepare(
        "UPDATE wholesalers SET payment_upi_id=?,payment_payee_name=? WHERE user_id=?",
      )
      .run(upiId, payee, req.wholesalerId);
    await recordActivity(db, {
      actorId: req.user.id,
      wholesalerId: req.wholesalerId,
      scope: "wholesale",
      category: "settings",
      title: "Vendor payment UPI updated",
      route: "Settings",
    });
    res.json({ ok: true });
  });
  app.post("/api/marketplace/products", async (req, res) => {
    seller(req.user);
    const p = req.body,
      id = clean(p.id, 100) || randomUUID(),
      name = clean(p.name, 200),
      unit = clean(p.unit, 50),
      sku = typeof p.sku === "string" ? p.sku.trim().slice(0, 100) : "",
      category = clean(p.category, 80) || "General",
      subcategory = typeof p.subcategory === "string" ? p.subcategory.trim() : "",
      description =
        typeof p.description === "string"
          ? p.description.trim().slice(0, 500)
          : "",
      hsnCode = typeof p.hsnCode === "string" ? p.hsnCode.trim().slice(0, 20) : "",
      gstRate = Number(p.gstRate ?? 0);
    if (
      !name ||
      subcategory.length > 100 ||
      !unit ||
      !amount(p.price) ||
      Number(p.price) <= 0 ||
      !whole(p.stock) ||
      !whole(p.minQty, 1, 1000000) ||
      (p.mrp !== "" &&
        p.mrp != null &&
        (!amount(p.mrp) || Number(p.mrp) < Number(p.price))) ||
      (p.bulkQty !== "" &&
        p.bulkQty != null &&
        !whole(p.bulkQty, 1, 1000000)) ||
      (p.bulkPrice !== "" &&
        p.bulkPrice != null &&
        (!amount(p.bulkPrice) ||
          Number(p.bulkPrice) <= 0 ||
          Number(p.bulkPrice) >= Number(p.price))) ||
      ![0, 5, 12, 18, 28].includes(gstRate)
    )
      throw bad("Check product, MRP, MOQ, bulk price and stock.");
    if (sku && await db.prepare("SELECT id FROM wholesale_products WHERE wholesaler_id=? AND sku=? AND id<>?").get(req.wholesalerId, sku, id))
      throw bad("This barcode already belongs to another wholesale pack size. Use a unique item code for each product.");
    await db
      .prepare(
        `INSERT INTO wholesale_products(id,wholesaler_id,name,sku,unit,price,stock,active,created_at,updated_at,category,description,mrp,min_qty,bulk_qty,bulk_price,hsn_code,gst_rate,subcategory) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,sku=EXCLUDED.sku,unit=EXCLUDED.unit,price=EXCLUDED.price,stock=EXCLUDED.stock,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at,category=EXCLUDED.category,description=EXCLUDED.description,mrp=EXCLUDED.mrp,min_qty=EXCLUDED.min_qty,bulk_qty=EXCLUDED.bulk_qty,bulk_price=EXCLUDED.bulk_price,hsn_code=EXCLUDED.hsn_code,gst_rate=EXCLUDED.gst_rate,subcategory=EXCLUDED.subcategory WHERE wholesale_products.wholesaler_id=EXCLUDED.wholesaler_id`,
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
        category,
        description,
        p.mrp === "" || p.mrp == null ? null : Number(p.mrp),
        Number(p.minQty),
        p.bulkQty === "" || p.bulkQty == null ? null : Number(p.bulkQty),
        p.bulkPrice === "" || p.bulkPrice == null ? null : Number(p.bulkPrice),
        hsnCode,
        gstRate,
        subcategory,
      );
    await recordActivity(db, {
      actorId: req.user.id,
      wholesalerId: req.wholesalerId,
      scope: "wholesale",
      category: "inventory",
      title: "Wholesale catalogue product saved",
      detail: name,
    });
    res.json({ ok: true });
  });
  app.post("/api/marketplace/requests", async (req, res) => {
    const vendor = await requireVendor(db, req.user, req.body.vendorId);
    if (
      !Array.isArray(req.body.items) ||
      !req.body.items.length ||
      req.body.items.length > 100
    )
      throw bad("Choose products for this order.");
    const ids = req.body.items.map((x) => x.productId),
      products = await db
        .prepare(
          "SELECT p.*,w.min_order,w.visibility_mode,w.delivery_days,w.business_category FROM wholesale_products p JOIN wholesalers w ON w.user_id=p.wholesaler_id WHERE p.id=ANY(?) AND p.active=TRUE",
        )
        .all(ids);
    if (products.length !== new Set(ids).size)
      throw bad("One or more products are unavailable.");
    const wholesaler = products[0].wholesaler_id;
    if (products[0].business_category !== vendor.business_type)
      throw bad("This wholesaler serves a different store category.", 403);
    if (products.some((x) => x.wholesaler_id !== wholesaler))
      throw bad("Create a separate order for each wholesaler.");
    const allowed =
      products[0].visibility_mode === "public" ||
      (await db
        .prepare(
          "SELECT 1 FROM wholesale_vendor_access WHERE wholesaler_id=? AND vendor_id=?",
        )
        .get(wholesaler, vendor.id));
    if (!allowed)
      throw bad("This catalogue is not shared with your store.", 403);
    let total = 0;
    for (const item of req.body.items) {
      const p = products.find((x) => x.id === item.productId),
        quantity = Number(item.quantity);
      if (!whole(quantity, Number(p.min_qty), Number(p.stock)))
        throw bad(
          `${p.name} requires at least ${p.min_qty} and has ${p.stock} available.`,
        );
      total +=
        quantity >= Number(p.bulk_qty || Infinity) && p.bulk_price != null
          ? quantity * Number(p.bulk_price)
          : quantity * Number(p.price);
    }
    if (total < Number(products[0].min_order))
      throw bad("Order does not meet the wholesaler minimum.");
    const id = randomUUID(),
      now = Date.now(),
      expected = now + Number(products[0].delivery_days || 0) * 86400000;
    await transaction(db, async () => {
      await db
        .prepare(
          "INSERT INTO wholesale_requests(id,wholesaler_id,vendor_id,status,notes,created_at,updated_at,quoted_total,expected_delivery,accepted_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          wholesaler,
          vendor.id,
          "pending",
          clean(req.body.notes, 500),
          now,
          now,
          roundMoney(total),
          expected,
          null,
        );
      for (const item of req.body.items) {
        const p = products.find((x) => x.id === item.productId),
          quantity = Number(item.quantity),
          unitPrice =
            quantity >= Number(p.bulk_qty || Infinity) && p.bulk_price != null
              ? Number(p.bulk_price)
              : Number(p.price);
        await db
          .prepare(
            "INSERT INTO wholesale_request_items(request_id,product_id,quantity,unit_price,hsn_code,gst_rate) VALUES(?,?,?,?,?,?)",
          )
          .run(id, p.id, quantity, unitPrice, p.hsn_code || "", Number(p.gst_rate || 0));
      }
    });
    await recordActivity(db, {
      actorId: req.user.id,
      vendorId: vendor.id,
      wholesalerId: wholesaler,
      scope: "all",
      category: "order",
      title: "New wholesale order received",
      detail: `Order total ₹${roundMoney(total).toFixed(2)}`,
      route: "Requests",
    });
    res.json(await marketplaceCatalog(db, vendor.id));
  });
  app.post("/api/marketplace/requests/:id/quote", async (req, res) => {
    seller(req.user);
    if (!whole(req.body.deliveryDays, 0, 90))
      throw bad("Enter a valid delivery timeline.");
    const row = await db
      .prepare(
        "SELECT r.*,COALESCE(SUM(i.quantity*i.unit_price),0) AS item_total FROM wholesale_requests r LEFT JOIN wholesale_request_items i ON i.request_id=r.id WHERE r.id=? AND r.wholesaler_id=? GROUP BY r.id",
      )
      .get(req.params.id, req.wholesalerId);
    if (!row || !["pending", "quoted"].includes(row.status))
      throw bad("This order cannot be quoted.", 409);
    const total = roundMoney(Number(row.item_total)),
      expected = Date.now() + Number(req.body.deliveryDays) * 86400000;
    await db
      .prepare(
        "UPDATE wholesale_requests SET status='quoted',delivery_fee=?,quoted_total=?,quote_notes=?,expected_delivery=?,updated_at=? WHERE id=?",
      )
      .run(0, total, clean(req.body.notes, 500), expected, Date.now(), row.id);
    await recordActivity(db, {
      actorId: req.user.id,
      vendorId: row.vendor_id,
      wholesalerId: req.wholesalerId,
      scope: "all",
      category: "quote",
      title: "Wholesale quotation received",
      detail: `Quoted total ₹${total.toFixed(2)}`,
    });
    res.json({ ok: true });
  });
  app.post("/api/marketplace/requests/:id/accept", async (req, res) => {
    const row = await db
        .prepare("SELECT * FROM wholesale_requests WHERE id=? AND vendor_id=?")
        .get(req.params.id, req.body.vendorId),
      vendor = await requireVendor(db, req.user, req.body.vendorId);
    if (!row || row.status !== "quoted")
      throw bad("Quotation is no longer available.", 409);
    await db
      .prepare(
        "UPDATE wholesale_requests SET status='approved',accepted_at=?,updated_at=? WHERE id=?",
      )
      .run(Date.now(), Date.now(), row.id);
    await recordActivity(db, {
      actorId: req.user.id,
      vendorId: vendor.id,
      wholesalerId: row.wholesaler_id,
      scope: "all",
      category: "order",
      title: "Wholesale quotation accepted",
    });
    res.json(await marketplaceCatalog(db, vendor.id));
  });
  app.post("/api/marketplace/requests/:id/status", async (req, res) => {
    seller(req.user);
    const next = req.body.status,
      flow = {
        pending: "approved",
        quoted: "approved",
        approved: "packed",
        packed: "dispatched",
        dispatched: "delivered",
        delivered: "completed",
      };
    const row = await db
      .prepare(
        "SELECT * FROM wholesale_requests WHERE id=? AND wholesaler_id=?",
      )
      .get(req.params.id, req.wholesalerId);
    if (!row || flow[row.status] !== next)
      throw bad("Follow the order stages in sequence.", 409);
    await transaction(db, async () => {
      if (next === "completed") {
        const lines = await db
          .prepare("SELECT * FROM wholesale_request_items WHERE request_id=?")
          .all(row.id);
        for (const line of lines) {
          const result = await db
            .prepare(
              "UPDATE wholesale_products SET stock=stock-?,updated_at=? WHERE id=? AND wholesaler_id=? AND stock>=?",
            )
            .run(
              line.quantity,
              Date.now(),
              line.product_id,
              req.wholesalerId,
              line.quantity,
            );
          if (!result.changes)
            throw bad("Insufficient stock to complete this order.", 409);
        }
      }
      await db
        .prepare(
          "UPDATE wholesale_requests SET status=?,updated_at=?,accepted_at=CASE WHEN ?='approved' THEN ? ELSE accepted_at END WHERE id=?",
        )
        .run(next, Date.now(), next, Date.now(), row.id);
    });
    await recordActivity(db, {
      actorId: req.user.id,
      vendorId: row.vendor_id,
      wholesalerId: req.wholesalerId,
      scope: "all",
      category: "order",
      title: `Wholesale order ${next}`,
      detail:
        next === "approved"
          ? "Your order was confirmed by the wholesaler."
          : `Order status changed to ${next}.`,
      route: "Orders",
    });
    res.json({ ok: true });
  });
  app.post("/api/marketplace/requests/:id/payment", async (req, res) => {
    seller(req.user);
    const status = req.body.paymentStatus,
      entered = Number(req.body.amount);
    if (
      !["pending", "partial", "paid"].includes(status) ||
      (status !== "pending" && (!amount(entered) || entered <= 0)) ||
      (status === "pending" && entered !== 0)
    )
      throw bad(
        "Choose Pending, Partial or Paid and enter the amount received.",
      );
    const order = await db
      .prepare(
        "SELECT r.*,COALESCE(SUM(i.quantity*i.unit_price),0) AS order_total FROM wholesale_requests r LEFT JOIN wholesale_request_items i ON i.request_id=r.id WHERE r.id=? AND r.wholesaler_id=? GROUP BY r.id",
      )
      .get(req.params.id, req.wholesalerId);
    if (
      !order ||
      !["packed", "dispatched", "delivered", "completed"].includes(order.status)
    )
      throw bad("Record payment after the order is packed.", 409);
    const paidRow = await db
        .prepare(
          "SELECT COALESCE(SUM(CASE WHEN t.payment_status IN ('paid','partial') THEN t.amount ELSE 0 END),0)-COALESCE((SELECT SUM(f.amount) FROM wholesale_refunds f JOIN wholesale_transactions rt ON rt.id=f.transaction_id WHERE rt.request_id=? AND f.status='processed'),0) AS paid FROM wholesale_transactions t WHERE t.request_id=?",
        )
        .get(order.id, order.id),
      creditRow = await db
        .prepare(
          "SELECT COALESCE(SUM(quantity*unit_price),0) AS credit FROM wholesale_returns WHERE request_id=? AND status='received'",
        )
        .get(order.id),
      total = Number(order.order_total),
      payable = roundMoney(Math.max(0, total - Number(creditRow.credit))),
      paid = Number(paidRow.paid),
      due = roundMoney(Math.max(0, payable - paid));
    if (due <= 0)
      throw bad("This order is already fully paid after return credits.", 409);
    if (status === "paid" && Math.abs(entered - due) > 0.009)
      throw bad(`Paid amount must equal the remaining ₹${due.toFixed(2)}.`);
    if (status === "partial" && (entered >= due || entered <= 0))
      throw bad(
        `Partial amount must be less than the remaining ₹${due.toFixed(2)}.`,
      );
    await db
      .prepare(
        "INSERT INTO wholesale_transactions(id,request_id,amount,payment_status,reference,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        order.id,
        status === "pending" ? 0 : entered,
        status,
        clean(req.body.reference, 200),
        Date.now(),
      );
    await recordActivity(db, {
      actorId: req.user.id,
      vendorId: order.vendor_id,
      wholesalerId: req.wholesalerId,
      scope: "all",
      category: "payment",
      title:
        status === "paid"
          ? "Wholesale order fully paid"
          : status === "partial"
            ? "Partial wholesale payment received"
            : "Wholesale payment marked pending",
      detail:
        status === "pending"
          ? `Pending ₹${due.toFixed(2)}`
          : `Received ₹${entered.toFixed(2)}`,
      route: "Payments",
    });
    res.json({ ok: true });
  });
  app.post("/api/marketplace/requests/:id/payment-submit", async (req, res) => {
    const vendor = await requireVendor(db, req.user, req.body.vendorId),
      reference = clean(req.body.reference, 200),
      entered = Number(req.body.amount),
      balance = await paymentBalance(db, req.params.id);
    if (
      !balance ||
      balance.order.vendor_id !== vendor.id ||
      !["delivered", "completed"].includes(balance.order.status) ||
      !balance.order.inventory_received
    )
      throw bad("Receive the delivered order before paying it.", 409);
    const sellerProfile = await db
      .prepare(
        "SELECT business_name,payment_upi_id FROM wholesalers WHERE user_id=?",
      )
      .get(balance.order.wholesaler_id);
    if (!sellerProfile?.payment_upi_id)
      throw bad("This wholesaler has not configured a UPI ID yet.", 409);
    if (!amount(entered) || entered <= 0 || entered > balance.due)
      throw bad(`Enter an amount up to ₹${balance.due.toFixed(2)}.`);
    if (reference.length < 4)
      throw bad("Enter the UPI transaction reference after payment.");
    const existing = await db
      .prepare(
        "SELECT 1 FROM wholesale_transactions WHERE request_id=? AND payment_status='pending' AND submitted_by_vendor=TRUE",
      )
      .get(balance.order.id);
    if (existing)
      throw bad("A vendor payment is already waiting for confirmation.", 409);
    await db
      .prepare(
        "INSERT INTO wholesale_transactions(id,request_id,amount,payment_status,reference,created_at,submitted_by_vendor) VALUES(?,?,?,?,?,?,TRUE)",
      )
      .run(
        randomUUID(),
        balance.order.id,
        entered,
        "pending",
        reference,
        Date.now(),
      );
    await recordActivity(db, {
      actorId: req.user.id,
      vendorId: vendor.id,
      wholesalerId: balance.order.wholesaler_id,
      scope: "all",
      category: "payment",
      title: "UPI payment submitted for confirmation",
      detail: `₹${entered.toFixed(2)} · ${reference}`,
      route: "Payments",
    });
    res.json(await marketplaceCatalog(db, vendor.id));
  });
  app.post("/api/marketplace/payments/:id/confirm", async (req, res) => {
    seller(req.user);
    const payment = await db
      .prepare(
        "SELECT t.*,r.vendor_id,r.wholesaler_id FROM wholesale_transactions t JOIN wholesale_requests r ON r.id=t.request_id WHERE t.id=? AND r.wholesaler_id=?",
      )
      .get(req.params.id, req.wholesalerId);
    if (
      !payment ||
      payment.payment_status !== "pending" ||
      !payment.submitted_by_vendor
    )
      throw bad("Pending vendor payment not found.", 404);
    const balance = await paymentBalance(db, payment.request_id);
    if (!balance || Number(payment.amount) > balance.due)
      throw bad("The pending amount is greater than the current balance.", 409);
    const status =
      Math.abs(Number(payment.amount) - balance.due) < 0.009
        ? "paid"
        : "partial";
    await db
      .prepare(
        "UPDATE wholesale_transactions SET payment_status=?,confirmed_at=? WHERE id=?",
      )
      .run(status, Date.now(), payment.id);
    await recordActivity(db, {
      actorId: req.user.id,
      vendorId: payment.vendor_id,
      wholesalerId: req.wholesalerId,
      scope: "all",
      category: "payment",
      title: "UPI payment confirmed",
      detail: `₹${Number(payment.amount).toFixed(2)} payment accepted.`,
      route: "Payments",
    });
    res.json({ ok: true });
  });
  app.post("/api/marketplace/payments/:id/reject", async (req, res) => {
    seller(req.user);
    const reason = clean(req.body.reason, 200) || "Payment not found";
    const payment = await db
      .prepare(
        "SELECT t.*,r.vendor_id FROM wholesale_transactions t JOIN wholesale_requests r ON r.id=t.request_id WHERE t.id=? AND r.wholesaler_id=? AND t.payment_status='pending' AND t.submitted_by_vendor=TRUE",
      )
      .get(req.params.id, req.wholesalerId);
    if (!payment) throw bad("Pending vendor payment not found.", 404);
    await db
      .prepare(
        "UPDATE wholesale_transactions SET payment_status='rejected',rejected_at=?,rejection_reason=? WHERE id=?",
      )
      .run(Date.now(), reason, payment.id);
    await recordActivity(db, {
      actorId: req.user.id,
      vendorId: payment.vendor_id,
      wholesalerId: req.wholesalerId,
      scope: "all",
      category: "payment",
      title: "UPI payment needs attention",
      detail: reason,
      route: "Payments",
    });
    res.json({ ok: true });
  });
  app.post("/api/marketplace/requests/:id/repeat", async (req, res) => {
    const vendor = await requireVendor(db, req.user, req.body.vendorId),
      source = await db
        .prepare("SELECT * FROM wholesale_requests WHERE id=? AND vendor_id=?")
        .get(req.params.id, vendor.id);
    if (!source || !["delivered", "completed"].includes(source.status))
      throw bad("Only delivered orders can be repeated.");
    const category = await db.prepare("SELECT business_category FROM wholesalers WHERE user_id=?")
      .get(source.wholesaler_id);
    if (vendor.business_type !== category?.business_category)
      throw bad("This wholesaler serves a different store category.", 403);
    const lines = await db
      .prepare(
        "SELECT i.*,p.price,p.stock,p.active,p.min_qty FROM wholesale_request_items i JOIN wholesale_products p ON p.id=i.product_id WHERE i.request_id=?",
      )
      .all(source.id);
    if (!lines.length || lines.some((x) => !x.active || x.stock < x.quantity))
      throw bad("One or more products are currently unavailable.");
    const id = randomUUID();
    await transaction(db, async () => {
      await db
        .prepare(
          "INSERT INTO wholesale_requests(id,wholesaler_id,vendor_id,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          id,
          source.wholesaler_id,
          vendor.id,
          "pending",
          "Repeat of " + source.id.slice(0, 8),
          Date.now(),
          Date.now(),
        );
      for (const x of lines)
        await db
          .prepare(
            "INSERT INTO wholesale_request_items(request_id,product_id,quantity,unit_price,hsn_code,gst_rate) VALUES(?,?,?,?,?,?)",
          )
          .run(id, x.product_id, x.quantity, x.price, x.hsn_code || "", Number(x.gst_rate || 0));
    });
    res.json(await marketplaceCatalog(db, vendor.id));
  });
  app.post("/api/marketplace/requests/:id/receive", async (req, res) => {
    const vendor = await requireVendor(db, req.user, req.body.vendorId),
      sellingPrices =
        req.body.sellingPrices &&
        typeof req.body.sellingPrices === "object" &&
        !Array.isArray(req.body.sellingPrices)
          ? req.body.sellingPrices
          : {};
    await transaction(db, async () => {
      const order = await db
        .prepare(
          "SELECT r.*,w.business_name FROM wholesale_requests r JOIN wholesalers w ON w.user_id=r.wholesaler_id WHERE r.id=? AND r.vendor_id=? FOR UPDATE",
        )
        .get(req.params.id, vendor.id);
      if (
        !order ||
        !["delivered", "completed"].includes(order.status) ||
        order.inventory_received
      )
        throw bad("This order cannot be received into inventory.", 409);
      const lines = await db
          .prepare(
            "SELECT i.*,p.name,p.sku,p.unit,p.category,p.mrp FROM wholesale_request_items i JOIN wholesale_products p ON p.id=i.product_id WHERE i.request_id=?",
          )
          .all(order.id),
        state = JSON.parse(vendor.data);
      for (const line of lines) {
        const entered = sellingPrices[line.product_id],
          selling =
            entered == null || entered === ""
              ? Number(line.mrp) || roundMoney(Number(line.unit_price) * 1.15)
              : Number(entered);
        if (
          !amount(selling) ||
          selling < Number(line.unit_price) ||
          (line.mrp && selling > Number(line.mrp))
        )
          throw bad(
            `${line.name}: selling price must be at least cost${line.mrp ? " and not above MRP" : ""}.`,
          );
        let product = line.sku
          ? state.products.find((p) => p.barcode === line.sku)
          : state.products.find(
              (p) => p.name.toLowerCase() === line.name.toLowerCase(),
            );
        if (product) {
          product.stock += line.quantity;
          product.cost = Number(line.unit_price);
          product.price = selling;
        } else {
          product = {
            id: randomUUID(),
            name: line.name,
            barcode: line.sku || "",
            category: line.category || "Wholesale",
            unit: line.unit,
            price: selling,
            cost: Number(line.unit_price),
            stock: line.quantity,
            min: 5,
            target: Math.max(20, line.quantity),
            discountMode: "auto",
            discountBasis: "cost",
            customDiscount: 0,
          };
          state.products.push(product);
        }
        state.purchases.unshift({
          id: order.id + "-" + line.product_id,
          date: new Date().toISOString(),
          product: product.name,
          productId: product.id,
          qty: line.quantity,
          total: roundMoney(Number(line.unit_price) * line.quantity),
          paidAmount: 0,
          supplier: order.business_name,
        });
      }
      await db
        .prepare("UPDATE vendors SET data=?,version=version+1 WHERE id=?")
        .run(JSON.stringify(state), vendor.id);
      await db
        .prepare(
          "UPDATE wholesale_requests SET inventory_received=TRUE,updated_at=? WHERE id=?",
        )
        .run(Date.now(), order.id);
    });
    await recordActivity(db, {
      actorId: req.user.id,
      vendorId: vendor.id,
      scope: "vendor",
      category: "inventory",
      title: "Wholesale order added to inventory with vendor margin prices",
    });
    res.json(await marketplaceCatalog(db, vendor.id));
  });
  app.post("/api/marketplace/reviews", async (req, res) => {
    const vendor = await requireVendor(db, req.user, req.body.vendorId),
      rating = Number(req.body.rating),
      order = await db
        .prepare(
          "SELECT * FROM wholesale_requests WHERE id=? AND vendor_id=? AND status IN ('delivered','completed')",
        )
        .get(req.body.requestId, vendor.id);
    if (!order || !whole(rating, 1, 5))
      throw bad("Choose a delivered order and rating from 1 to 5.");
    await db
      .prepare(
        "INSERT INTO wholesale_reviews(id,request_id,vendor_id,wholesaler_id,rating,comment,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(request_id) DO UPDATE SET rating=EXCLUDED.rating,comment=EXCLUDED.comment",
      )
      .run(
        randomUUID(),
        order.id,
        vendor.id,
        order.wholesaler_id,
        rating,
        clean(req.body.comment, 300),
        Date.now(),
      );
    res.json(await marketplaceCatalog(db, vendor.id));
  });
  app.get("/api/marketplace/admin", async (req, res) => {
    admin(req.user);
    const summary = await db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM wholesalers) AS wholesalers,(SELECT COUNT(*) FROM wholesalers WHERE verified=TRUE) AS verified,(SELECT COUNT(*) FROM wholesale_requests) AS orders,(SELECT COUNT(*) FROM wholesale_requests WHERE status IN ('pending','quoted')) AS action_needed,(SELECT COALESCE(SUM(i.quantity*i.unit_price),0) FROM wholesale_request_items i JOIN wholesale_requests r ON r.id=i.request_id WHERE r.status IN ('delivered','completed')) AS order_value,(SELECT COUNT(*) FROM wholesale_vendor_favourites) AS favourites`,
      )
      .get();
    const sellers = await db
      .prepare(
        `SELECT w.user_id,w.business_name,w.verified,w.visibility_mode,w.service_areas,w.brands,u.disabled,COUNT(DISTINCT p.id) AS products,COUNT(DISTINCT r.id) AS orders,COALESCE(AVG(rv.rating),0) AS rating FROM wholesalers w JOIN users u ON u.id=w.user_id LEFT JOIN wholesale_products p ON p.wholesaler_id=w.user_id LEFT JOIN wholesale_requests r ON r.wholesaler_id=w.user_id LEFT JOIN wholesale_reviews rv ON rv.wholesaler_id=w.user_id GROUP BY w.user_id,w.business_name,w.verified,w.visibility_mode,w.service_areas,w.brands,u.disabled ORDER BY w.verified DESC,w.business_name`,
      )
      .all();
    res.json({ summary, sellers });
  });
  app.post("/api/marketplace/admin/verify", async (req, res) => {
    admin(req.user);
    const verified = req.body.verified === true,
      result = await db
        .prepare("UPDATE wholesalers SET verified=? WHERE user_id=?")
        .run(verified, req.body.wholesalerId);
    if (!result.changes) throw bad("Wholesale seller not found.", 404);
    await recordActivity(db, {
      actorId: req.user.id,
      wholesalerId: req.body.wholesalerId,
      scope: "wholesale",
      category: "verification",
      title: verified
        ? "Wholesale profile verified"
        : "Wholesale verification removed",
    });
    res.json({ ok: true });
  });
}
