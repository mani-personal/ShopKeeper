import { randomUUID } from "node:crypto";
import { initial } from "./domain/store.mjs";
import { businessTypes } from "./domain/vendors.mjs";
import { email, hashPassword, requirePermission, hasPermission, limit } from "./security.mjs";
import { transaction } from "./db.mjs";
import { pricing, subscriptionInfo } from "./subscriptions.mjs";
import { wholesalePricing, wholesaleSubscriptionInfo } from "./wholesale-subscriptions.mjs";

const bad = (message, status = 400) => Object.assign(Error(message), { status });
const field = (value, max = 150) => typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : "";
function access(user, kind) { requirePermission(user, kind === "vendor" ? "stores" : "wholesale"); }
// Escape CSV cells including spreadsheet formulas supplied through product names.
export function csvCell(value) {
  const string = String(value ?? "").replace(/^\s*([=+@\-])/, "'$&");
  return '"' + string.replaceAll('"', '""') + '"';
}
const retailColumns = ["Business ID","Product ID","Business","Business category","Product","Product category","Subcategory","Barcode / SKU","Weight","Unit","MRP","Selling price","Cost price","Quantity","Minimum stock","Target stock","Discount mode","Custom discount","Status"];
const wholesaleColumns = ["Business ID","Product ID","Wholesale business","Business category","Product","Product category","Subcategory","Barcode / SKU","Weight","Unit","MRP","Wholesale price","Available stock","Minimum order quantity","Bulk quantity","Bulk unit price","GST rate (%)","HSN / SAC","Description","Visible to vendors","Created","Last updated"];
const inventoryCSV = (columns,rows) => '\uFEFF' + [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';

export function registerBusinessRoutes(app, db) {
  app.get("/api/admin/inventory/export", async (req, res) => {
    const kind = req.query.kind;
    if (!["vendor", "wholesale"].includes(kind)) throw bad("Choose vendor or wholesale inventory.");
    requirePermission(req.user, kind === "vendor" ? "inventory" : "wholesale");
    const id = typeof req.query.id === "string" ? req.query.id : null;
    const rows = [];
    if (kind === "vendor") {
      const stores = id ? await db.prepare("SELECT id,business_type,data FROM vendors WHERE id=?").all(id) : await db.prepare("SELECT id,business_type,data FROM vendors ORDER BY id").all();
      if (id && !stores.length) throw bad("Vendor not found.",404);
      for (const store of stores) {
        const state = JSON.parse(store.data);
        for (const p of state.products || []) rows.push([store.id,p.id,state.settings.name, store.business_type, p.name, p.category,p.subcategory, p.barcode, p.weight, p.unit, p.mrp, p.price, p.cost, p.stock,p.min,p.target,p.discountMode,p.customDiscount, p.stock > 0 ? "In stock" : "Out of stock"]);
      }
    } else {
      if (id && !await db.prepare("SELECT 1 FROM wholesalers WHERE user_id=?").get(id)) throw bad("Wholesale seller not found.",404);
      const products = id ? await db.prepare("SELECT p.*,w.business_name,w.business_category FROM wholesale_products p JOIN wholesalers w ON w.user_id=p.wholesaler_id WHERE w.user_id=? ORDER BY w.business_name,p.name").all(id) : await db.prepare("SELECT p.*,w.business_name,w.business_category FROM wholesale_products p JOIN wholesalers w ON w.user_id=p.wholesaler_id ORDER BY w.business_name,p.name").all();
      for (const p of products) rows.push([p.wholesaler_id,p.id,p.business_name,p.business_category,p.name,p.category,p.subcategory,p.sku,p.weight,p.unit,p.mrp,p.price,p.stock,p.min_qty,p.bulk_qty,p.bulk_price,p.gst_rate,p.hsn_code,p.description,p.active ? "Yes" : "No",new Date(Number(p.created_at)).toISOString(),new Date(Number(p.updated_at)).toISOString()]);
    }
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="shopkeeper-${kind}-inventory.csv"`);
    res.send(inventoryCSV(kind === "vendor" ? retailColumns : wholesaleColumns,rows));
  });
  app.get("/api/admin/businesses", async (req, res) => {
    const showVendors = hasPermission(req.user, "stores"), showWholesale = hasPermission(req.user, "wholesale");
    if (!showVendors && !showWholesale) throw bad("Administrator access required.", 403);
    const vendors = showVendors ? await db.prepare("SELECT v.id,v.owner_name,v.business_type,v.data,v.suspended,v.valid_until,v.trial_days,v.logo_image,(SELECT u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.vendor_id=v.id AND u.employee_permissions IS NULL ORDER BY u.created_at LIMIT 1) AS email FROM vendors v ORDER BY v.created_at DESC").all() : [];
    const wholesalers = showWholesale ? await db.prepare("SELECT w.*,u.name,u.email,u.disabled FROM wholesalers w JOIN users u ON u.id=w.user_id WHERE u.employee_permissions IS NULL ORDER BY w.created_at DESC").all() : [];
    res.json({ vendors: vendors.map(v => ({ id:v.id, name:JSON.parse(v.data).settings.name, owner:v.owner_name, email:v.email, category:v.business_type, logo:v.logo_image, suspended:v.suspended, validUntil:v.valid_until, trialDays:v.trial_days })), wholesalers: wholesalers.map(w=>({id:w.user_id,name:w.business_name,owner:w.name,email:w.email,category:w.business_category,logo:w.logo_image,disabled:w.disabled,validUntil:w.valid_until})) });
  });
  app.post("/api/admin/businesses", async (req, res) => {
    const kind = req.body.kind;
    if (!["vendor", "wholesale"].includes(kind)) throw bad("Choose vendor or wholesale.");
    access(req.user,kind);
    await limit(db, "business-create:" + req.user.id, 30);
    const name = field(req.body.name), owner = field(req.body.owner,100), category = req.body.category, mail = email(req.body.email), phone = req.body.phone || "";
    if (!name || !owner || !businessTypes.includes(category) || typeof phone !== "string" || phone.length > 30) throw bad("Enter the business, owner, and category.");
    const password = await hashPassword(req.body.password), accountId = randomUUID(), businessId = kind === "vendor" ? "vendor-" + randomUUID() : accountId;
    await transaction(db, async () => {
      await db.query("SELECT pg_advisory_xact_lock(78146323)");
      if (await db.prepare("SELECT id FROM users WHERE email=?").get(mail)) throw bad("An account already uses this email.",409);
      await db.prepare("INSERT INTO users(id,email,password_hash,role,name,created_at) VALUES(?,?,?,?,?,?)").run(accountId,mail,password,kind,owner,Date.now());
      if (kind === "vendor") {
        const state = initial(); state.trialStartedAt = new Date().toISOString(); state.settings = { ...state.settings, name, phone };
        await db.prepare("INSERT INTO vendors(id,owner_name,business_type,data,trial_days) VALUES(?,?,?,?,?)").run(businessId,owner,category,JSON.stringify(state),(await pricing(db)).trialDays);
        await db.prepare("INSERT INTO memberships(user_id,vendor_id) VALUES(?,?)").run(accountId,businessId);
      } else {
        await db.prepare("INSERT INTO wholesalers(user_id,business_name,phone,address,created_at,business_category) VALUES(?,?,?,?,?,?)").run(accountId,name,phone,"",Date.now(),category);
      }
      await db.prepare("INSERT INTO audit(created_at,user_id,vendor_id,action) VALUES(?,?,?,?)").run(Date.now(),req.user.id,kind === "vendor" ? businessId : null,"business_created:"+kind+":"+businessId);
    });
    res.json({ id:businessId, kind });
  });
  app.get("/api/admin/businesses/:kind/:id", async (req,res) => {
    const {kind,id} = req.params;
    if (!["vendor","wholesale"].includes(kind)) throw bad("Business not found.",404);
    access(req.user,kind);
    if (kind === "vendor") {
      const v=await db.prepare("SELECT * FROM vendors WHERE id=?").get(id);
      if (!v) throw bad("Vendor not found.",404);
      const state=JSON.parse(v.data), subscription=await subscriptionInfo(db,v,await pricing(db));
      const employees=hasPermission(req.user,"vendor_access") ? await db.prepare("SELECT u.id,u.name,u.email,u.employee_designation FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.vendor_id=? ORDER BY u.created_at").all(id) : [];
      const account=await db.prepare("SELECT u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.vendor_id=? AND u.employee_permissions IS NULL ORDER BY u.created_at LIMIT 1").get(id);
      const orders=await db.prepare("SELECT r.id,r.status,r.created_at,w.business_name AS other,r.vendor_id FROM wholesale_requests r JOIN wholesalers w ON w.user_id=r.wholesaler_id WHERE r.vendor_id=? ORDER BY r.created_at DESC LIMIT 100").all(id);
      const payments=await db.prepare("SELECT t.id,t.request_id,t.amount,t.payment_status,t.reference,t.created_at FROM wholesale_transactions t JOIN wholesale_requests r ON r.id=t.request_id WHERE r.vendor_id=? ORDER BY t.created_at DESC LIMIT 100").all(id);
      return res.json({kind,id,name:state.settings.name,owner:v.owner_name,email:account?.email,phone:state.settings.phone,category:v.business_type,suspended:v.suspended,subscription,employees,orders,payments,products:state.products.length,sales:state.sales.length,revenue:state.sales.reduce((n,x)=>n+Number(x.total||0),0)});
    }
    const w=await db.prepare("SELECT w.*,u.name,u.email,u.disabled FROM wholesalers w JOIN users u ON u.id=w.user_id WHERE w.user_id=? AND u.employee_permissions IS NULL").get(id);
    if (!w) throw bad("Wholesaler not found.",404);
    const subscription=await wholesaleSubscriptionInfo(db,w,await wholesalePricing(db));
    const employees=await db.prepare("SELECT u.id,u.name,u.email,u.employee_designation FROM users u JOIN wholesale_memberships m ON m.user_id=u.id WHERE m.wholesaler_id=? ORDER BY u.created_at").all(id);
    const orders=await db.prepare("SELECT r.id,r.status,r.created_at,v.data AS vendor_data FROM wholesale_requests r JOIN vendors v ON v.id=r.vendor_id WHERE r.wholesaler_id=? ORDER BY r.created_at DESC LIMIT 100").all(id);
    const payments=await db.prepare("SELECT t.id,t.request_id,t.amount,t.payment_status,t.reference,t.created_at FROM wholesale_transactions t JOIN wholesale_requests r ON r.id=t.request_id WHERE r.wholesaler_id=? ORDER BY t.created_at DESC LIMIT 100").all(id);
    res.json({kind,id,name:w.business_name,owner:w.name,email:w.email,phone:w.phone,category:w.business_category,disabled:w.disabled,subscription,employees,orders:orders.map(({vendor_data,...o})=>({...o,other:JSON.parse(vendor_data).settings.name})),payments});
  });
  app.post("/api/admin/businesses/:kind/:id", async (req,res) => {
    const {kind,id}=req.params;
    if (!["vendor","wholesale"].includes(kind)) throw bad("Business not found.",404);
    access(req.user,kind);
    const name=field(req.body.name),owner=field(req.body.owner,100),phone=req.body.phone,category=req.body.category;
    if (!name || !owner || !businessTypes.includes(category) || typeof phone!=="string" || phone.length>30) throw bad("Enter valid business details.");
    await transaction(db, async () => {
      if (kind==="vendor") {
        const row=await db.prepare("SELECT data FROM vendors WHERE id=? FOR UPDATE").get(id);
        if (!row) throw bad("Vendor not found.",404);
        const state=JSON.parse(row.data);
        state.settings={...state.settings,name,phone};
        await db.prepare("UPDATE vendors SET owner_name=?,business_type=?,data=?,version=version+1 WHERE id=?").run(owner,category,JSON.stringify(state),id);
      } else {
        const row=await db.prepare("SELECT 1 FROM wholesalers WHERE user_id=? FOR UPDATE").get(id);
        if (!row) throw bad("Wholesaler not found.",404);
        await db.prepare("UPDATE wholesalers SET business_name=?,business_category=?,phone=? WHERE user_id=?").run(name,category,phone,id);
        await db.prepare("UPDATE users SET name=? WHERE id=?").run(owner,id);
      }
      await db.prepare("INSERT INTO audit(created_at,user_id,vendor_id,action) VALUES(?,?,?,?)").run(Date.now(),req.user.id,kind==="vendor"?id:null,"business_updated:"+kind+":"+id);
    });
    res.json({ok:true});
  });
}
