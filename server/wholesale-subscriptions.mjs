import { randomUUID } from "node:crypto";
import { requireOwner, wholesalePrincipal } from "./security.mjs";
import { recordActivity } from "./activities.mjs";

const bad = (message, status = 400) =>
  Object.assign(Error(message), { status });
export async function wholesalePricing(db) {
  const row = await db
    .prepare("SELECT * FROM wholesale_pricing_config WHERE id=1")
    .get();
  return { ...JSON.parse(row.data), version: row.version };
}
export function wholesaleValidity(row, trialDays = 7) {
  const until =
    Number(row.valid_until) ||
    Number(row.trial_started_at || row.created_at) +
      Number(row.trial_days || trialDays) * 86400000;
  return {
    validUntil: until || null,
    daysRemaining: until
      ? Math.max(0, Math.ceil((until - Date.now()) / 86400000))
      : 0,
    period: row.valid_until ? "Subscription" : "Free trial",
  };
}
export async function wholesaleSubscriptionInfo(db, row, config) {
  return {
    ...wholesaleValidity(row, config.trialDays),
    history: await db
      .prepare(
        "SELECT h.*,EXISTS(SELECT 1 FROM wholesale_payment_proofs p WHERE p.payment_id=h.id) AS has_proof FROM wholesale_subscription_history h WHERE wholesaler_id=? ORDER BY created_at DESC LIMIT 200",
      )
      .all(row.user_id),
  };
}
export async function requireWholesaleActive(db, user) {
  if (user.role !== "wholesale") return;
  const ownerId = await wholesalePrincipal(db, user),
    row = await db
      .prepare("SELECT * FROM wholesalers WHERE user_id=?")
      .get(ownerId);
  const config = await wholesalePricing(db);
  if (!row || wholesaleValidity(row, config.trialDays).validUntil <= Date.now())
    throw bad(
      "Wholesale subscription expired. Renew your plan and wait for administrator approval.",
      403,
    );
}

export function registerWholesaleSubscriptionRoutes(app, db) {
  app.get("/api/wholesale/pricing", async (_req, res) =>
    res.json(await wholesalePricing(db)),
  );
  app.post("/api/wholesale/subscriptions/order", async (req, res) => {
    if (req.user.role !== "wholesale")
      throw bad("Wholesale seller access required.", 403);
    const ownerId = await wholesalePrincipal(db, req.user),
      plan = req.body.plan;
    if (!["monthly", "yearly"].includes(plan))
      throw bad("Choose monthly or yearly.");
    const config = await wholesalePricing(db);
    if (!config.upiId)
      throw bad("Payment QR is not configured. Contact the administrator.");
    const id =
      typeof req.body.id === "string" && /^[a-f0-9-]{36}$/.test(req.body.id)
        ? req.body.id
        : randomUUID();
    const existing = await db
      .prepare("SELECT * FROM wholesale_subscription_history WHERE id=?")
      .get(id);
    if (!existing)
      await db
        .prepare(
          "INSERT INTO wholesale_subscription_history(id,wholesaler_id,kind,plan,amount,days,status,created_at,actor) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          ownerId,
          "payment",
          plan,
          config[plan],
          plan === "monthly" ? 30 : 365,
          "pending",
          Date.now(),
          req.user.id,
        );
    await recordActivity(db, {
      actorId: req.user.id,
      wholesalerId: ownerId,
      scope: "wholesale",
      category: "subscription",
      title: "Wholesale subscription requested",
      detail: `${plan} plan awaiting payment verification.`,
      route: "Subscription",
    });
    res.json({ id, pricing: config });
  });
  app.post("/api/wholesale/subscriptions/reference", async (req, res) => {
    if (req.user.role !== "wholesale")
      throw bad("Wholesale seller access required.", 403);
    const ownerId = await wholesalePrincipal(db, req.user);
    if (
      typeof req.body.reference !== "string" ||
      req.body.reference.trim().length < 4 ||
      req.body.reference.length > 100
    )
      throw bad("Enter the payment transaction reference.");
    const row = await db
      .prepare(
        "SELECT * FROM wholesale_subscription_history WHERE id=? AND wholesaler_id=? AND status='pending'",
      )
      .get(req.body.id, ownerId);
    if (!row) throw bad("Pending payment not found.", 404);
    await db
      .prepare(
        "UPDATE wholesale_subscription_history SET reference=? WHERE id=?",
      )
      .run(req.body.reference.trim(), row.id);
    res.json({ ok: true });
  });
  app.get("/api/wholesale/subscriptions/pending", async (req, res) => {
    requireOwner(req.user, "subscriptions");
    const rows = await db
      .prepare(
        `SELECT h.*,w.business_name,EXISTS(SELECT 1 FROM wholesale_payment_proofs p WHERE p.payment_id=h.id) AS has_proof FROM wholesale_subscription_history h JOIN wholesalers w ON w.user_id=h.wholesaler_id WHERE h.status='pending' ORDER BY h.created_at`,
      )
      .all();
    res.json({ requests: rows });
  });
  app.post("/api/wholesale/subscriptions/:id/approve", async (req, res) => {
    requireOwner(req.user, "subscriptions");
    const row = await db
      .prepare(
        "SELECT h.*,w.valid_until FROM wholesale_subscription_history h JOIN wholesalers w ON w.user_id=h.wholesaler_id WHERE h.id=? AND h.status='pending'",
      )
      .get(req.params.id);
    if (!row) throw bad("Pending wholesale payment not found.", 404);
    const until =
      Math.max(Date.now(), Number(row.valid_until) || 0) +
      Number(row.days) * 86400000;
    await db
      .prepare(
        "UPDATE wholesale_subscription_history SET status='approved',approved_at=?,valid_until=?,actor=? WHERE id=?",
      )
      .run(Date.now(), until, req.user.id, row.id);
    await db
      .prepare("UPDATE wholesalers SET valid_until=? WHERE user_id=?")
      .run(until, row.wholesaler_id);
    await recordActivity(db, {
      actorId: req.user.id,
      wholesalerId: row.wholesaler_id,
      scope: "wholesale",
      category: "subscription",
      title: "Wholesale subscription approved",
      detail: `${row.days} days added to the existing remaining validity.`,
    });
    res.json({ ok: true });
  });
  app.post("/api/wholesale/subscriptions/extend", async (req, res) => {
    requireOwner(req.user, "subscriptions");
    const days = Number(req.body.days);
    if (!Number.isInteger(days) || days < 1 || days > 3650)
      throw bad("Enter 1–3650 days.");
    const seller = await db
      .prepare("SELECT * FROM wholesalers WHERE user_id=?")
      .get(req.body.wholesalerId);
    if (!seller) throw bad("Wholesale seller not found.", 404);
    const until =
        Math.max(Date.now(), Number(seller.valid_until) || 0) + days * 86400000,
      id = randomUUID();
    await db
      .prepare(
        "INSERT INTO wholesale_subscription_history(id,wholesaler_id,kind,amount,days,status,reference,created_at,approved_at,valid_until,actor) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        seller.user_id,
        "extension",
        0,
        days,
        "approved",
        String(req.body.reason || "Administrator extension").slice(0, 100),
        Date.now(),
        Date.now(),
        until,
        req.user.id,
      );
    await db
      .prepare("UPDATE wholesalers SET valid_until=? WHERE user_id=?")
      .run(until, seller.user_id);
    res.json({ ok: true });
  });
  app.post("/api/wholesale/pricing", async (req, res) => {
    requireOwner(req.user, "pricing");
    const current = await db
        .prepare("SELECT * FROM wholesale_pricing_config WHERE id=1")
        .get(),
      p = req.body;
    if (p.version !== current.version)
      throw bad("Pricing changed. Refresh first.", 409);
    if (
      !Number.isInteger(p.trialDays) ||
      p.trialDays < 1 ||
      p.trialDays > 90 ||
      ![p.monthly, p.yearly].every((x) => Number.isFinite(x) && x > 0) ||
      typeof p.payee !== "string" ||
      !p.payee.trim() ||
      typeof p.upiId !== "string" ||
      (p.upiId && !/^[\w.\-]{2,128}@[\w]{2,64}$/.test(p.upiId))
    )
      throw bad("Enter valid wholesale pricing and payment settings.");
    await db
      .prepare(
        "UPDATE wholesale_pricing_config SET data=?,version=version+1 WHERE id=1",
      )
      .run(
        JSON.stringify({
          monthly: p.monthly,
          yearly: p.yearly,
          trialDays: p.trialDays,
          upiId: p.upiId,
          payee: p.payee.trim(),
          headline: String(p.headline || "Wholesale plans").slice(0, 150),
        }),
      );
    res.json(await wholesalePricing(db));
  });
}
