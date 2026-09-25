import { randomUUID } from "node:crypto";
import {
  requireSuperAdmin,
  email,
  hashPassword,
  token,
  digest,
  limit,
  ADMIN_PERMISSIONS,
} from "./security.mjs";
import { transaction } from "./db.mjs";
const bad = (message, status = 400) =>
  Object.assign(Error(message), { status });
export function registerAdminRoutes(app, db) {
  app.get("/api/admins", async (req, res) => {
    requireSuperAdmin(req.user);
    res.json({
      permissions: ADMIN_PERMISSIONS,
      admins: (
        await db
          .prepare(
            "SELECT id,email,name,disabled,created_at,admin_permissions FROM users WHERE role='admin' AND deleted_at IS NULL ORDER BY created_at DESC",
          )
          .all()
      ).map((a) => ({
        ...a,
        permissions: JSON.parse(a.admin_permissions || "[]"),
      })),
    });
  });
  app.post("/api/admins", async (req, res) => {
    requireSuperAdmin(req.user);
    await limit(db, "admin-create:" + req.user.id, 20);
    const mail = email(req.body.email);
    if (
      typeof req.body.name !== "string" ||
      !req.body.name.trim() ||
      req.body.name.length > 100
    )
      throw bad("Enter an administrator name.");
    const permissions = cleanPermissions(req.body.permissions);
    const hash = await hashPassword(req.body.password);
    await transaction(db, async () => {
      await db.query("SELECT pg_advisory_xact_lock(78146323)");
      if (await db.prepare("SELECT id FROM users WHERE email=?").get(mail))
        throw bad("An account already uses this email.", 409);
      const id = randomUUID();
      await db
        .prepare(
          "INSERT INTO users(id,email,password_hash,role,name,created_at,admin_permissions) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          id,
          mail,
          hash,
          "admin",
          req.body.name.trim(),
          Date.now(),
          JSON.stringify(permissions),
        );
      await db
        .prepare("INSERT INTO audit(created_at,user_id,action) VALUES(?,?,?)")
        .run(Date.now(), req.user.id, "admin_created:" + id);
    });
    res.json({ ok: true });
  });
  app.post("/api/admins/:id", async (req, res) => {
    requireSuperAdmin(req.user);
    let code;
    await transaction(db, async () => {
      const target = await db
        .prepare(
          "SELECT id,email,disabled FROM users WHERE id=? AND role='admin' AND deleted_at IS NULL FOR UPDATE",
        )
        .get(req.params.id);
      if (!target) throw bad("Administrator not found.", 404);
      if (req.body.action === "profile") {
        const displayName = typeof req.body.name === "string" ? req.body.name.trim() : "";
        if (!displayName || displayName.length > 100) throw bad("Enter an administrator name.");
        const mail = email(req.body.email);
        if (mail !== target.email && await db.prepare("SELECT id FROM users WHERE email=? AND id<>?").get(mail, target.id))
          throw bad("An account already uses this email.", 409);
        await db.prepare("UPDATE users SET name=?,email=? WHERE id=?").run(displayName, mail, target.id);
        await db.prepare("DELETE FROM sessions WHERE user_id=?").run(target.id);
      } else if (req.body.action === "delete") {
        await db.prepare("UPDATE users SET disabled=TRUE,deleted_at=?,admin_permissions='[]' WHERE id=?").run(Date.now(), target.id);
        await db.prepare("DELETE FROM sessions WHERE user_id=?").run(target.id);
        await db.prepare("DELETE FROM tokens WHERE email=?").run(target.email);
      } else if (req.body.action === "reset") {
        code = token();
        await db
          .prepare("DELETE FROM tokens WHERE email=? AND kind='reset'")
          .run(target.email);
        await db
          .prepare("INSERT INTO tokens VALUES(?,?,?,?,?)")
          .run(digest(code), target.email, null, "reset", Date.now() + 3600000);
      } else if (["enable", "disable"].includes(req.body.action)) {
        await db
          .prepare("UPDATE users SET disabled=? WHERE id=?")
          .run(req.body.action === "disable", target.id);
        await db.prepare("DELETE FROM sessions WHERE user_id=?").run(target.id);
      } else if (req.body.action === "permissions") {
        await db
          .prepare("UPDATE users SET admin_permissions=? WHERE id=?")
          .run(
            JSON.stringify(cleanPermissions(req.body.permissions)),
            target.id,
          );
        await db.prepare("DELETE FROM sessions WHERE user_id=?").run(target.id);
      } else throw bad("Choose profile, delete, enable, disable, reset or permissions.");
      await db
        .prepare("INSERT INTO audit(created_at,user_id,action) VALUES(?,?,?)")
        .run(
          Date.now(),
          req.user.id,
          "admin_" + req.body.action + ":" + target.id,
        );
    });
    res.json({ ok: true, ...(code ? { code } : {}) });
  });
}
function cleanPermissions(value) {
  if (value === undefined) return [...ADMIN_PERMISSIONS];
  if (!Array.isArray(value))
    throw bad("Choose at least one administrator permission.");
  const result = [
    ...new Set(value.filter((x) => ADMIN_PERMISSIONS.includes(x))),
  ];
  if (!result.length)
    throw bad("Choose at least one administrator permission.");
  return result;
}
