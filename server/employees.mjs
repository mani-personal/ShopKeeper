import { randomUUID } from "node:crypto";
import {
  email,
  hashPassword,
  requireVendor,
  requireEmployeePermission,
  EMPLOYEE_PERMISSIONS,
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
  const rows = await db
    .prepare(
      `SELECT u.id,u.name,u.email,u.created_at,u.employee_permissions FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.vendor_id=? AND u.role='vendor' AND u.employee_permissions IS NOT NULL ORDER BY u.created_at`,
    )
    .all(vendorId);
  return rows.map((row) => ({
    ...row,
    permissions: JSON.parse(row.employee_permissions || "[]"),
  }));
}

async function wholesaleTeam(db, wholesalerId) {
  const rows = await db
    .prepare(
      `SELECT u.id,u.name,u.email,u.created_at,u.employee_permissions FROM users u JOIN wholesale_memberships m ON m.user_id=u.id WHERE m.wholesaler_id=? AND u.employee_permissions IS NOT NULL ORDER BY u.created_at`,
    )
    .all(wholesalerId);
  return rows.map((row) => ({
    ...row,
    permissions: JSON.parse(row.employee_permissions || "[]"),
  }));
}

function cleanPermissions(value) {
  if (value === undefined) return ["dashboard", "sales", "inventory"];
  if (!Array.isArray(value)) throw bad("Choose employee access permissions.");
  return [...new Set(value)].filter((x) => EMPLOYEE_PERMISSIONS.includes(x));
}

export function registerEmployeeRoutes(app, db) {
  app.get("/api/employees", async (req, res) => {
    if (req.user.role === "wholesale") {
      requireEmployeePermission(req.user, "employees");
      await requireWholesaleActive(db, req.user);
      const wholesalerId = await wholesalePrincipal(db, req.user);
      return res.json({
        employees: await wholesaleTeam(db, wholesalerId),
        accountType: "wholesale",
      });
    }
    requireEmployeePermission(req.user, "employees");
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
      id = randomUUID(),
      access = cleanPermissions(req.body.permissions);
    if (!access.length) throw bad("Choose at least one employee permission.");
    if (req.user.role === "wholesale") {
      requireEmployeePermission(req.user, "employees");
      await requireWholesaleActive(db, req.user);
      const wholesalerId = await wholesalePrincipal(db, req.user);
      await transaction(db, async () => {
        if (await db.prepare("SELECT 1 FROM users WHERE email=?").get(mail))
          throw bad("An account already uses this email.", 409);
        await db
          .prepare(
            "INSERT INTO users(id,email,password_hash,role,name,created_at,employee_permissions) VALUES(?,?,?,?,?,?,?)",
          )
          .run(id, mail, passwordHash, "wholesale", displayName, Date.now(), JSON.stringify(access));
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
    requireEmployeePermission(req.user, "employees");
    const vendor = await requireVendor(db, req.user, req.body.vendorId);
    await transaction(db, async () => {
      if (await db.prepare("SELECT 1 FROM users WHERE email=?").get(mail))
        throw bad("An account already uses this email.", 409);
      await db
        .prepare(
          "INSERT INTO users(id,email,password_hash,role,name,created_at,employee_permissions) VALUES(?,?,?,?,?,?,?)",
        )
        .run(id, mail, passwordHash, "vendor", displayName, Date.now(), JSON.stringify(access));
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
      requireEmployeePermission(req.user, "employees");
      const wholesalerId = await wholesalePrincipal(db, req.user);
      const result = await db
        .prepare(
          "DELETE FROM wholesale_memberships WHERE user_id=? AND wholesaler_id=? AND user_id IN (SELECT id FROM users WHERE employee_permissions IS NOT NULL)",
        )
        .run(req.params.id, wholesalerId);
      if (!result.changes) throw bad("Employee not found.", 404);
      await db
        .prepare("DELETE FROM sessions WHERE user_id=?")
        .run(req.params.id);
      return res.json({ employees: await wholesaleTeam(db, wholesalerId) });
    }
    requireEmployeePermission(req.user, "employees");
    const vendor = await requireVendor(db, req.user, req.body.vendorId);
    const result = await db
      .prepare("DELETE FROM memberships WHERE user_id=? AND vendor_id=? AND user_id IN (SELECT id FROM users WHERE employee_permissions IS NOT NULL)")
      .run(req.params.id, vendor.id);
    if (!result.changes) throw bad("Employee not found.", 404);
    await db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.params.id);
    res.json({ employees: await vendorTeam(db, vendor.id) });
  });

  app.post("/api/employees/:id/permissions", async (req, res) => {
    const access = cleanPermissions(req.body.permissions);
    if (!access.length) throw bad("Choose at least one employee permission.");
    requireEmployeePermission(req.user, "employees");
    if (req.user.role === "wholesale") {
      const wholesalerId = await wholesalePrincipal(db, req.user),
        result = await db
          .prepare(
            "UPDATE users SET employee_permissions=? WHERE id=? AND employee_permissions IS NOT NULL AND EXISTS(SELECT 1 FROM wholesale_memberships WHERE user_id=users.id AND wholesaler_id=?)",
          )
          .run(JSON.stringify(access), req.params.id, wholesalerId);
      if (!result.changes) throw bad("Employee not found.", 404);
      await db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.params.id);
      return res.json({ employees: await wholesaleTeam(db, wholesalerId) });
    }
    const vendor = await requireVendor(db, req.user, req.body.vendorId),
      result = await db
        .prepare(
          "UPDATE users SET employee_permissions=? WHERE id=? AND employee_permissions IS NOT NULL AND EXISTS(SELECT 1 FROM memberships WHERE user_id=users.id AND vendor_id=?)",
        )
        .run(JSON.stringify(access), req.params.id, vendor.id);
    if (!result.changes) throw bad("Employee not found.", 404);
    await db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.params.id);
    res.json({ employees: await vendorTeam(db, vendor.id) });
  });
}
