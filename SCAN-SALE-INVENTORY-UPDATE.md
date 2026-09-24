# Scan, sale and inventory update

Upload these changed files to the matching paths in your GitHub repository:

- `components/mobile-scanner.tsx`
- `components/product-label.tsx`
- `frontend/App.tsx`
- `frontend/inventory-import.tsx`
- `frontend/styles.css`
- `lib/store.ts`
- `server/domain/store.mjs`
- `tests/business.test.mjs`
- `tests/discount.test.mjs`

New documentation: `SCAN-SALE-INVENTORY-UPDATE.md`.

What changed:

- Multi scan lists recognized products and quantities, keeps the batch confirmation control visible, and returns the vendor to the Point of Sale bill for checkout.
- The Inventory page and product form can open the mobile barcode scanner. Scanning an existing code loads its product for editing; a new code fills the draft and, when encoded in a QR code, can populate the name or MRP. Ordinary retail barcodes contain no name or MRP, so the vendor should photograph the printed product label and review details before saving.
- New products default to no automatic discount. A blank selling price uses the MRP, including CSV imports. Existing products keep their saved discount settings.
- Customers and Sales are removed from navigation. Dashboard > View all sales history opens the sales records, including invoice actions and sales export. Older `/app/sales` and `/app/customers` URLs redirect to Dashboard.

No database migration or new environment variable is required. Run `npm ci`, `npm run build`, and `npm test` before deployment. Deploy the changed source files together; `lib/store.ts` and its built server copy `server/domain/store.mjs` must match.
