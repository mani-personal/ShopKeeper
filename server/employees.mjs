import { randomUUID } from "node:crypto";
import {
  email,
  hashPassword,
  requireVendor,
  wholesalePrincipal,
} from "./security.mjs";
import { transaction } from "./db.mjs";
import { recordActivity } from "./activities.mjs";
import { requireWholesaleActive } from "./wholesale-subscriptions.mjs";

const bad = (message, status = 400) =>
  Object.assign(Error(message), { status });
const name = (value) =>
  typeof value === "string" && value.trim() && value.trim().length <= 100
    ? value.trim()
    : "";

async function vendorTeam(db, vendorId) {
  return db
    .prepare(
      `SELECT u.id,u.name,u.email,u.created_at,CASE WHEN u.id IN (SELECT user_id FROM memberships WHERE vendor_id=? LIMIT 1) THEN TRUE ELSE FALSE END AS active FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.vendor_id=? AND u.role='vendor' ORDER BY u.created_at`,
    )
    .all(vendorId, vendorId);
}

async function wholesaleTeam(db, wholesalerId) {
  return db
    .prepare(
      `SELECT u.id,u.name,u.email,u.created_at FROM users u JOIN wholesale_memberships m ON m.user_id=u.id WHERE m.wholesaler_id=? ORDER BY u.created_at`,
    )
    .all(wholesalerId);
}

export function registerEmployeeRoutes(app, db) {
  app.get("/api/employees", async (req, res) => {
    if (req.user.role === "wholesale") {
      await requireWholesaleActive(db, req.user);
      const wholesalerId = await wholesalePrincipal(db, req.user);
      return res.json({
        employees: await wholesaleTeam(db, wholesalerId),
        accountType: "wholesale",
      });
    }
    const vendor = await requireVendor(
      db,
      req.user,
      String(req.query.vendor || ""),
    );
    res.json({
      employees: await vendorTeam(db, vendor.id),
      accountType: "vendor",
    });
  });

  app.post("/api/employees", async (req, res) => {
    const mail = email(req.body.email),
      displayName = name(req.body.name);
    if (!displayName) throw bad("Enter the employee name.");
    const passwordHash = await hashPassword(req.body.password),
      id = randomUUID();
    if (req.user.role === "wholesale") {
      await requireWholesaleActive(db, req.user);
      const wholesalerId = await wholesalePrincipal(db, req.user);
      await transaction(db, async () => {
        if (await db.prepare("SELECT 1 FROM users WHERE email=?").get(mail))
          throw bad("An account already uses this email.", 409);
        await db
          .prepare(
            "INSERT INTO users(id,email,password_hash,role,name,created_at) VALUES(?,?,?,?,?,?)",
          )
          .run(id, mail, passwordHash, "wholesale", displayName, Date.now());
        await db
          .prepare(
            "INSERT INTO wholesale_memberships(user_id,wholesaler_id,created_at) VALUES(?,?,?)",
          )
          .run(id, wholesalerId, Date.now());
      });
      await recordActivity(db, {
        actorId: req.user.id,
        wholesalerId,
        scope: "wholesale",
        category: "employee",
        title: "Wholesale employee added",
        detail: displayName,
        route: "Employees",
      });
      return res.json({ employees: await wholesaleTeam(db, wholesalerId) });
    }
    const vendor = await requireVendor(db, req.user, req.body.vendorId);
    await transaction(db, async () => {
      if (await db.prepare("SELECT 1 FROM users WHERE email=?").get(mail))
        throw bad("An account already uses this email.", 409);
      await db
        .prepare(
          "INSERT INTO users(id,email,password_hash,role,name,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(id, mail, passwordHash, "vendor", displayName, Date.now());
      await db
        .prepare("INSERT INTO memberships(user_id,vendor_id) VALUES(?,?)")
        .run(id, vendor.id);
    });
    await recordActivity(db, {
      actorId: req.user.id,
      vendorId: vendor.id,
      scope: "vendor",
      category: "employee",
      title: "Store employee added",
      detail: displayName,
      route: "Employees",
    });
    res.json({ employees: await vendorTeam(db, vendor.id) });
  });

  app.post("/api/employees/:id/remove", async (req, res) => {
    if (req.params.id === req.user.id)
      throw bad("You cannot remove your own signed-in account.", 409);
    if (req.user.role === "wholesale") {
      const wholesalerId = await wholesalePrincipal(db, req.user);
      const result = await db
        .prepare(
          "DELETE FROM wholesale_memberships WHERE user_id=? AND wholesaler_id=?",
        )
        .run(req.params.id, wholesalerId);
      if (!result.changes) throw bad("Employee not found.", 404);
      await db
        .prepare("DELETE FROM sessions WHERE user_id=?")
        .run(req.params.id);
      return res.json({ employees: await wholesaleTeam(db, wholesalerId) });
    }
    const vendor = await requireVendor(db, req.user, req.body.vendorId);
    const result = await db
      .prepare("DELETE FROM memberships WHERE user_id=? AND vendor_id=?")
      .run(req.params.id, vendor.id);
    if (!result.changes) throw bad("Employee not found.", 404);
    await db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.params.id);
    res.json({ employees: await vendorTeam(db, vendor.id) });
  });
}
