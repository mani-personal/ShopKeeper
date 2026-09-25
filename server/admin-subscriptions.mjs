import { requirePermission } from "./security.mjs";
import { validity } from "./subscriptions.mjs";
import { wholesaleValidity } from "./wholesale-subscriptions.mjs";

const bad = (message) => Object.assign(Error(message), { status: 400 });
const nameOf = (vendor) => JSON.parse(vendor.data).settings.name;
const number = (value) => Number(value || 0);

export function registerAdminSubscriptionRoutes(app, db) {
  app.get("/api/admin/subscriptions/dashboard", async (req, res) => {
    requirePermission(req.user, "subscriptions");
    const [vendors, wholesalers, vendorPaid, wholesalePaid] = await Promise.all([
      db.prepare("SELECT id,data,valid_until,trial_days FROM vendors ORDER BY created_at DESC").all(),
      db.prepare("SELECT user_id,business_name,valid_until,trial_started_at,trial_days,created_at FROM wholesalers ORDER BY created_at DESC").all(),
      db.prepare("SELECT vendor_id AS id,SUM(amount) AS revenue,COUNT(*) AS payments,SUM(CASE WHEN approved_at >= ? AND approved_at < ? THEN amount ELSE 0 END) AS month_revenue FROM subscription_history WHERE kind='payment' AND status='approved' GROUP BY vendor_id").all(...monthBounds()),
      db.prepare("SELECT wholesaler_id AS id,SUM(amount) AS revenue,COUNT(*) AS payments,SUM(CASE WHEN approved_at >= ? AND approved_at < ? THEN amount ELSE 0 END) AS month_revenue FROM wholesale_subscription_history WHERE kind='payment' AND status='approved' GROUP BY wholesaler_id").all(...monthBounds()),
    ]);
    const vendorPayments = new Map(vendorPaid.map(row => [row.id, row]));
    const wholesalePayments = new Map(wholesalePaid.map(row => [row.id, row]));
    const shape = (id, name, validityInfo, paid) => ({ id, name, ...validityInfo, revenue: number(paid?.revenue), monthRevenue: number(paid?.month_revenue), payments: number(paid?.payments) });
    const stores = vendors.map(v => shape(v.id, nameOf(v), validity(v), vendorPayments.get(v.id)));
    const sellers = wholesalers.map(w => shape(w.user_id, w.business_name, wholesaleValidity(w), wholesalePayments.get(w.user_id)));
    const total = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0);
    res.json({
      summary: { vendorRevenue: total(stores, "revenue"), wholesaleRevenue: total(sellers, "revenue"), vendorMonthRevenue: total(stores, "monthRevenue"), wholesaleMonthRevenue: total(sellers, "monthRevenue"), vendorCount: stores.length, wholesaleCount: sellers.length },
      vendors: stores, wholesalers: sellers,
    });
  });

  app.get("/api/admin/subscriptions/history", async (req, res) => {
    requirePermission(req.user, "subscriptions");
    const kind = req.query.kind;
    if (!['vendor', 'wholesale'].includes(kind)) throw bad('Choose vendor or wholesale history.');
    const status = req.query.status || 'all';
    if (!['all', 'pending', 'approved', 'rejected'].includes(status)) throw bad('Invalid subscription status.');
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : '';
    const page = Math.min(10000, Math.max(0, Number.parseInt(req.query.page, 10) || 0));
    const vendor = kind === 'vendor';
    const table = vendor ? 'subscription_history' : 'wholesale_subscription_history';
    const business = vendor ? 'vendors' : 'wholesalers';
    const join = vendor ? 'b.id=h.vendor_id' : 'b.user_id=h.wholesaler_id';
    const title = vendor ? "b.data::jsonb->'settings'->>'name'" : 'b.business_name';
    const where = [status === 'all' ? '' : 'h.status=?', search ? `(LOWER(${title}) LIKE ? OR LOWER(h.reference) LIKE ?)` : ''].filter(Boolean);
    const params = [...(status === 'all' ? [] : [status]), ...(search ? [`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`] : [])];
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = `FROM ${table} h JOIN ${business} b ON ${join} ${filter}`;
    const [count, rows] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS total ${from}`).get(...params),
      db.prepare(`SELECT h.*,${title} AS business_name ${from} ORDER BY h.created_at DESC,h.id DESC LIMIT 50 OFFSET ?`).all(...params, page * 50),
    ]);
    res.json({ rows, total: number(count.total), page });
  });
}

function monthBounds(now = new Date()) {
  // Subscription reporting follows the business's India calendar month.
  const india = new Date(now.getTime() + 330 * 60000);
  const start = Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), 1) - 330 * 60000;
  const end = Date.UTC(india.getUTCFullYear(), india.getUTCMonth() + 1, 1) - 330 * 60000;
  return [start, end];
}
