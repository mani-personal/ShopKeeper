# Shopkeeper backend API

All endpoints are same-origin under `/api`. HTTPS is required in production. Responses are JSON. Authenticated sessions use an HttpOnly, SameSite=Strict cookie; production cookies also have Secure. Sessions last eight hours.

Every POST requires `Origin` equal to `APP_ORIGIN` and `Content-Type: application/json`. Authenticated POSTs additionally require `X-CSRF-Token` returned by login or `/auth/me`. Passwords use salted scrypt; session and invitation token hashes are persisted instead of raw tokens. No bearer JWT or public registration endpoint is used.

## Authentication

| Method | Endpoint | Body / purpose |
| --- | --- | --- |
| POST | `/auth/login` | `{email,password}` → session cookie, user, csrf |
| GET | `/auth/me` | Current user and csrf; 401 if signed out |
| POST | `/auth/logout` | `{}`; revoke current session |
| POST | `/auth/activate` | `{email,password,token}`; new account from a one-time vendor invitation |
| POST | `/auth/reset` | `{email,password,token}`; reset with a one-hour reset code |
| POST | `/auth/password` | `{currentPassword,password}`; authenticated password change, revoke old sessions |

Login attempts are limited by IP and email; activation/reset attempts by IP. There is no mail service: the owner distributes activation and reset links privately.

## Store API (compatible with the packaged UI)

`GET /store?vendor=VENDOR_ID` returns `{state,version,vendorId,vendors,role,email,access?}`. A vendor receives only assigned stores. The owner also receives membership and pending-invitation metadata. Password hashes and session/token hashes never appear in these responses.

`POST /store` takes an action below and `vendorId`. `POST /vendors/:id/actions` supports the same body with the store from the path. Ownership and membership are checked on the server for every action.

| type | Additional fields |
| --- | --- |
| `product` | `version`, `product:{id,name,barcode,category,unit,price,cost,stock,min,target}`; blank id creates, known id edits |
| `sale` | `id`, `items:[{id,qty}]`, `discount`, `payment` (`Cash`, `UPI`, `Card`), optional `customer` |
| `purchase` | `id`, `product` (product ID), `qty`, `cost`, `supplier` |
| `bill_import` | `id`, `supplier`, `items:[{name,barcode,category,qty,cost,price}]` |
| `contact` | `kind` (`customers` or `suppliers`), `name`, `phone` |
| `expense` | `name`, `amount` |
| `settings` | `name`, `phone`, `address`, `lowPercent` from 0 to 100 |
| `vendor_create` | Owner only: `id` (`vendor-` + UUID), `name`, `owner`, `businessType`, `phone` |
| `invite_vendor` | Owner only: `email`; returns raw `accessCode` once |
| `claim_access` | `code`; existing signed-in account adds invited store membership |
| `reset_vendor_password` | Owner only: assigned vendor `email`; returns one-hour `accessCode` |
| `revoke_access` | Owner only: `email`; removes store membership and pending tokens |

Product updates require the current store `version` to avoid overwriting stock after another sale. For sales, purchases and imports, reuse the same `id` and exact body after an uncertain network result. A repeated identical request is not applied twice. Reusing an ID with different content returns 409.

A bill import is one transaction: if any row fails, no rows or stock changes are committed. Existing barcodes add stock to their matching products; their selling price remains unchanged. New codes create products using reviewed selling prices. Historical sale lines retain the cost and selling price at the time of sale.

## Additional endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Public liveness/database check |
| GET | `/vendors` | Only stores visible to the caller |
| GET | `/vendors/:id/products?q=text` | Search visible store's products |
| GET | `/vendors/:id/barcode/:code` | Exact barcode lookup; 404 when absent |
| GET | `/audit` | Owner only; last 100 audit events |

Amounts are rupees; quantities are whole units. Products use an explicit target stock quantity. The alert threshold is `floor(target * lowPercent / 100)`.

## Storage

PostgreSQL schema is initialized from migrations/001_initial.sql, tracked in schema_migrations. Initialization uses a transaction and advisory lock. It has users, sessions, vendors, memberships, tokens, commands, audit and attempts tables.

Vendor documents contain product and transaction records. Each vendor has an independent version. Mutations lock the vendor row using SELECT FOR UPDATE inside a transaction before reading and writing stock. Session and membership checks remain authoritative on each request. Vercel instances share the hosted database through connection pools.

HTTP errors use `{error:"message"}` with 400 (validation), 401 (sign-in), 403 (authorization/origin/CSRF), 404 (missing), 409 (conflict), 413 (payload/store limit), 415 (content type), or 429 (rate limit). Unexpected internal errors return a generic 500 response.
