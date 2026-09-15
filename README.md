# Shopkeeper — Vercel edition

A React/Vite frontend, Node.js Vercel Functions API and PostgreSQL database for independent local shops. Includes the complete source, migrations, lockfile and tests. Read **DEPLOYMENT.md** to publish it and **API.md** for endpoints.

## Included

- Owner administration and separate vendor email/password accounts with server-enforced store access.
- Inventory, dashboard, sales, purchases, expenses, customers, suppliers, receipts and reports.
- Percentage low-stock settings, stock targets and optional demo stores.
- Mobile rear-camera barcode scanner, camera selection, barcode image upload, manual entry and keyboard scanners.
- Supplier bill photo OCR with editable review before importing items into the selected vendor's inventory.
- Password hashing, secure cookie sessions, CSRF checks, invitations, password recovery and access revocation.
- Transactional stock updates, duplicate sale/import protection, stale product-edit detection and audit records.

## Local setup

Install Node.js 24, copy .env.example to .env and enter a PostgreSQL connection URL, your email and password.

```sh
npm ci --ignore-scripts
npm run build
npm test
npm start
```

Open http://localhost:3000. Startup applies the migration and creates the owner only if absent.
For development, run `npm run dev:api` and `npm run dev` in separate terminals and set APP_ORIGIN=http://localhost:5173.

## Source map

- api/index.js: Vercel Function entry and first-request initialization
- vercel.json: frontend build, API routing and function bundling
- server/: PostgreSQL adapter, authentication, API and bootstrap
- migrations/: versioned SQL schema
- lib/: typed stock, billing and vendor rules
- frontend/: React application and login screens
- components/mobile-scanner.tsx: barcode camera and photo scanning
- components/bill-scanner.tsx: bill OCR and reviewed import
- scripts/: build, migration, owner setup and emergency password reset
- tests/: HTTP integration checks and synthetic barcode decoding

## Scope

This starts a new database; existing Sites or SQLite data and accounts are not migrated. Each store is a versioned JSON document in PostgreSQL with a 10 MB limit. Store updates take a database row lock. This suits modest-volume shops; large catalogs and reporting workloads would benefit from normalized product and transaction tables.

Payments are recorded rather than processed. Low-stock alerts appear in the app. The owner shares invitation/reset links manually; email delivery is not configured. Sessions last eight hours. Stock quantities are whole units and amounts are rupees.

Camera access requires HTTPS or localhost and browser permission. Bill OCR handles English printed image files, requires review, downloads engine/language assets on first use, and does not support PDF or handwriting. Bill images are processed in the browser and are not archived. Offline inventory writes are not supported.

## Verification

Production frontend build, TypeScript checking and API tests are included. Integration tests run against embedded PostgreSQL (PGlite) through real HTTP requests, covering authentication, vendor access, CSRF, stale edits, concurrent sale requests, idempotency, rollback, thresholds, reset and revocation. A test-only connection mutex serializes this single-connection engine; advisory locking and multi-instance PostgreSQL behavior require staging verification. The scanner test decodes a synthetic QR image.

A live Vercel/Neon deployment and physical Android/iPhone camera checks have not been performed.
"# ShopKeeper" 
