# ShopKeeper global admin, transactions and expenses update

## GitHub changes from the previous v14 source

Upload every file at the exact path shown. Keep all existing files and prior migrations.

| Action | File |
| --- | --- |
| Update | `DEPLOYMENT.md` |
| Update | `frontend/App.tsx` |
| Add | `frontend/account-password.tsx` |
| Add | `frontend/admin-console.tsx` |
| Update | `frontend/admin-management.tsx` |
| Update | `frontend/main.tsx` |
| Update | `frontend/styles.css` |
| Update | `frontend/vendor-wholesale.tsx` |
| Update | `frontend/wholesale-portal.tsx` |
| Add | `migrations/015_wholesale_expenses.sql` |
| Update | `server/app.mjs` |
| Add | `server/businesses.mjs` |
| Update | `server/db.mjs` |
| Update | `server/marketplace.mjs` |
| Add | `server/reset-email.mjs` |
| Update | `server/wholesale.mjs` |
| Add | `tests/global-console.test.mjs` |
| Add | `GLOBAL-ADMIN-TRANSACTIONS-EXPENSES-UPDATE.md` |

## Before deployment

Add `RESEND_API_KEY` and `RESET_FROM_EMAIL` to the Vercel **Production** environment. The sending domain must be verified by your email provider. Existing `DATABASE_URL`, `APP_ORIGIN`, and administrator environment variables are still required. `APP_ORIGIN` must be the live site URL so emailed password links point to the correct host. Redeploy after changing environment variables.

Deploy all changed files and migration 015 in the same commit. The API runs migrations automatically at startup. The migration creates a wholesale expense table; it does not delete or change business records.

## Behavior

- The admin sign-in opens a global console with searchable vendor and wholesale lists. An admin can create either account directly, review account details and manage business settings and subscriptions. New accounts can sign in immediately. Create a strong initial password and share it privately.
- Vendor and wholesale transaction records are grouped under Transactions. Records include payments, returns and refunds, with order history available from the selected record.
- Wholesale expenses are recorded by the wholesaler, and their totals appear on the wholesale dashboard and inventory report. Expenses are scoped to one wholesale business.
- Completed and cancelled wholesale orders have search, date filters and expandable details.
- Account settings allow signed-in password changes. Forgot password emails a single-use 30-minute reset link; the API never returns the code. No email is sent if an account does not exist.
- The previous invite/activation API remains for existing integrations and pending invitations, but the new admin and sign-in screens use direct account creation and email recovery. Once old invitations are resolved, that compatibility API can be retired separately.

Verify after deployment by creating a test vendor and wholesale account, recording an expense, opening Transactions, and requesting a recovery email. The backend suite runs with `npm test`; build with `npm run build`.
