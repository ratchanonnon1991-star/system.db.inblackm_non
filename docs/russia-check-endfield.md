# Endfield and refresh-triggered Login

Source `endfield-gryphline`: Game ID 217, canonical name `ARKNIGHTS: ENDFIELD`, created with the normal GameInfo CRUD and audit path by user request. Source starts disabled until verified. Store: https://topup.gryphline.com/endfield. Names are requested with `X-Language: en-us`; catalog region follows the account/server, not RU. No passwords or cookies are captured.

## Observed official contract (2026-09-03)

Storefront `endfield-CEhRcD47.js` uses GET `https://as.gryphline.com/user/pay/v3/query_web_product` with `token`, `appCode=d9f6dbb6bbd6bb33`, `serverId`. The response envelope uses `status`, `data.productList` with `productCode` / `productName`, `productType`, and `region`. The storefront requests the complete shelf, then filters categories in the browser. Unknown pagination, duplicates, empty or malformed catalogs fail closed.

The account SDK verifies the token with GET `/user/info/v1/basic`. Only `data.hgId` is used to hash account/server/region identity; email/nickname and the raw response are not stored. Reconnecting a different identity to existing packs is rejected. HTTP 401/403 or status 3 invalidates the saved session; transport/5xx failures do not. No token-renewal protocol is assumed.

## Refresh flow

Manual Refresh reads fresh source states in the selected game scope, opens a Login dialog and extension consent popup for each missing/expired session sequentially, then starts the run. A token rejected during the run prompts Login once and uses `retryRunId` to select only failed sources, avoiding a second successful check of unaffected packs. Cancel stops the browser workflow without deleting data. A checker without GameInfo management permission must ask a manager to connect credentials; existing permissions remain unchanged.

The 09:00 scheduler does not open browser windows. It keeps existing packs and skips sources waiting for Login; source status remains visible. The next manual Refresh reconnects them. Unknown providers/config errors are not sent to Login automatically.

Connector v1.1.0 adds exactly `topup.gryphline.com` and `as.gryphline.com` host permissions. Re-download, extract over the installed folder, Reload the extension, approve permissions, and reload GameInfo. A v1.0 connector is rejected for Endfield with an update message. Only an approved popup's catalog GET query is captured and sent directly from the isolated extension script to the permission-checked session API, never through window messages or extension storage.

Tests use synthetic contract fixtures and do not call upstream. Live signed-in catalog and installed-extension verification still require a user Login in the Topup Center; the logged-out page and HTTP 401/status 3 invalid-token response were checked live.
