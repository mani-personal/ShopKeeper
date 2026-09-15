# Deploy Shopkeeper to Vercel

You need a Vercel account, a GitHub repository and a hosted PostgreSQL database. This package uses Neon PostgreSQL and Vercel Functions. No separate API host is required.

## 1. Upload the source

Extract the ZIP and upload the **contents of shopkeeper-vercel** to a new GitHub repository. package.json, vercel.json and the api folder must be at the repository root. Include package-lock.json. Do not commit .env, node_modules or credentials.

## 2. Import into Vercel

In Vercel, choose Add New → Project and import the repository. Select the Vite framework and Node.js 24.x. The included vercel.json sets:

- Install: npm ci --ignore-scripts
- Build: npm run build
- Output: dist

If the repository contains the enclosing shopkeeper-vercel directory, choose that directory as Root Directory.

## 3. Connect PostgreSQL

Create/connect a Neon database through the Vercel Marketplace Storage integration, or create a Neon project separately. Choose a region close to your Vercel function region.

Copy the **pooled PostgreSQL connection URL** with SSL enabled into DATABASE_URL. A typical host contains “-pooler”; use the actual connection string provided by Neon. Keep all query parameters, including sslmode=require. If the integration uses a different variable name, explicitly add DATABASE_URL with that connection string.

References: [Vercel Marketplace storage](https://vercel.com/docs/marketplace-storage) and [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).

## 4. Configure environment variables

Add these as private **Production** environment variables in Vercel Project Settings:

| Name | Value |
| --- | --- |
| DATABASE_URL | Your pooled Neon PostgreSQL URL |
| APP_ORIGIN | Exact canonical HTTPS URL, e.g. https://my-shopkeeper.vercel.app — no trailing slash |
| ADMIN_EMAIL | Your owner login email |
| ADMIN_PASSWORD | Your own strong 12–128 character password |
| SEED_DEMO | true for demo stores on first initialization, otherwise false |

Do not prefix secrets with VITE_. The frontend and API share one domain; no API URL or public database key is required.

If you do not yet know the production URL, complete the initial deployment to obtain it, set APP_ORIGIN and redeploy before using the app. Use the canonical production URL, not the changing deployment URL. Adding/changing environment variables requires redeployment.

Use a separate database or Neon branch for previews. Do not connect untrusted preview deployments to the production database. If testing authenticated previews, configure their exact APP_ORIGIN separately.

## 5. Deploy and initialize

Click Deploy (or Redeploy after environment changes). The frontend is static; /api/* routes use the included Node function.

The first API request applies migrations under a database advisory lock and creates the owner and sample stores if configured. There is no database secret needed during the build. Open /api/health on your production domain; expect {"status":"ok"}.

Sign in using ADMIN_EMAIL and ADMIN_PASSWORD. After successful initialization, remove ADMIN_PASSWORD from Vercel and redeploy. The existing owner's hashed password remains in the database; future starts do not recreate it. Configure bootstrap credentials again only when intentionally starting a new empty database.

Check Function logs if the API returns 503. Common causes are an unavailable database, invalid DATABASE_URL, missing initial owner credentials or missing HTTPS APP_ORIGIN.

## 6. Create vendor logins

1. Sign in as owner and create/open a store from Vendors.
2. Open Vendor access, enter the vendor email and generate an activation link.
3. Share the private link with that vendor.
4. The vendor opens it, enters their email and chooses a password.
5. Existing accounts can redeem another store's code under Account.

Each vendor sees only assigned stores. The owner can revoke access and generate password-reset links. Invitations expire after seven days and resets after one hour. Email is not sent automatically.

## 7. Check scanning and persistence

On an Android or iPhone browser, open the HTTPS production URL and allow camera access. Use Scan in billing to add a known barcode to the bill; enter product details for an unknown code in Inventory. USB/Bluetooth keyboard scanners can type into barcode fields. Photo decoding and manual entry are fallbacks.

In the bill import screen, photograph/upload a supplier bill, review every extracted name, barcode, quantity, cost and selling price, then confirm. OCR can misread bill layouts. Confirmed imports update the currently selected store.

Set a stock target and a low-stock percentage in Settings. The threshold is floor(target × percentage / 100).

Before operational use, create a test product and sale, reload, redeploy and confirm the saved data remains. Test two vendor accounts for isolation and test your real phone camera and actual bill layouts.

## Maintenance

A custom domain requires updating APP_ORIGIN to its exact HTTPS origin and redeploying. Use that domain consistently for login and API changes.

Use Neon's backup/restore facilities and verify your plan's retention, or schedule PostgreSQL pg_dump backups to private off-site storage. A Vercel code rollback does not roll back database changes. Test restoration before relying on it.

For manual schema initialization from your machine with DATABASE_URL in .env:

```sh
npm run db:setup
```

For emergency owner recovery, set RESET_EMAIL and RESET_PASSWORD privately in a local .env that points to the intended database, run `npm run reset-password`, then remove both variables. This invalidates existing sessions.

Keep migrations immutable after application. Add ordered versions to server/db.mjs when introducing schema changes; the included migration is version 1. Monitor database size, function errors and service quotas. Hosting/database costs depend on the plans you select.

## Troubleshooting

- **Origin not allowed:** APP_ORIGIN must match the browser origin exactly, without a trailing slash.
- **Login cookie missing:** use HTTPS and the configured canonical domain.
- **API 503:** inspect Vercel Function logs and verify database/bootstrap environment variables.
- **Camera blocked:** allow permission; try photo upload or manual code entry.
- **Inventory changed:** refresh before resubmitting a product edit.
- **No demo data:** SEED_DEMO is applied only when the first owner is created.
- **Build errors:** use Node 24 and the supplied lockfile.

See [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js) for runtime details. This package is prepared for deployment; it has not been deployed into your Vercel account.
