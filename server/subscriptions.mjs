import { requireOwner } from "./security.mjs";
import { randomUUID } from "node:crypto";
import { recordActivity } from "./activities.mjs";
import { transaction } from "./db.mjs";
const bad = (message,status=400) => Object.assign(Error(message), { status });
export async function pricing(db) {
  const row = await db.prepare("SELECT * FROM pricing_config WHERE id=1").get();
  return { ...JSON.parse(row.data), version: row.version };
}
export function validity(v, trialDays = 10) {
  const s = JSON.parse(v.data);
  const until =
    Number(v.valid_until) ||
    (s.trialStartedAt
      ? Date.parse(s.trialStartedAt) + (v.trial_days ?? trialDays) * 86400000
      : 0);
  return {
    validUntil: until || null,
    daysRemaining: until
      ? Math.max(0, Math.ceil((until - Date.now()) / 86400000))
      : 0,
    period: v.valid_until ? "Subscription" : "Trial",
  };
}
export async function subscriptionInfo(db, v, config) {
  return {
    vendorId: v.id,
    ...validity(v, config.trialDays),
    history: await db
      .prepare(
        "SELECT h.*,EXISTS(SELECT 1 FROM payment_proofs p WHERE p.payment_id=h.id) AS has_proof FROM subscription_history h WHERE vendor_id=? ORDER BY created_at DESC,id DESC LIMIT 200",
      )
      .all(v.id),
  };
}
export async function savePricing(db, user, a) {
  requireOwner(user, "pricing");
  const row = await db
    .prepare("SELECT * FROM pricing_config WHERE id=1 FOR UPDATE")
    .get();
  if (a.version !== row.version)
    throw bad("Pricing changed. Refresh before saving.");
  const p = a.pricing;
  if (
    !p ||
    ![p.monthly, p.yearly].every(
      (n) =>
        typeof n === "number" &&
        Number.isFinite(n) &&
        n > 0 &&
        n <= 1000000 &&
        Math.round(n * 100) / 100 === n,
    ) ||
    !Number.isInteger(p.trialDays) ||
    p.trialDays < 1 ||
    p.trialDays > 90 ||
    typeof p.upiId !== "string" ||
    (p.upiId && !/^[a-zA-Z0-9.\-_]{2,128}@[a-zA-Z0-9]{2,64}$/.test(p.upiId)) ||
    typeof p.payee !== "string" ||
    !p.payee.trim() ||
    p.payee.length > 100 ||
    typeof p.headline !== "string" ||
    !p.headline.trim() ||
    p.headline.length > 150
  )
    throw bad("Enter valid prices, trial days, payee, UPI ID and heading.");
  await db
    .prepare("UPDATE pricing_config SET data=?,version=version+1 WHERE id=1")
    .run(
      JSON.stringify({
        monthly: p.monthly,
        yearly: p.yearly,
        trialDays: p.trialDays,
        upiId: p.upiId,
        payee: p.payee.trim(),
        headline: p.headline.trim(),
      }),
    );
}
export async function subscriptionAction(db, user, v, a) {
  const config = await pricing(db);
  if (a.type === "subscription_order") {
    if (
      !["monthly", "yearly"].includes(a.plan) ||
      typeof a.id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(a.id)
    )
      throw bad("Choose a plan.");
    if (!config.upiId)
      throw bad("Payment QR is not configured. Contact the administrator.");
    const prior = await db
      .prepare("SELECT * FROM subscription_history WHERE id=?")
      .get(a.id);
    if (prior) {
      if (prior.vendor_id !== v.id || prior.plan !== a.plan)
        throw bad("Request ID is already used.");
      return;
    }
    await db
      .prepare(
        "INSERT INTO subscription_history(id,vendor_id,kind,plan,amount,days,status,created_at,actor) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        a.id,
        v.id,
        "payment",
        a.plan,
        config[a.plan],
        a.plan === "monthly" ? 30 : 365,
        "pending",
        Date.now(),
        user.id,
      );
    return;
  }
  if (a.type === "subscription_reference") {
    if (
      typeof a.reference !== "string" ||
      a.reference.trim().length < 4 ||
      a.reference.length > 100
    )
      throw bad("Enter the payment transaction reference.");
    const row = await db
      .prepare(
        "SELECT * FROM subscription_history WHERE id=? AND vendor_id=? AND status='pending' FOR UPDATE",
      )
      .get(a.id, v.id);
    if (!row) throw bad("Pending payment not found.");
    await db
      .prepare("UPDATE subscription_history SET reference=? WHERE id=?")
      .run(a.reference.trim(), a.id);
    return;
  }
  requireOwner(user, "subscriptions");
  if (a.type === "subscription_approve") {
    const row = await db
      .prepare(
        "SELECT * FROM subscription_history WHERE id=? AND vendor_id=? AND kind='payment' FOR UPDATE",
      )
      .get(a.id, v.id);
    if (!row) throw bad("Payment request not found.",404);
    if (row.status === "approved") return;
    if (row.status !== "pending") throw bad("Payment is not pending.");
    const until =
      Math.max(Date.now(), validity(v, config.trialDays).validUntil || 0) +
      row.days * 86400000;
    await db
      .prepare(
        "UPDATE subscription_history SET status='approved',approved_at=?,valid_until=?,actor=? WHERE id=?",
      )
      .run(Date.now(), until, user.id, row.id);
    await db
      .prepare(
        "UPDATE vendors SET valid_until=?,suspended=FALSE,suspension_reason='',access_changed_at=?,access_changed_by=?,version=version+1 WHERE id=?",
      )
      .run(until, Date.now(), user.id, v.id);
    return;
  }
  if (a.type === "subscription_extend") {
    if (
      !Number.isInteger(a.days) ||
      a.days < 1 ||
      a.days > 3650 ||
      typeof a.reference !== "string" ||
      !a.reference.trim() ||
      a.reference.length > 100 ||
      typeof a.id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(a.id)
    )
      throw bad("Enter 1–3650 days and a reason.");
    const prior = await db
      .prepare("SELECT * FROM subscription_history WHERE id=?")
      .get(a.id);
    if (prior) {
      if (
        prior.vendor_id !== v.id ||
        prior.days !== a.days ||
        prior.reference !== a.reference.trim()
      )
        throw bad("Request ID is already used.");
      return;
    }
    const until =
      Math.max(Date.now(), validity(v, config.trialDays).validUntil || 0) +
      a.days * 86400000;
    await db
      .prepare(
        "INSERT INTO subscription_history(id,vendor_id,kind,days,status,reference,created_at,approved_at,valid_until,actor) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        a.id,
        v.id,
        "extension",
        a.days,
        "approved",
        a.reference.trim(),
        Date.now(),
        Date.now(),
        until,
        user.id,
      );
    await db
      .prepare("UPDATE vendors SET valid_until=?,version=version+1 WHERE id=?")
      .run(until, v.id);
    return;
  }
  throw bad("Unknown subscription action.");
}
export function registerSubscriptionRoutes(app, db) {
  app.post("/api/subscriptions/extension-request", async (req,res) => {
    if(req.user.role!=="vendor"||req.user.employee_permissions!==null) throw Object.assign(Error("Store owner access required."),{status:403});
    const days=Number(req.body.days), reason=String(req.body.reason||"").trim();
    if(!Number.isInteger(days)||days<1||days>3650||!reason||reason.length>100) throw bad("Enter 1–3650 days and a reason (up to 100 characters).");
    const vendor=await db.prepare("SELECT vendor_id FROM memberships WHERE vendor_id=? AND user_id=?").get(req.body.vendorId,req.user.id);
    if(!vendor) throw Object.assign(Error("Vendor not found."),{status:404});
    await transaction(db,async()=>{
      await db.prepare("SELECT id FROM vendors WHERE id=? FOR UPDATE").get(vendor.vendor_id);
      const pending=await db.prepare("SELECT id FROM subscription_history WHERE vendor_id=? AND kind='extension_request' AND status='pending'").get(vendor.vendor_id);
      if(pending) throw Object.assign(Error("Your previous extension request is awaiting review."),{status:409});
      await db.prepare("INSERT INTO subscription_history(id,vendor_id,kind,amount,days,status,reference,created_at,actor) VALUES(?,?,?,?,?,?,?,?,?)").run(randomUUID(),vendor.vendor_id,"extension_request",0,days,"pending",reason,Date.now(),req.user.id);
      await recordActivity(db,{actorId:req.user.id,vendorId:vendor.vendor_id,scope:"admin",category:"subscription",title:"Vendor extension requested",detail:`${days} days requested: ${reason}`,route:"Vendors"});
    });
    res.json({ok:true});
  });
  app.get("/api/subscriptions/extensions/pending", async (req,res) => {
    requireOwner(req.user,"subscriptions");
    const rows=await db.prepare("SELECT h.*,v.data FROM subscription_history h JOIN vendors v ON v.id=h.vendor_id WHERE h.kind='extension_request' AND h.status='pending' ORDER BY h.created_at").all();
    res.json({requests:rows.map(({data,...h})=>({...h,businessName:JSON.parse(data).settings.name}))});
  });
  app.post("/api/subscriptions/extensions/:id/review", async (req,res) => {
    requireOwner(req.user,"subscriptions");
    if(!["approve","reject"].includes(req.body.action)) throw bad("Choose approve or reject.");
    await transaction(db,async()=>{
    const row=await db.prepare("SELECT h.*,v.data,v.valid_until,v.trial_days FROM subscription_history h JOIN vendors v ON v.id=h.vendor_id WHERE h.id=? AND h.kind='extension_request' AND h.status='pending' FOR UPDATE OF h,v").get(req.params.id);
    if(!row) throw Object.assign(Error("Extension request not found."),{status:404});
    const until=req.body.action==="approve"?Math.max(Date.now(),validity(row,(await pricing(db)).trialDays).validUntil||0)+row.days*86400000:null;
    await db.prepare("UPDATE subscription_history SET status=?,approved_at=?,valid_until=?,actor=? WHERE id=?").run(req.body.action==="approve"?"approved":"rejected",Date.now(),until,req.user.id,row.id);
    if(until) await db.prepare("UPDATE vendors SET valid_until=?,version=version+1 WHERE id=?").run(until,row.vendor_id);
    await recordActivity(db,{actorId:req.user.id,vendorId:row.vendor_id,scope:"vendor",category:"subscription",title:req.body.action==="approve"?"Extension approved":"Extension declined",detail:`${row.days} days`,route:"Pricing"});
    });
    res.json({ok:true});
  });
  app.get("/api/subscriptions/pending", async (req, res) => {
    requireOwner(req.user, "subscriptions");
    const rows = await db
      .prepare(
        `SELECT h.*,v.data,EXISTS(SELECT 1 FROM payment_proofs p WHERE p.payment_id=h.id) AS has_proof FROM subscription_history h JOIN vendors v ON v.id=h.vendor_id WHERE h.kind='payment' AND h.status='pending' ORDER BY h.created_at ASC`,
      )
      .all();
    res.json({
      requests: rows.map(({ data, ...h }) => ({
        ...h,
        vendorName: JSON.parse(data).settings.name,
      })),
    });
  });
  app.post("/api/subscriptions/:id/approve", async (req, res) => {
    requireOwner(req.user, "subscriptions");
    await transaction(db,async()=>{
    const row = await db
      .prepare("SELECT vendor_id FROM subscription_history WHERE id=? AND kind='payment'")
      .get(req.params.id);
    if (!row) throw bad("Payment request not found.",404);
    const vendor = await db
      .prepare("SELECT * FROM vendors WHERE id=? FOR UPDATE")
      .get(row.vendor_id);
    await subscriptionAction(db, req.user, vendor, {
      type: "subscription_approve",
      id: req.params.id,
    });
    });
    res.json({ ok: true });
  });
  app.post("/api/subscriptions/:id/reject",async(req,res)=>{
    requireOwner(req.user,"subscriptions");
    const reason=String(req.body.reason||"").trim();
    if(!reason||reason.length>150) throw bad("Enter a rejection reason (up to 150 characters).");
    await transaction(db,async()=>{
      const row=await db.prepare("SELECT vendor_id FROM subscription_history WHERE id=? AND kind='payment' AND status='pending' FOR UPDATE").get(req.params.id);
      if(!row) throw bad("Pending vendor subscription not found.",404);
      await db.prepare("UPDATE subscription_history SET status='rejected',approved_at=?,actor=? WHERE id=?").run(Date.now(),req.user.id,req.params.id);
      await recordActivity(db,{actorId:req.user.id,vendorId:row.vendor_id,scope:"vendor",category:"subscription",title:"Subscription payment declined",detail:reason,route:"Pricing"});
    });
    res.json({ok:true});
  });
}
