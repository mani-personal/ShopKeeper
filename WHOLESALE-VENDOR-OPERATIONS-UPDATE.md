# Vendor and wholesale operations update

Upload the changed source files at their exact paths in GitHub. **The new migration is required:** `migrations/013_offline_wholesale_vendors_weight.sql`. The app's database bootstrap runs pending migrations automatically during deployment. Keep the existing `DATABASE_URL` and other Vercel environment variables.

## Updated files

- `frontend/App.tsx`
- `frontend/inventory-import.tsx`
- `frontend/notifications.tsx`
- `frontend/styles.css`
- `frontend/vendor-wholesale.tsx`
- `frontend/wholesale-invoice-dialog.tsx`
- `frontend/wholesale-portal.tsx`
- `lib/store.ts`
- `lib/wholesale-invoice.ts`
- `server/activities.mjs`
- `server/app.mjs`
- `server/db.mjs`
- `server/domain/store.mjs`
- `server/marketplace.mjs`
- `server/wholesale.mjs`
- `tests/marketplace.test.mjs`
- `tests/permissions-wholesale.test.mjs`

## New files

- `frontend/offline-vendors.tsx`
- `migrations/013_offline_wholesale_vendors_weight.sql`
- `WHOLESALE-VENDOR-OPERATIONS-UPDATE.md` (these notes)

## What changed

- A visible renewal warning appears at 5 days or less for vendor and wholesale subscriptions.
- Wholesale manages contacts outside ShopKeeper separately, with a dated sale, payment, refund and balance ledger. Offline contacts cannot log in or see the online catalogue. Payment entries use the server's timestamp.
- Wholesale payment history and invoices show payment date and time. Invoice columns align in print and remain scrollable on narrow screens.
- Wholesale requests appear as tiles with separate open and completed/cancelled views.
- Vendors and wholesalers see only transaction and subscription activity notifications. Admin sees support/query and pending renewal requests, rather than general operations.
- Dashboard Help and Support panels are removed; Support remains accessible from the account menu.
- Low stock links open filtered inventory. Wholesale inventory now has a matching low-stock control.
- Vendor and wholesale inventory has a separate Weight / size field. Wholesale orders preserve the ordered product weight on invoice lines; existing products default to blank weight.

Run `npm ci`, `npm run build` and `npm test`. Upload all frontend, backend and migration changes together, then redeploy on Vercel. The migration adds tables/columns but does not delete existing data.
