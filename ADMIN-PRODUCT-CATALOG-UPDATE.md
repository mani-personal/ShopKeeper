# Admin Product Catalog Setup Update

## What changed

The admin store-creation flow now supports a consolidated master product catalogue built from every existing vendor store.

For a newly created **Vendor** or **Wholesale** account, the admin can open the account and load a table containing:

- Product name
- MRP
- Category
- Sub category
- Barcode
- Weight
- Pack / Unit
- Cost price (blank by default)
- Selling price (blank by default)
- Stock (always 0 for setup import)

The admin can edit the table, select only the products to import, enter pricing, and import the selected products directly into the newly created shop.

## Deduplication

Products are consolidated by barcode when a barcode exists. If a barcode is missing, the fallback key is product name + weight + unit.

## Import rules

- 1–500 products per import.
- Product name, barcode, unit and selling price are required.
- Selling price must be greater than zero.
- For vendor stores, selling price cannot exceed MRP when MRP is supplied.
- Blank cost price becomes 0 for vendor inventory.
- Stock starts at 0.
- Existing products with the same barcode in the target shop are skipped.
- No existing product is overwritten.

## GitHub files changed

- `frontend/admin-console.tsx`
- `frontend/admin-product-setup.tsx` (new)
- `frontend/styles.css`
- `server/businesses.mjs`
- `tests/admin-product-catalog.test.mjs` (new)

No database migration is required for this update.
