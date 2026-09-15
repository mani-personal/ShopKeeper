import { openDatabase, transaction } from '../server/db.mjs';
import { email, hashPassword } from '../server/security.mjs';
const db = openDatabase(process.env.DATABASE_URL);
try {
    const mail = email(process.env.RESET_EMAIL), hash = await hashPassword(process.env.RESET_PASSWORD);
    await transaction(db, async () => { const user = await db.prepare('SELECT id FROM users WHERE email=?').get(mail); if (!user)
        throw Error('Account not found.'); await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, user.id); await db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); await db.prepare("DELETE FROM tokens WHERE email=? AND kind='reset'").run(mail); });
    console.log('Password updated; existing sessions revoked.');
}
finally {
    await db.close();
}
