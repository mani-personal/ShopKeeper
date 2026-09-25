# ShopKeeper admin inventory, receipts, scanning and subscriptions

## GitHub files to update

| Path | Change |
| --- | --- |
| `frontend/App.tsx` | POS single scan and optional multi scan; vendor subscription approvals compatibility |
| `frontend/admin-console.tsx` | Vendor and wholesale work areas, exports, admin profile and notifications |
| `frontend/notifications.tsx` | Pass selected notification to navigation |
| `frontend/pricing.tsx` | Vendor extension requests |
| `frontend/styles.css` | Responsive scan controls and admin layout |
| `frontend/subscription-approvals.tsx` | Separate vendor and wholesale payment and extension review |
| `frontend/wholesale-portal.tsx` | Wholesale extension request form |
| `lib/receipt.ts` | Receipt MRP and savings |
| `server/domain/receipt.mjs` | Generated receipt module, for projects committing built server modules |
| `server/activities.mjs` | Admin subscription request notifications |
| `server/businesses.mjs` | Authorized CSV exports for retail and wholesale inventory |
| `server/subscriptions.mjs` | Vendor extension requests and admin review |
| `server/wholesale-subscriptions.mjs` | Wholesale extension requests and admin review |
| `tests/receipt.test.mjs` | Receipt calculation checks |

## GitHub file to add

`tests/admin-inventory-extensions.test.mjs` checks export permission, extension requests, owner approval and repeated approval protection. Add this guide if you want the instructions in the repository.

## Deploy

1. Copy every changed file, including the new test, preserving each folder path. If using Git, commit the files and push to the branch linked to Vercel.
2. Keep the existing database and environment variables. This update stores extension requests in the existing subscription history tables, so it adds no new migration. Your deployment must already have all earlier migrations through `015_wholesale_expenses.sql`.
3. Run `npm ci`, `npm run build`, `npx tsc --noEmit`, and `npm test`. Deploy the resulting commit to Vercel.
4. In the admin dashboard, open **Vendors → Inventory export**, or **Vendors/Wholesalers → Accounts → Export all inventory**. Open a business to export just its inventory. Use **Subscriptions** in each work area to approve payments or review extension requests.

Subscription extensions do not add days until an administrator approves them. Approvals add days after any remaining validity; declines preserve current validity. The receipt shows product MRP only where the saved sale has one. “You saved” includes bill discounts and the MRP difference on items with recorded MRPs; when every item has an MRP, it explicitly says “vs MRP.”
