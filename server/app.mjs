import { registerAdminRoutes } from "./admins.mjs";
import { registerAssetRoutes } from "./assets.mjs";
import { registerWholesaleRoutes } from "./wholesale.mjs";
import { registerActivityRoutes, recordActivity } from "./activities.mjs";
import { registerWholesaleSubscriptionRoutes } from "./wholesale-subscriptions.mjs";
import { wholesalePricing } from "./wholesale-subscriptions.mjs";
import { registerMarketplaceRoutes } from "./marketplace.mjs";
import { registerEmployeeRoutes } from "./employees.mjs";
import { registerBusinessRoutes } from "./businesses.mjs";
import { registerAdminSubscriptionRoutes } from "./admin-subscriptions.mjs";
import { sendResetEmail } from "./reset-email.mjs";
import {
  pricing,
  validity,
  subscriptionInfo,
  subscriptionAction,
  savePricing,
  registerSubscriptionRoutes,
} from "./subscriptions.mjs";
import express from "express";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { transaction } from "./db.mjs";
import {
  email,
  hashPassword,
  verifyPassword,
  readSession,
  startSession,
  clearSession,
  limit,
  digest,
  token,
  allowedVendors,
  requireVendor,
  requireOwner,
  requirePermission,
  hasPermission,
  permissions,
  employeePermissions,
  requireEmployeePermission,
  requireActiveAccount,
  suspensionError,
  isAdmin,
} from "./security.mjs";
import { initial, mutate, isLow } from "./domain/store.mjs";
import { businessTypes } from "./domain/vendors.mjs";
const bad = (message, status = 400) =>
  Object.assign(Error(message), { status });
export function createApp(
  db,
  {
    appOrigin = "http://localhost:3000",
    secure = false,
    trustProxy = false,
    frontend = "dist",
    resetMailer = sendResetEmail,
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  if (trustProxy) app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
      "Permissions-Policy": "camera=(self), microphone=()",
    });
    if (secure) res.set("Strict-Transport-Security", "max-age=31536000");
    if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.get("origin") !== appOrigin)
        return res
          .status(403)
          .json({ error: "Request origin is not allowed." });
      if (!req.is("application/json"))
        return res.status(415).json({ error: "Send application/json." });
    }
    next();
  });
  app.use(express.json({ limit: "3mb" }));
  app.get("/api/health", async (_req, res) => {
    await db.prepare("SELECT 1").get();
    res.json({ status: "ok" });
  });
  app.get("/api/pricing", async (_req, res) => res.json(await pricing(db)));
  app.get("/api/wholesale/pricing", async (_req, res) =>
    res.json(await wholesalePricing(db)),
  );
  app.post("/api/auth/login", async (req, res) => {
    const mail = email(req.body.email);
    await limit(db, "login-ip:" + digest(req.ip || ""), 30);
    await limit(db, "login-email:" + digest(mail), 10);
    const user = await db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(mail);
    const dummy = "scrypt:00000000000000000000000000000000:" + "00".repeat(64);
    const valid = await verifyPassword(
      req.body.password,
      user?.password_hash ?? dummy,
    );
    if (!user || !valid || user.disabled)
      throw bad("Email or password is incorrect.", 401);
    if (req.body.portal === "super-admin" && user.role !== "owner")
      throw bad("Super admin access required.", 403);
    if (req.body.portal === "admin" && !isAdmin(user))
      throw bad("Use a vendor sign-in for this account.", 403);
    if (req.body.portal === "wholesale" && user.role !== "wholesale")
      throw bad("Wholesale seller access required.", 403);
    if (!req.body.portal && user.role === "wholesale")
      throw bad("Use the wholesale seller sign-in.", 403);
    await requireActiveAccount(db, user);
    res.json(await startSession(db, res, user, secure));
  });
  app.post("/api/auth/activate", async (req, res) => {
    await limit(db, "activation:" + digest(req.ip || ""), 20);
    const mail = email(req.body.email);
    if (typeof req.body.token !== "string" || req.body.token.length > 200)
      throw bad("Invalid activation token.");
    const key = digest(req.body.token.trim());
    const invite = await db
      .prepare(
        "SELECT * FROM tokens WHERE hash=? AND kind='invite' AND email=? AND expires>?",
      )
      .get(key, mail, Date.now());
    if (!invite) throw bad("Activation code is invalid or expired.", 400);
    const existing = await db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(mail);
    if (existing)
      throw bad(
        "This account already exists. Sign in, then redeem the code under Account.",
        409,
      );
    const hash = await hashPassword(req.body.password);
    const id = randomUUID();
    await transaction(db, async () => {
      const store = await db
        .prepare("SELECT suspended FROM vendors WHERE id=? FOR UPDATE")
        .get(invite.vendor_id);
      if (store?.suspended) throw suspensionError();
      const current = await db
        .prepare("SELECT * FROM tokens WHERE hash=? AND expires>? FOR UPDATE")
        .get(key, Date.now());
      if (!current) throw bad("Activation code was already used.");
      await db
        .prepare(
          "INSERT INTO users(id,email,password_hash,role,name,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(id, mail, hash, "vendor", mail.split("@")[0], Date.now());
      await db
        .prepare("INSERT INTO memberships VALUES(?,?)")
        .run(id, current.vendor_id);
      await db.prepare("DELETE FROM tokens WHERE hash=?").run(key);
    });
    res.json(
      await startSession(
        db,
        res,
        { id, email: mail, role: "vendor", name: mail.split("@")[0] },
        secure,
      ),
    );
  });
  app.post("/api/auth/reset", async (req, res) => {
    await limit(db, "reset:" + digest(req.ip || ""), 20);
    const mail = email(req.body.email);
    if (typeof req.body.token !== "string" || req.body.token.length > 200)
      throw bad("Invalid reset token.");
    const key = digest(req.body.token.trim());
    const record = await db
      .prepare(
        "SELECT * FROM tokens WHERE hash=? AND kind='reset' AND email=? AND expires>?",
      )
      .get(key, mail, Date.now());
    if (!record) throw bad("Reset code is invalid or expired.");
    const hash = await hashPassword(req.body.password);
    await transaction(db, async () => {
      if (
        !(await db
          .prepare("SELECT 1 FROM tokens WHERE hash=? AND expires>? FOR UPDATE")
          .get(key, Date.now()))
      )
        throw bad("Reset code was already used.");
      await db
        .prepare("UPDATE users SET password_hash=? WHERE email=?")
        .run(hash, mail);
      await db
        .prepare(
          "DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE email=?)",
        )
        .run(mail);
      await db
        .prepare("DELETE FROM tokens WHERE email=? AND kind='reset'")
        .run(mail);
    });
    res.json({ ok: true });
  });
  app.post("/api/auth/forgot", async (req, res) => {
    const mail = email(req.body.email);
    await limit(db, "forgot-ip:" + digest(req.ip || ""), 12);
    await limit(db, "forgot-email:" + digest(mail), 3, 3600000);
    if (resetMailer === sendResetEmail && (!process.env.RESEND_API_KEY || !process.env.RESET_FROM_EMAIL))
      throw bad("Password recovery email is unavailable. Contact support.",503);
    const user = await db.prepare("SELECT id,role,disabled FROM users WHERE email=?").get(mail);
    if (user && !user.disabled) {
      const code = token(), path = user.role === "wholesale" ? "/wholesale/login" : ["admin","owner"].includes(user.role) ? "/admin/login" : "/";
      const link = appOrigin + path + "?email=" + encodeURIComponent(mail) + "#reset=" + encodeURIComponent(code);
      await transaction(db, async () => {
        await db.prepare("DELETE FROM tokens WHERE email=? AND kind='reset'").run(mail);
        await db.prepare("INSERT INTO tokens VALUES(?,?,?,?,?)").run(digest(code),mail,null,"reset",Date.now()+30*60000);
      });
      try { await resetMailer({ to: mail, link }); }
      catch (error) {
        await db.prepare("DELETE FROM tokens WHERE hash=?").run(digest(code));
        console.error("Password recovery delivery failed:", error instanceof Error ? error.message : "Unknown error");
      }
    }
    res.json({ ok:true, message:"If this email has an account, a reset link has been sent." });
  });
  app.use("/api", async (req, res, next) => {
    const user = await readSession(db, req);
    if (!user) return res.status(401).json({ error: "Sign in to continue." });
    req.user = user;
    if (req.path !== "/auth/logout") await requireActiveAccount(db, user);
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("x-csrf-token") !== user.csrf
    )
      return res
        .status(403)
        .json({ error: "Session verification failed. Refresh and try again." });
    next();
  });
  registerAdminRoutes(app, db);
  registerAssetRoutes(app, db);
  registerSubscriptionRoutes(app, db);
  registerWholesaleRoutes(app, db);
  registerWholesaleSubscriptionRoutes(app, db);
  registerMarketplaceRoutes(app, db);
  registerActivityRoutes(app, db);
  registerEmployeeRoutes(app, db);
  registerBusinessRoutes(app, db);
  registerAdminSubscriptionRoutes(app, db);
  app.get("/api/auth/me", (req, res) =>
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        name: req.user.name,
        permissions: permissions(req.user),
        employeePermissions: employeePermissions(req.user),
      },
      csrf: req.user.csrf,
    }),
  );
  app.post("/api/auth/logout", async (req, res) => {
    await clearSession(db, res, req, secure);
    res.json({ ok: true });
  });
  app.post("/api/auth/password", async (req, res) => {
    await limit(db, "password:" + req.user.id, 10);
    const user = await db
      .prepare("SELECT * FROM users WHERE id=?")
      .get(req.user.id);
    if (!(await verifyPassword(req.body.currentPassword, user.password_hash)))
      throw bad("Current password is incorrect.", 403);
    const hash = await hashPassword(req.body.password);
    await transaction(db, async () => {
      await db
        .prepare("UPDATE users SET password_hash=? WHERE id=?")
        .run(hash, user.id);
      await db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    });
    res.json(await startSession(db, res, user, secure));
  });
  async function access() {
    return {
      members: await db
        .prepare(
          'SELECT u.id as "userId",u.email,m.vendor_id as "vendorId" FROM memberships m JOIN users u ON u.id=m.user_id',
        )
        .all(),
      invites: await db
        .prepare(
          "SELECT email,vendor_id as \"vendorId\",expires FROM tokens WHERE kind='invite' AND expires>?",
        )
        .all(Date.now()),
    };
  }
  async function payload(user, id) {
    const config = await pricing(db);
    const rows = await allowedVendors(db, user);
    if (id) await requireVendor(db, user, id);
    const row = rows.find((v) => v.id === id) ?? rows[0];
    const can = (p) => {
      if (user.role === "vendor") return employeePermissions(user).includes(p);
      if (user.role !== "admin") return true;
      const adminAlias = {
        customers: "sales",
        returns: "purchases",
        payments: "purchases",
        settings: "stores",
        employees: "vendor_access",
        dashboard: "stores",
      }[p];
      return hasPermission(user, adminAlias || p);
    };
    const vendors = rows.map((v) => {
      const s = JSON.parse(v.data);
      return {
        id: v.id,
        name: s.settings.name,
        owner: v.owner_name,
        type: v.business_type,
        demo: s.demo,
        products: can("inventory") ? s.products.length : 0,
        sales: can("sales") ? s.sales.length : 0,
        revenue: can("sales") ? s.sales.reduce((n, x) => n + x.total, 0) : 0,
        low: can("inventory")
          ? s.products.filter((p) => isLow(p, s)).length
          : 0,
        phone: s.settings.phone,
        ...validity(v, config.trialDays),
        suspended: v.suspended,
        suspensionReason: v.suspension_reason,
        accessChangedAt: v.access_changed_at,
      };
    });
    let state = row ? JSON.parse(row.data) : initial();
    if (user.role === "admin" || user.role === "vendor") {
      state = structuredClone(state);
      if (!can("inventory") && !can("sales")) state.products = [];
      if (!can("sales")) state.sales = [];
      if (!can("customers")) state.customers = [];
      if (!can("purchases")) {
        state.purchases = [];
        state.imports = [];
      }
      if (!can("purchases") && !can("returns") && !can("payments"))
        state.suppliers = [];
      if (!can("returns")) state.supplierReturns = [];
      if (!can("payments")) state.supplierPayments = [];
      if (!can("reports")) state.expenses = [];
    }
    return {
      logo: row?.logo_image ?? null,
      pricing: config,
      subscription: row ? await subscriptionInfo(db, row, config) : null,
      state,
      version: row?.version ?? 0,
      vendorId: row?.id ?? "",
      vendors,
      role: user.role,
      permissions:
        user.role === "vendor" ? employeePermissions(user) : permissions(user),
      email: user.email,
      ...(isAdmin(user) && hasPermission(user, "vendor_access")
        ? { access: await access() }
        : {}),
    };
  }
  app.get("/api/store", async (req, res) =>
    res.json(
      await payload(
        req.user,
        typeof req.query.vendor === "string" ? req.query.vendor : undefined,
      ),
    ),
  );
  app.get("/api/vendors", async (req, res) =>
    res.json({ vendors: (await payload(req.user)).vendors }),
  );
  app.get("/api/vendors/:id/access", async (req, res) => {
    await requireVendor(db, req.user, req.params.id);
    res.json({ ok: true });
  });
  app.get("/api/vendors/:id/products", async (req, res) => {
    if (req.user.role === "vendor" &&
        !["inventory", "sales"].some((permission) => employeePermissions(req.user).includes(permission)))
      requireEmployeePermission(req.user, "inventory");
    if (
      isAdmin(req.user) &&
      !hasPermission(req.user, "inventory") &&
      !hasPermission(req.user, "sales")
    )
      requirePermission(req.user, "inventory");
    const s = JSON.parse(
      (await requireVendor(db, req.user, req.params.id)).data,
    );
    const q = String(req.query.q ?? "").toLowerCase();
    res.json({
      products: s.products.filter((p) =>
        (p.name + " " + p.barcode).toLowerCase().includes(q),
      ),
    });
  });
  app.get("/api/vendors/:id/barcode/:code", async (req, res) => {
    if (req.user.role === "vendor" &&
        !["inventory", "sales"].some((permission) => employeePermissions(req.user).includes(permission)))
      requireEmployeePermission(req.user, "sales");
    if (
      isAdmin(req.user) &&
      !hasPermission(req.user, "inventory") &&
      !hasPermission(req.user, "sales")
    )
      requirePermission(req.user, "sales");
    const s = JSON.parse(
        (await requireVendor(db, req.user, req.params.id)).data,
      ),
      product = s.products.find((p) => p.barcode === req.params.code);
    if (!product) throw bad("Product not found.", 404);
    res.json({ product });
  });
  async function action(req, res) {
    const user = req.user,
      a = req.body;
    let selected = req.params.id ?? a.vendorId,
      code;
    await transaction(db, async () => {
      if (a.type === "pricing_update") {
        await savePricing(db, user, a);
      } else if (a.type === "vendor_create") {
        requireOwner(user, "stores");
        if (typeof a.id !== "string" || !/^vendor-[a-f0-9-]{36}$/.test(a.id))
          throw bad("Invalid vendor identifier.");
        for (const key of ["name", "owner"])
          if (
            typeof a[key] !== "string" ||
            !a[key].trim() ||
            a[key].length > 150
          )
            throw bad("Store and owner names are required.");
        if (
          !businessTypes.includes(a.businessType) ||
          typeof a.phone !== "string" ||
          a.phone.length > 30
        )
          throw bad("Invalid vendor details.");
        const s = initial();
        s.trialStartedAt = new Date().toISOString();
        s.settings = {
          name: a.name.trim(),
          phone: a.phone,
          address: "",
          lowPercent: 20,
        };
        if (!(await db.prepare("SELECT 1 FROM vendors WHERE id=?").get(a.id)))
          await db
            .prepare(
              "INSERT INTO vendors(id,owner_name,business_type,data,trial_days) VALUES(?,?,?,?,?)",
            )
            .run(
              a.id,
              a.owner.trim(),
              a.businessType,
              JSON.stringify(s),
              (await pricing(db)).trialDays,
            );
        selected = a.id;
      } else if (a.type === "claim_access") {
        if (typeof a.code !== "string" || a.code.length > 200)
          throw bad("Invalid code.");
        const hash = digest(a.code.trim());
        const candidate = await db
          .prepare(
            "SELECT * FROM tokens WHERE hash=? AND email=? AND kind='invite' AND expires>?",
          )
          .get(hash, user.email, Date.now());
        if (!candidate)
          throw bad("Code is invalid, expired or assigned to another account.");
        const targetStore = await db
          .prepare("SELECT suspended FROM vendors WHERE id=? FOR UPDATE")
          .get(candidate.vendor_id);
        if (targetStore?.suspended) throw suspensionError();
        const invite = await db
          .prepare(
            "SELECT * FROM tokens WHERE hash=? AND email=? AND kind='invite' AND expires>? FOR UPDATE",
          )
          .get(hash, user.email, Date.now());
        if (!invite)
          throw bad("Code is invalid, expired or assigned to another account.");
        await db
          .prepare("INSERT OR IGNORE INTO memberships VALUES(?,?)")
          .run(user.id, invite.vendor_id);
        await db.prepare("DELETE FROM tokens WHERE hash=?").run(hash);
        selected = invite.vendor_id;
      } else {
        const vendor = await requireVendor(db, user, selected);
        if (
          [
            "subscription_order",
            "subscription_reference",
            "subscription_approve",
            "subscription_extend",
          ].includes(a.type)
        ) {
          await subscriptionAction(db, user, vendor, a);
        } else if (
          a.type === "vendor_suspend" ||
          a.type === "vendor_reactivate"
        ) {
          requireOwner(user, "subscriptions");
          if (
            typeof a.expectedSuspended !== "boolean" ||
            a.expectedSuspended !== vendor.suspended
          )
            throw bad(
              "Store access status changed. Refresh and try again.",
              409,
            );
          const suspended = a.type === "vendor_suspend";
          const reason = suspended ? "Subscription payment pending" : "";
          await db
            .prepare(
              "UPDATE vendors SET suspended=?,suspension_reason=?,access_changed_at=?,access_changed_by=?,version=version+1 WHERE id=?",
            )
            .run(suspended, reason, Date.now(), user.id, selected);
        } else if (a.type === "invite_vendor") {
          requireOwner(user, "vendor_access");
          const mail = email(a.email);
          code = token();
          await db
            .prepare(
              "DELETE FROM tokens WHERE email=? AND vendor_id=? AND kind='invite'",
            )
            .run(mail, selected);
          await db
            .prepare("INSERT INTO tokens VALUES(?,?,?,?,?)")
            .run(
              digest(code),
              mail,
              selected,
              "invite",
              Date.now() + 7 * 86400000,
            );
        } else if (a.type === "reset_vendor_password") {
          requireOwner(user, "vendor_access");
          const mail = email(a.email);
          const target = await db
            .prepare(
              "SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=? AND m.vendor_id=? AND u.role='vendor'",
            )
            .get(mail, selected);
          if (!target) throw bad("Vendor account not found.");
          code = token();
          await db
            .prepare("DELETE FROM tokens WHERE email=? AND kind='reset'")
            .run(mail);
          await db
            .prepare("INSERT INTO tokens VALUES(?,?,?,?,?)")
            .run(digest(code), mail, selected, "reset", Date.now() + 3600000);
        } else if (a.type === "revoke_access") {
          requireOwner(user, "vendor_access");
          const mail = email(a.email);
          await db
            .prepare(
              "DELETE FROM memberships WHERE vendor_id=? AND user_id=(SELECT id FROM users WHERE email=?)",
            )
            .run(selected, mail);
          await db
            .prepare("DELETE FROM tokens WHERE vendor_id=? AND email=?")
            .run(selected, mail);
        } else if (a.type === "vendor_category") {
          if (isAdmin(user)) requirePermission(user, "stores");
          else requireEmployeePermission(user, "settings");
          if (!businessTypes.includes(a.businessType))
            throw bad("Choose a valid store category.");
          await db.prepare("UPDATE vendors SET business_type=?,version=version+1 WHERE id=?")
            .run(a.businessType, selected);
        } else {
          const safe = [
            "product",
            "sale",
            "purchase",
            "bill_import",
            "contact",
            "expense",
            "settings",
            "supplier_return",
            "supplier_payment",
            "purchase_settlement",
            "subscription_request",
            "start_trial",
            "inventory_import",
          ];
          if (!safe.includes(a.type)) throw bad("Unknown action.");
          if (isAdmin(user)) {
            const needed = {
              product: "inventory",
              inventory_import: "inventory",
              sale: "sales",
              purchase: "purchases",
              bill_import: "purchases",
              supplier_return: "purchases",
              supplier_payment: "purchases",
              purchase_settlement: "purchases",
              contact: "stores",
              expense: "reports",
              settings: "stores",
            }[a.type];
            if (needed) requirePermission(user, needed);
          } else if (user.role === "vendor") {
            const needed = {
              product: "inventory",
              inventory_import: "inventory",
              sale: "sales",
              purchase: "purchases",
              bill_import: "purchases",
              supplier_return: "returns",
              supplier_payment: "payments",
              purchase_settlement: "payments",
              contact: "customers",
              expense: "reports",
              settings: "settings",
            }[a.type];
            if (needed) requireEmployeePermission(user, needed);
          }
          const key = [
            "sale",
            "purchase",
            "bill_import",
            "inventory_import",
            "supplier_return",
            "supplier_payment",
            "purchase_settlement",
          ].includes(a.type)
            ? a.type + ":" + a.id
            : null;
          const hash = digest(JSON.stringify(a));
          if (key) {
            const previous = await db
              .prepare(
                "SELECT digest FROM commands WHERE vendor_id=? AND key=?",
              )
              .get(selected, key);
            if (previous) {
              if (previous.digest !== hash)
                throw bad(
                  "This operation ID was used with different data.",
                  409,
                );
              return;
            }
          }
          if (
            a.type === "sale" &&
            !(
              validity(vendor, (await pricing(db)).trialDays).validUntil >
              Date.now()
            )
          )
            throw bad(
              "Subscription expired or inactive. Renew your plan and wait for administrator approval before making sales.",
              403,
            );
          if (a.type === "product" && a.version !== vendor.version)
            throw bad(
              "Inventory changed. Refresh before saving this product.",
              409,
            );
          const s = JSON.parse(vendor.data);
          if (a.type === "start_trial" && !s.trialStartedAt)
            await db
              .prepare("UPDATE vendors SET trial_days=? WHERE id=?")
              .run((await pricing(db)).trialDays, selected);
          try {
            mutate(s, a);
          } catch (e) {
            throw bad(e.message);
          }
          const data = JSON.stringify(s);
          if (data.length > 10000000)
            throw bad(
              "This store has reached its data limit. Archive older records before continuing.",
              413,
            );
          await db
            .prepare("UPDATE vendors SET data=?,version=version+1 WHERE id=?")
            .run(data, selected);
          if (key)
            await db
              .prepare("INSERT INTO commands VALUES(?,?,?)")
              .run(selected, key, hash);
        }
      }
      await db
        .prepare(
          "INSERT INTO audit(created_at,user_id,vendor_id,action) VALUES(?,?,?,?)",
        )
        .run(Date.now(), user.id, selected ?? null, a.type);
      const titles = {
        product: "Inventory item saved",
        sale: "Sale completed",
        purchase: "Stock purchase recorded",
        bill_import: "Supplier bill imported",
        inventory_import: "Inventory imported",
        contact: "Contact saved",
        expense: "Expense recorded",
        settings: "Store settings updated",
        supplier_return: "Supplier return recorded",
        supplier_payment: "Supplier payment recorded",
        purchase_settlement: "Purchase settled",
        subscription_order: "Subscription requested",
        subscription_reference: "Payment reference submitted",
        subscription_approve: "Subscription approved",
        subscription_extend: "Subscription validity extended",
        vendor_create: "Vendor store created",
        vendor_suspend: "Vendor suspended",
        vendor_reactivate: "Vendor reactivated",
        invite_vendor: "Vendor access invitation created",
        revoke_access: "Vendor access revoked",
        logo_update: "Store logo updated",
      };
      if (a.type !== "sale") await recordActivity(db, {
        actorId: user.id,
        vendorId: selected ?? null,
        scope: "vendor",
        category: a.type.startsWith("subscription_") ? "subscription" : a.type,
        title: titles[a.type] || "Store activity",
        detail: "",
      });
    });
    res.json({
      ...(await payload(user, selected)),
      ...(code ? { accessCode: code } : {}),
    });
  }
  app.post("/api/store", action);
  app.post("/api/vendors/:id/actions", action);
  app.get("/api/audit", async (req, res) => {
    requireOwner(req.user);
    res.json({
      events: await db
        .prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 100")
        .all(),
    });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  const root = resolve(frontend);
  if (existsSync(root)) {
    app.use(express.static(root, { index: false }));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(root, "index.html")),
    );
  }
  app.use((err, req, res, _next) => {
    if (!err.status || err.status >= 500)
      console.error("Request failed", req.method, req.path, err.message);
    res.status(err.status ?? 500).json({
      error: err.status
        ? err.message
        : "Could not complete the request. Please retry.",
      ...(err.code === "VENDOR_SUSPENDED" ? { code: err.code } : {}),
    });
  });
  return app;
}
