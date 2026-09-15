import { randomUUID } from 'node:crypto';
import { hashPassword, email } from './security.mjs';
import { transaction } from './db.mjs';
import { initial, stockTarget } from './domain/store.mjs';
import { upgradeBook } from './domain/vendors.mjs';
export async function bootstrap(db, config) { if (await db.prepare("SELECT id FROM users WHERE role='owner'").get())
    return false; if (!config.email || !config.password)
    throw Error('First launch requires ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters).'); const mail = email(config.email), hash = await hashPassword(config.password); return await transaction(db, async () => {
        await db.query('SELECT pg_advisory_xact_lock(78146322)'); if (await db.prepare("SELECT id FROM users WHERE role='owner'").get())
    return false; await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(randomUUID(), mail, hash, 'owner', 'Administrator', Date.now()); const book = upgradeBook(initial()); for (const v of config.seedDemo ? book.vendors : book.vendors.slice(0, 1)) {
    v.state.settings.lowPercent = 20;
    v.state.products.forEach(p => p.target = stockTarget(p));
    await db.prepare('INSERT INTO vendors(id,owner_name,business_type,data) VALUES(?,?,?,?)').run(v.id, v.owner, v.type, JSON.stringify(v.state));
} return true; }); }
