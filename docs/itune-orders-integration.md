# Orders ↔ iTune integration

## Setup (both servers must be deployed)

1. Generate a random secret, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Set `ITUNE_ORDER_BRIDGE_SECRET` to the same value in the private environment of **both** applications. Never put it in Git or a `NEXT_PUBLIC_` variable.
3. In topup-inblackm set `ITUNE_ORDER_BRIDGE_URL=https://tools.inblackm.com/api/integrations/inblackm/itune`. This is the complete API URL, not the Topup page URL. HTTPS is required in production. Restart both applications with their updated environment. Keep server clocks synchronized (signature expiry is 60 seconds).
4. Ensure GameDB's saved `topup_inblackm` connection works. The GameDB primary database stores staff mappings; the iTune database stores usage history. These do not have to be the Orders database. Existing credentials remain private to iTune.
5. As a GameDB Super Admin with Projectm Admin access, open `/projectm/th/itune/admin/order-links` (also linked in Admin settings). Enter the exact **inblackm staff User ID**, not customer ID, username, display name or an assumed matching numeric ID. The staff ID is shown in the new Orders panel. Match it to the iTune username with Topup permission. Each account can have only one mapping.

Tables and indexes are initialized on first use, following the existing repository pattern. Database roles need CREATE/INDEX privileges for initial setup. No existing orders, reservations or balances are migrated or reset.

## Workflow

- Staff reserve mail in iTune, then accept the Order / individual queue line in Orders.
- Open Order details → “เมล iTune ที่ใช้ทำรายการ”. Only that mapped user's currently reserved, usable mail is listed; recommendation uses the existing iTune queue rules.
- “เลือกเตรียมใช้” records a plan, not actual usage. There is one outstanding plan per order/queue line. Cancel it before choosing another mail.
- After actual fulfillment, enter the amount **in the selected mail's currency** and confirm. Do this before completing/closing the order or returning the mail. Prices in THB/USD on the order are never used to infer spend.
- Confirmation rechecks mail owner, exact claim session, currency and availability under a row lock. A returned/reclaimed mail cannot be confirmed against its old plan, even if the same person reserves it again.
- Confirmation records usage only: it does **not** deduct balance, fulfill the order, or update proof images. Continue updating balance/proof in the existing iTune flow.
- Multiple completed usages per order/line are supported by creating another plan after confirming the previous one. This supports split fulfillment with different emails.
- Current order/line owner can cancel an old pending plan, including after a handover/closed order. Both original staff and cancelling staff IDs are retained. Completed records are immutable; there is no deletion/correction UI in this version.
- Orders displays history for the selected order/line. Expand a held mail card to view its history, or use the admin lookup by mail ID for returned/deleted mails. Non-admin iTune users see only their own usage records; Projectm admins see all usage for that mail. Lists show the latest 100 records.

## Security / failure behavior

The browser never receives the bridge secret or email password. Orders authenticates the current server session and locks/rechecks order ownership and queue-line membership before calling the signed bridge. It sends authoritative order labels, not browser-provided staff IDs. The bridge resolves its explicit staff mapping and checks Topup permission. No browser-to-browser or cross-database login trust is used.

Requests are HMAC-SHA256 signed over the timestamp and exact JSON body, use no-store, and reject redirects. Usage UUIDs and database locks make retries idempotent. If connection fails, use “ลองบันทึกรายการเดิมอีกครั้ง”; do not assume a timeout means the write failed. Confirmation retries must keep the original amount.

No distributed database transaction is possible across these systems. The iTune log is authoritative for usage, Orders for order/line ownership. If a write succeeds remotely but the response fails locally, retry/read the same record rather than making an alternate copy. The Orders ownership transaction is held during the bounded (8-second) bridge call. Cancelling a plan after actual usage does not reverse any financial transaction; operators must confirm actual use accurately.

## Verification before production

- Pair two test staff accounts; each must see only their own reserved mail.
- Unassigned/another person's orders must reject writes, including forged API requests and queue lines from another order.
- Plan → confirm → retry: only one completed record; verify on both order and mail.
- Plan → return/reclaim mail: confirmation must fail; cancel and select the new session.
- Plan → change currency/report unavailable: confirmation must fail.
- Handover an order: new owner can cancel the previous plan but cannot confirm another staff member's usage.
- Close/refund an order/line: no new plans/confirmations, but cancellation remains available to current owner.
- Verify desktop/mobile, light/dark, keyboard focus and no overflow with long email addresses.
