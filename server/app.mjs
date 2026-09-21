import {registerAdminRoutes} from './admins.mjs';
import {registerAssetRoutes} from './assets.mjs';
import {pricing,validity,subscriptionInfo,subscriptionAction,savePricing} from './subscriptions.mjs';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { transaction } from './db.mjs';
import { email, hashPassword, verifyPassword, readSession, startSession, clearSession, limit, digest, token, allowedVendors, requireVendor, requireOwner, requireActiveAccount, suspensionError, isAdmin } from './security.mjs';
import { initial, mutate, isLow } from './domain/store.mjs';
import { businessTypes } from './domain/vendors.mjs';
const bad = (message, status = 400) => Object.assign(Error(message), { status });
export function createApp(db, { appOrigin = 'http://localhost:3000', secure = false, trustProxy = false, frontend = 'dist' } = {}) {
    const app = express();
    app.disable('x-powered-by');
    if (trustProxy)
        app.set('trust proxy', 1);
    app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(self), microphone=()' }); if (secure)
        res.set('Strict-Transport-Security', 'max-age=31536000'); if (req.path.startsWith('/api'))
        res.set('Cache-Control', 'no-store'); next(); });
    app.use('/api', (req, res, next) => { if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        if (req.get('origin') !== appOrigin)
            return res.status(403).json({ error: 'Request origin is not allowed.' });
        if (!req.is('application/json'))
            return res.status(415).json({ error: 'Send application/json.' });
    } next(); });
    app.use(express.json({ limit: '3mb' }));
    app.get('/api/health', async (_req, res) => { await db.prepare('SELECT 1').get(); res.json({ status: 'ok' }); });
    app.get('/api/pricing',async(_req,res)=>res.json(await pricing(db)));
    app.post('/api/auth/login', async (req, res) => { const mail = email(req.body.email); await limit(db, 'login-ip:' + digest(req.ip || ''), 30); await limit(db, 'login-email:' + digest(mail), 10); const user = await db.prepare('SELECT * FROM users WHERE email=?').get(mail); const dummy = 'scrypt:00000000000000000000000000000000:' + ('00'.repeat(64)); const valid = await verifyPassword(req.body.password, user?.password_hash ?? dummy); if (!user || !valid || user.disabled)
        throw bad('Email or password is incorrect.', 401); if(req.body.portal==='super-admin'&&user.role!=='owner')throw bad('Super admin access required.',403); if(req.body.portal==='admin'&&!isAdmin(user))throw bad('Use a vendor sign-in for this account.',403); await requireActiveAccount(db,user); res.json(await startSession(db, res, user, secure)); });
    app.post('/api/auth/activate', async (req, res) => { await limit(db, 'activation:' + digest(req.ip || ''), 20); const mail = email(req.body.email); if (typeof req.body.token !== 'string' || req.body.token.length > 200)
        throw bad('Invalid activation token.'); const key = digest(req.body.token.trim()); const invite = await db.prepare("SELECT * FROM tokens WHERE hash=? AND kind='invite' AND email=? AND expires>?").get(key, mail, Date.now()); if (!invite)
        throw bad('Activation code is invalid or expired.', 400); const existing = await db.prepare('SELECT * FROM users WHERE email=?').get(mail); if (existing)
        throw bad('This account already exists. Sign in, then redeem the code under Account.', 409); const hash = await hashPassword(req.body.password); const id = randomUUID(); await transaction(db, async () => { const store=await db.prepare('SELECT suspended FROM vendors WHERE id=? FOR UPDATE').get(invite.vendor_id); if(store?.suspended)throw suspensionError(); const current = await db.prepare("SELECT * FROM tokens WHERE hash=? AND expires>? FOR UPDATE").get(key, Date.now()); if (!current)
        throw bad('Activation code was already used.'); await db.prepare('INSERT INTO users(id,email,password_hash,role,name,created_at) VALUES(?,?,?,?,?,?)').run(id, mail, hash, 'vendor', mail.split('@')[0], Date.now()); await db.prepare('INSERT INTO memberships VALUES(?,?)').run(id, current.vendor_id); await db.prepare('DELETE FROM tokens WHERE hash=?').run(key); }); res.json(await startSession(db, res, { id, email: mail, role: 'vendor', name: mail.split('@')[0] }, secure)); });
    app.post('/api/auth/reset', async (req, res) => { await limit(db, 'reset:' + digest(req.ip || ''), 20); const mail = email(req.body.email); if (typeof req.body.token !== 'string' || req.body.token.length > 200)
        throw bad('Invalid reset token.'); const key = digest(req.body.token.trim()); const record = await db.prepare("SELECT * FROM tokens WHERE hash=? AND kind='reset' AND email=? AND expires>?").get(key, mail, Date.now()); if (!record)
        throw bad('Reset code is invalid or expired.'); const hash = await hashPassword(req.body.password); await transaction(db, async () => { if (!await db.prepare('SELECT 1 FROM tokens WHERE hash=? AND expires>? FOR UPDATE').get(key, Date.now()))
        throw bad('Reset code was already used.'); await db.prepare('UPDATE users SET password_hash=? WHERE email=?').run(hash, mail); await db.prepare('DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE email=?)').run(mail); await db.prepare("DELETE FROM tokens WHERE email=? AND kind='reset'").run(mail); }); res.json({ ok: true }); });
    app.use('/api', async (req, res, next) => { const user = await readSession(db, req); if (!user)
        return res.status(401).json({ error: 'Sign in to continue.' }); req.user = user; if(req.path!=='/auth/logout')await requireActiveAccount(db,user); if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-csrf-token') !== user.csrf)
        return res.status(403).json({ error: 'Session verification failed. Refresh and try again.' }); next(); });
    registerAdminRoutes(app,db);
    registerAssetRoutes(app,db);
    app.get('/api/auth/me', (req, res) => res.json({ user: { id: req.user.id, email: req.user.email, role: req.user.role, name: req.user.name }, csrf: req.user.csrf }));
    app.post('/api/auth/logout', async (req, res) => { await clearSession(db, res, req, secure); res.json({ ok: true }); });
    app.post('/api/auth/password', async (req, res) => { await limit(db, 'password:' + req.user.id, 10); const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id); if (!await verifyPassword(req.body.currentPassword, user.password_hash))
        throw bad('Current password is incorrect.', 403); const hash = await hashPassword(req.body.password); await transaction(db, async () => { await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, user.id); await db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); }); res.json(await startSession(db, res, user, secure)); });
    async function access() { return { members: await db.prepare('SELECT u.id as "userId",u.email,m.vendor_id as "vendorId" FROM memberships m JOIN users u ON u.id=m.user_id').all(), invites: await db.prepare('SELECT email,vendor_id as "vendorId",expires FROM tokens WHERE kind=\'invite\' AND expires>?').all(Date.now()) }; }
    async function payload(user, id) { const config=await pricing(db); const rows = await allowedVendors(db, user); if (id)
        await requireVendor(db, user, id); const row = rows.find(v => v.id === id) ?? rows[0]; const vendors = rows.map(v => { const s = JSON.parse(v.data); return { id: v.id, name: s.settings.name, owner: v.owner_name, type: v.business_type, demo: s.demo, products: s.products.length, sales: s.sales.length, revenue: s.sales.reduce((n, x) => n + x.total, 0), low: s.products.filter(p => isLow(p, s)).length, phone: s.settings.phone, ...validity(v,config.trialDays), suspended:v.suspended, suspensionReason:v.suspension_reason, accessChangedAt:v.access_changed_at }; }); return { logo:row?.logo_image??null, pricing:config,subscription:row?await subscriptionInfo(db,row,config):null, state: row ? JSON.parse(row.data) : initial(), version: row?.version ?? 0, vendorId: row?.id ?? '', vendors, role: user.role, email: user.email, ...(isAdmin(user) ? { access: await access() } : {}) }; }
    app.get('/api/store', async (req, res) => res.json(await payload(req.user, typeof req.query.vendor === 'string' ? req.query.vendor : undefined)));
    app.get('/api/vendors', async (req, res) => res.json({ vendors: (await payload(req.user)).vendors }));
    app.get('/api/vendors/:id/access', async (req,res)=>{await requireVendor(db,req.user,req.params.id);res.json({ok:true})});
    app.get('/api/vendors/:id/products', async (req, res) => { const s = JSON.parse((await requireVendor(db, req.user, req.params.id)).data); const q = String(req.query.q ?? '').toLowerCase(); res.json({ products: s.products.filter(p => (p.name + ' ' + p.barcode).toLowerCase().includes(q)) }); });
    app.get('/api/vendors/:id/barcode/:code', async (req, res) => { const s = JSON.parse((await requireVendor(db, req.user, req.params.id)).data), product = s.products.find(p => p.barcode === req.params.code); if (!product)
        throw bad('Product not found.', 404); res.json({ product }); });
    async function action(req, res) {
        const user = req.user, a = req.body;
        let selected = req.params.id ?? a.vendorId, code;
        await transaction(db, async () => {
            if(a.type==='pricing_update'){await savePricing(db,user,a);}
            else if (a.type === 'vendor_create') {
                requireOwner(user);
                if (typeof a.id !== 'string' || !/^vendor-[a-f0-9-]{36}$/.test(a.id))
                    throw bad('Invalid vendor identifier.');
                for (const key of ['name', 'owner'])
                    if (typeof a[key] !== 'string' || !a[key].trim() || a[key].length > 150)
                        throw bad('Store and owner names are required.');
                if (!businessTypes.includes(a.businessType) || typeof a.phone !== 'string' || a.phone.length > 30)
                    throw bad('Invalid vendor details.');
                const s = initial();s.trialStartedAt=new Date().toISOString();
                s.settings = { name: a.name.trim(), phone: a.phone, address: '', lowPercent: 20 };
                if (!await db.prepare('SELECT 1 FROM vendors WHERE id=?').get(a.id))
                    await db.prepare('INSERT INTO vendors(id,owner_name,business_type,data,trial_days) VALUES(?,?,?,?,?)').run(a.id, a.owner.trim(), a.businessType, JSON.stringify(s),(await pricing(db)).trialDays);
                selected = a.id;
            }
            else if (a.type === 'claim_access') {
                if (typeof a.code !== 'string' || a.code.length > 200)
                    throw bad('Invalid code.');
                const hash = digest(a.code.trim());
                const candidate = await db.prepare("SELECT * FROM tokens WHERE hash=? AND email=? AND kind='invite' AND expires>?").get(hash, user.email, Date.now());
                if (!candidate) throw bad('Code is invalid, expired or assigned to another account.');
                const targetStore=await db.prepare('SELECT suspended FROM vendors WHERE id=? FOR UPDATE').get(candidate.vendor_id); if(targetStore?.suspended)throw suspensionError();
                const invite = await db.prepare("SELECT * FROM tokens WHERE hash=? AND email=? AND kind='invite' AND expires>? FOR UPDATE").get(hash, user.email, Date.now());
                if (!invite)
                    throw bad('Code is invalid, expired or assigned to another account.');
                await db.prepare('INSERT OR IGNORE INTO memberships VALUES(?,?)').run(user.id, invite.vendor_id);
                await db.prepare('DELETE FROM tokens WHERE hash=?').run(hash);
                selected = invite.vendor_id;
            }
            else {
                const vendor = await requireVendor(db, user, selected);
                if(['subscription_order','subscription_reference','subscription_approve','subscription_extend'].includes(a.type)){await subscriptionAction(db,user,vendor,a);}
                else if (a.type === 'vendor_suspend' || a.type === 'vendor_reactivate') {
                    requireOwner(user);
                    if(typeof a.expectedSuspended!=='boolean'||a.expectedSuspended!==vendor.suspended)throw bad('Store access status changed. Refresh and try again.',409);
                    const suspended=a.type==='vendor_suspend';
                    const reason=suspended?'Subscription payment pending':'';
                    await db.prepare('UPDATE vendors SET suspended=?,suspension_reason=?,access_changed_at=?,access_changed_by=?,version=version+1 WHERE id=?').run(suspended,reason,Date.now(),user.id,selected);
                }
                else if (a.type === 'invite_vendor') {
                    requireOwner(user);
                    const mail = email(a.email);
                    code = token();
                    await db.prepare("DELETE FROM tokens WHERE email=? AND vendor_id=? AND kind='invite'").run(mail, selected);
                    await db.prepare('INSERT INTO tokens VALUES(?,?,?,?,?)').run(digest(code), mail, selected, 'invite', Date.now() + 7 * 86400000);
                }
                else if (a.type === 'reset_vendor_password') {
                    requireOwner(user);
                    const mail = email(a.email);
                    const target = await db.prepare("SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=? AND m.vendor_id=? AND u.role='vendor'").get(mail, selected);
                    if (!target)
                        throw bad('Vendor account not found.');
                    code = token();
                    await db.prepare("DELETE FROM tokens WHERE email=? AND kind='reset'").run(mail);
                    await db.prepare('INSERT INTO tokens VALUES(?,?,?,?,?)').run(digest(code), mail, selected, 'reset', Date.now() + 3600000);
                }
                else if (a.type === 'revoke_access') {
                    requireOwner(user);
                    const mail = email(a.email);
                    await db.prepare('DELETE FROM memberships WHERE vendor_id=? AND user_id=(SELECT id FROM users WHERE email=?)').run(selected, mail);
                    await db.prepare('DELETE FROM tokens WHERE vendor_id=? AND email=?').run(selected, mail);
                }
                else {
                    const safe = ['product', 'sale', 'purchase', 'bill_import', 'contact', 'expense', 'settings', 'supplier_return', 'supplier_payment', 'purchase_settlement', 'subscription_request', 'start_trial', 'inventory_import'];
                    if (!safe.includes(a.type))
                        throw bad('Unknown action.');
                    const key = ['sale', 'purchase', 'bill_import', 'inventory_import', 'supplier_return', 'supplier_payment', 'purchase_settlement'].includes(a.type) ? a.type + ':' + a.id : null;
                    const hash = digest(JSON.stringify(a));
                    if (key) {
                        const previous = await db.prepare('SELECT digest FROM commands WHERE vendor_id=? AND key=?').get(selected, key);
                        if (previous) {
                            if (previous.digest !== hash)
                                throw bad('This operation ID was used with different data.', 409);
                            return;
                        }
                    }
                    if (a.type === 'sale' && !(validity(vendor,(await pricing(db)).trialDays).validUntil > Date.now()))
                        throw bad('Subscription expired or inactive. Renew your plan and wait for administrator approval before making sales.', 403);
                    if (a.type === 'product' && a.version !== vendor.version)
                        throw bad('Inventory changed. Refresh before saving this product.', 409);
                    const s = JSON.parse(vendor.data);
                    if(a.type==='start_trial'&&!s.trialStartedAt)await db.prepare('UPDATE vendors SET trial_days=? WHERE id=?').run((await pricing(db)).trialDays,selected);
                    try {
                        mutate(s, a);
                    }
                    catch (e) {
                        throw bad(e.message);
                    }
                    const data = JSON.stringify(s);
                    if (data.length > 10000000)
                        throw bad('This store has reached its data limit. Archive older records before continuing.', 413);
                    await db.prepare('UPDATE vendors SET data=?,version=version+1 WHERE id=?').run(data, selected);
                    if (key)
                        await db.prepare('INSERT INTO commands VALUES(?,?,?)').run(selected, key, hash);
                }
            }
            await db.prepare('INSERT INTO audit(created_at,user_id,vendor_id,action) VALUES(?,?,?,?)').run(Date.now(), user.id, selected ?? null, a.type);
        });
        res.json({ ...await payload(user, selected), ...(code ? { accessCode: code } : {}) });
    }
    app.post('/api/store', action);
    app.post('/api/vendors/:id/actions', action);
    app.get('/api/audit', async (req, res) => { requireOwner(req.user); res.json({ events: await db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all() }); });
    app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
    const root = resolve(frontend);
    if (existsSync(root)) {
        app.use(express.static(root, { index: false }));
        app.get('/{*path}', (_req, res) => res.sendFile(resolve(root, 'index.html')));
    }
    app.use((err, req, res, _next) => { if (!err.status || err.status >= 500)
        console.error('Request failed', req.method, req.path, err.message); res.status(err.status ?? 500).json({ error: err.status ? err.message : 'Could not complete the request. Please retry.', ...(err.code==='VENDOR_SUSPENDED'?{code:err.code}:{}) }); });
    return app;
}
