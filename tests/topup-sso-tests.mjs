import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTopupBaseUrl, getTopupSsoSecret, TOPUP_SSO_ROLES } from "../src/lib/topup-sso.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

check(getTopupBaseUrl({ TOPUP_BASE_URL: "https://inblackm.com/" }) === "https://inblackm.com", "TopUp's origin, trailing slash dropped");
check(getTopupBaseUrl({ NEXT_PUBLIC_TOPUP_BASE_URL: "https://inblackm.com" }) === "https://inblackm.com", "the public variable works too");
assert.throws(() => getTopupBaseUrl({}), /TOPUP_BASE_URL/);
passed += 1;
assert.throws(() => getTopupSsoSecret({ NODE_ENV: "production" }), /TOPUP_SSO_SECRET/);
passed += 1;
check(getTopupSsoSecret({ NODE_ENV: "development" }) === "tools-sso-dev-secret", "a local default matching TopUp's");
check(TOPUP_SSO_ROLES.join() === "admin,staff", "only TopUp staff may sign in");

const route = read("../src/app/api/sso/from-topup/route.js");
check(route.includes('"x-tools-sso-secret": getTopupSsoSecret()') && route.includes("/api/sso/tools/exchange"), "the code is redeemed server-to-server with the shared secret");
check(route.includes("if (!TOPUP_SSO_ROLES.includes(String(account?.role || \"\").toLowerCase())) return failure(\"not_staff\");"), "customers are turned away even if TopUp answered");
const repository = read("../src/server/gamedb-sso-map-repository.js");
check(repository.includes("WHERE LOWER(username) = $1 OR LOWER(COALESCE(display_name, '')) = $1") && repository.includes("if (result.rows.length === 1)"), "an email links to the one existing account named after it, never a guess between several");
const page = read("../src/app/page.js");
check(page.includes("/admin/tools-sso?return=") && page.includes("เข้าสู่ระบบด้วยบัญชี TopUp"), "the login page offers TopUp");
check(!page.includes("/api/sso/gamedb?return="), "the hiring button is gone");

console.log(`topup-sso: ${passed} passed`);
