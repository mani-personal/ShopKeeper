import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { attachDatabasePool } from "@vercel/functions";
// Compatibility facade keeps SQL calls parameterized while the backend uses async PostgreSQL.
export function databaseFromPool(pool) {
  const context = new AsyncLocalStorage();
  function sql(query) {
    let i = 0;
    return query
      .replaceAll(
        "INSERT OR IGNORE INTO memberships VALUES(?,?)",
        "INSERT INTO memberships VALUES(?,?) ON CONFLICT DO NOTHING",
      )
      .replaceAll("ORDER BY v.rowid", "ORDER BY v.created_at,v.id")
      .replaceAll("ORDER BY rowid", "ORDER BY created_at,id")
      .replace(/\?/g, () => "$" + ++i);
  }
  const db = {
    pool,
    context,
    query: (query, values = []) =>
      (context.getStore() ?? pool).query(sql(query), values),
    prepare(query) {
      return {
        async get(...params) {
          return (await db.query(query, params)).rows[0];
        },
        async all(...params) {
          return (await db.query(query, params)).rows;
        },
        async run(...params) {
          const result = await db.query(query, params);
          return { changes: result.rowCount };
        },
      };
    },
    close: () => pool.end(),
  };
  return db;
}
export function openDatabase(url = process.env.DATABASE_URL) {
  if (!url)
    throw Error("Set DATABASE_URL to your PostgreSQL connection string.");
  const pool = new pg.Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
  });
  if (process.env.VERCEL) attachDatabasePool(pool);
  return databaseFromPool(pool);
}
export async function transaction(db, fn) {
  if (db.context.getStore()) return fn();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await db.context.run(client, fn);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function migrate(db) {
  return transaction(db, async () => {
    await db.query("SELECT pg_advisory_xact_lock(78146321)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const row = await db.query(
      "SELECT version FROM schema_migrations WHERE version=1",
    );
    if (!row.rows.length) {
      await db.query(
        readFileSync(
          new URL("../migrations/001_initial.sql", import.meta.url),
          "utf8",
        ),
      );
      await db.query("INSERT INTO schema_migrations(version) VALUES(1)");
    }
    const access = await db.query(
      "SELECT version FROM schema_migrations WHERE version=2",
    );
    if (!access.rows.length) {
      await db.query(
        readFileSync(
          new URL("../migrations/002_vendor_suspension.sql", import.meta.url),
          "utf8",
        ),
      );
      await db.query("INSERT INTO schema_migrations(version) VALUES(2)");
    }
    const migrations = {
      3: "subscriptions",
      4: "admins_branding_proofs",
      5: "permissions_wholesale",
      6: "wholesale_access_returns",
      7: "notifications_wholesale_subscriptions",
      8: "marketplace_growth",
      9: "order_payments_employees",
      10: "employee_permissions_gst",
      11: "categories_designations",
      12: "product_subcategories",
      13: "offline_wholesale_vendors_weight",
      14: "admin_account_removal",
      15: "wholesale_expenses",
    };
    for (const version of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
      if (
        !(
          await db.query(
            "SELECT version FROM schema_migrations WHERE version=?",
            [version],
          )
        ).rows.length
      ) {
        for (const sql of readFileSync(
          new URL(
            `../migrations/${String(version).padStart(3, "0")}_${migrations[version]}.sql`,
            import.meta.url,
          ),
          "utf8",
        )
          .split(";")
          .filter((x) => x.trim()))
          await db.query(sql);
        await db
          .prepare("INSERT INTO schema_migrations(version) VALUES(?)")
          .run(version);
      }
  });
}
