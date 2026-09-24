# Store categories, batch barcode scans, and employee designations

## Deploy

Upload the complete source in `ShopKeeper-Categories-MultiScan-v9.zip` to your GitHub repository, preserving its directory structure. Run your normal Vercel deployment. The database migrator applies `migrations/011_categories_designations.sql` on server startup; the database account must have permission to alter the `wholesalers` and `users` tables. Take a database backup before deploying the migration.

Existing wholesale businesses default to **General store**, and existing employees retain their existing access under the **Custom (existing)** designation. Set a different wholesale category in Wholesale Settings if necessary.

## New files

- `migrations/011_categories_designations.sql`
- `server/designations.mjs`
- `server/domain/barcode-batch.mjs` (generated backend module, included for deployment)
- `frontend/designations.ts`
- `lib/barcode-batch.ts`
- `tests/barcode-batch.test.mjs`
- `CATEGORY-BATCH-DESIGNATIONS-UPDATE.md`

## Updated files

- `server/db.mjs`
- `server/app.mjs`
- `server/wholesale.mjs`
- `server/marketplace.mjs`
- `server/employees.mjs`
- `scripts/build-server.mjs`
- `components/mobile-scanner.tsx`
- `frontend/App.tsx`
- `frontend/wholesale-portal.tsx`
- `frontend/employees.tsx`
- `frontend/styles.css`
- `tests/marketplace.test.mjs`

## How to use

In Vendor Settings, select a store category. Wholesale administrators choose their business category when creating a wholesale account; a wholesale owner can update it in Wholesale Settings. The wholesale Vendors list and vendor product catalogue show businesses in the same category. Past orders and payment records remain available when a category changes.

In vendor Point of sale, open the camera barcode scanner and scan several products in one session. Review quantities and tap **Add scanned items**. In wholesale Requests, select **Scan items to pack** on an approved order, scan its items, and submit the batch. Matching all barcoded quantities marks the order packed. Products without a barcode can use the existing manual packing action. In browsers that support native `BarcodeDetector`, multiple visible barcodes can be read from one camera frame or photo; other browsers support consecutive scans in one session and photo region scanning. Identical product labels use the **+** control to adjust quantity.

In Vendor or Wholesale Employees, choose a designation, then select the allowed subset of its access permissions. The server enforces that designation's permission limit and the creator's own permission limit. Updating permissions signs that employee out so their new access applies at next login.

## Verification

`npm run build`, `npx tsc --noEmit`, and `npm test` passed (25 tests). Live camera performance depends on the phone, lighting, focus, and browser support; test with your own product labels.
