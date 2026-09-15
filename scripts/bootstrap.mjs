import { openDatabase } from '../server/db.mjs';
import { bootstrap } from '../server/bootstrap.mjs';
const db = openDatabase(process.env.DATABASE_URL);
try {
    console.log(await bootstrap(db, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, seedDemo: process.env.SEED_DEMO === 'true' }) ? 'Administrator and initial stores created.' : 'Administrator already exists; nothing changed.');
}
finally {
    await db.close();
}
