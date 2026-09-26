# Retail POS and supply hub update

This package contains the complete ShopKeeper source. Use this file list only when your GitHub repository already matches the previous v20 package; otherwise upload the complete updated source to avoid missing earlier features.

## Update in GitHub

- `frontend/App.tsx` — row-based POS bill, sale-only manual rows, receipts link, date and time and sales date filter.
- `frontend/styles.css` — POS row layout and responsive manual entry and date filters.
- `frontend/supply-hub.tsx` — supplier balances within Wholesale Market.
- `lib/store.ts` — unique store-specific receipt numbers and validated sale-only items with cost.
- `lib/receipt.ts` — short bill number and no printed barcode.
- `server/domain/store.mjs` and `server/domain/receipt.mjs` — generated backend modules; upload both if you update files directly in GitHub. `npm run build` regenerates them.

## Add in GitHub

- `tests/retail-pos.test.mjs` (recommended if you keep tests in GitHub).
- `RETAIL-POS-SUPPLY-UPDATE.md` (optional deployment guide).

## Deploy

Upload the listed files with the same paths, commit them together, and redeploy on Vercel. No new environment variables or SQL migrations are required. Old sales get receipt numbers in date order when the next sale is saved; existing unique sale IDs remain intact for records and API operations. Manual sale rows do not affect inventory quantities, so add purchased stock to Inventory if you want stock tracking. Purchase cost is required for accurate margin calculations. Sales dates and receipt times display in India time.

Verification: `npm run build`, `npx tsc --noEmit`, and `npm test` (35 passing).
