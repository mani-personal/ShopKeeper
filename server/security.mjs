import {
  scrypt as scryptCallback,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export function validPassword(p) {
  return typeof p === "string" && p.length >= 12 && p.length <= 128;
}
export function email(value) {
  if (
    typeof value !== "string" ||
    value.length > 200 ||
    !/^\S+@\S+\.\S+$/.test(value.trim())
  )
    throw Object.assign(Error("Enter a valid email address."), { status: 400 });
  return value.trim().toLowerCase();
}
export async function hashPassword(p) {
  if (!validPassword(p))
    throw Object.assign(Error("Use a password with 12–128 characters."), {
      status: 400,
    });
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(p, salt, 64);
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(p, hash) {
  if (typeof p !== "string" || p.length > 128) return false;
  const [, salt, key] = hash.split(":");
  const check = await scrypt(p, salt, 64);
  const saved = Buffer.from(key, "hex");
  return saved.length === check.length && timingSafeEqual(saved, check);
}
export async function limit(db, key, max, windowMs = 900000) {
  const now = Date.now();
  const row = await db
    .prepare(
      "INSERT INTO attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN attempts.reset_at<=? THEN 1 ELSE attempts.count+1 END,reset_at=CASE WHEN attempts.reset_at<=? THEN EXCLUDED.reset_at ELSE attempts.reset_at END RETURNING count",
    )
    .get(key, now + windowMs, now, now);
  if (row.count > max)
    throw Object.assign(Error("Too many attempts. Please try again later."), {
      status: 429,
    });
}
export const ADMIN_PERMISSIONS = [
  "stores",
  "vendor_access",
  "subscriptions",
  "pricing",
  "inventory",
  "sales",
  "purchases",
  "reports",
  "wholesale",
];
export const EMPLOYEE_PERMISSIONS = [
  "dashboard",
  "sales",
  "inventory",
  "purchases",
  "customers",
  "returns",
  "payments",
  "reports",
  "settings",
  "employees",
];
export function employeePermissions(user) {
  if (user?.role !== "vendor" && user?.role !== "wholesale") return [];
  if (user.employee_permissions == null) return EMPLOYEE_PERMISSIONS;
  try {
    const value =
      typeof user.employee_permissions === "string"
        ? JSON.parse(user.employee_permissions)
        : user.employee_permissions;
    return Array.isArray(value)
      ? value.filter((x) => EMPLOYEE_PERMISSIONS.includes(x))
      : [];
  } catch {
    return [];
  }
}
export function requireEmployeePermission(user, permission) {
  if (
    (user?.role === "vendor" || user?.role === "wholesale") &&
    !employeePermissions(user).includes(permission)
  )
    throw Object.assign(
      Error("Your employee account does not have access to this section."),
      { status: 403 },
    );
}
export function permissions(user) {
  if (user?.role === "owner") return ADMIN_PERMISSIONS;
  if (user?.role !== "admin") return [];
  try {
    const value =
      typeof user.admin_permissions === "string"
        ? JSON.parse(user.admin_permissions)
        : user.admin_permissions;
    return Array.isArray(value)
      ? value.filter((x) => ADMIN_PERMISSIONS.includes(x))
      : [];
  } catch {
    return [];
  }
}
export function hasPermission(user, permission) {
  return (
    user?.role === "owner" ||
    (user?.role === "admin" && permissions(user).includes(permission))
  );
}
export function requirePermission(user, permission) {
  if (!hasPermission(user, permission))
    throw Object.assign(
      Error("Your administrator account does not have access to this section."),
      { status: 403 },
    );
}
export async function readSession(db, req) {
  const raw = req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("shop_session="))
    ?.slice(13);
  if (!raw) return null;
  return (
    (await db
      .prepare(
        "SELECT users.id,users.email,users.role,users.name,users.admin_permissions,users.employee_permissions,sessions.csrf,sessions.hash FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires>? AND users.disabled=FALSE",
      )
      .get(digest(raw), Date.now())) ?? null
  );
}
export async function startSession(db, res, user, secure) {
  const raw = token(),
    csrf = token();
  await db
    .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
    .run(digest(raw), user.id, csrf, Date.now() + 8 * 3600000);
  res.cookie("shop_session", raw, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 3600000,
  });
  return {
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
    csrf,
  };
}
export async function clearSession(db, res, req, secure) {
  const current = await readSession(db, req);
  if (current)
    await db.prepare("DELETE FROM sessions WHERE hash=?").run(current.hash);
  res.clearCookie("shop_session", {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
  });
}
export async function allowedVendors(db, user) {
  return isAdmin(user)
    ? await db.prepare("SELECT * FROM vendors ORDER BY rowid").all()
    : await db
        .prepare(
          "SELECT v.* FROM vendors v JOIN memberships m ON m.vendor_id=v.id WHERE m.user_id=? AND v.suspended=FALSE ORDER BY v.rowid",
        )
        .all(user.id);
}
export async function requireVendor(db, user, id) {
  if (typeof id !== "string" || !id)
    throw Object.assign(Error("Choose a store."), { status: 400 });
  const row = await db
    .prepare("SELECT * FROM vendors WHERE id=? FOR UPDATE")
    .get(id);
  if (
    !row ||
    (!isAdmin(user) &&
      !(await db
        .prepare("SELECT 1 FROM memberships WHERE user_id=? AND vendor_id=?")
        .get(user.id, id)))
  )
    throw Object.assign(Error("Store not found or access denied."), {
      status: 403,
    });
  if (!isAdmin(user) && row.suspended) throw suspensionError();
  return row;
}
export function requireOwner(user, permission = "stores") {
  requirePermission(user, permission);
}

export function suspensionError() {
  return Object.assign(
    Error(
      "Store access is suspended due to a pending subscription payment. Contact your administrator to confirm payment and reactivate access. Your store data is preserved.",
    ),
    { status: 403, code: "VENDOR_SUSPENDED" },
  );
}
export async function requireActiveAccount(db, user) {
  if (isAdmin(user)) return;
  const rows = await db
    .prepare(
      "SELECT v.suspended FROM vendors v JOIN memberships m ON m.vendor_id=v.id WHERE m.user_id=?",
    )
    .all(user.id);
  if (rows.length && rows.every((v) => v.suspended)) throw suspensionError();
}

export const isAdmin = (user) => user.role === "owner" || user.role === "admin";
export function requireSuperAdmin(user) {
  if (user.role !== "owner")
    throw Object.assign(
      Error("Only the super admin can manage administrators."),
      { status: 403 },
    );
}

export async function wholesalePrincipal(db, user) {
  if (user?.role !== "wholesale")
    throw Object.assign(Error("Wholesale seller access required."), {
      status: 403,
    });
  const member = await db
    .prepare("SELECT wholesaler_id FROM wholesale_memberships WHERE user_id=?")
    .get(user.id);
  return member?.wholesaler_id || user.id;
}
