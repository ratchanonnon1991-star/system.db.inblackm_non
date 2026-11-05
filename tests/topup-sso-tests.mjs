import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTopupBaseUrl, getTopupSsoSecret, topupAdminGrant, TOPUP_SSO_ADMIN_VIEW, TOPUP_SSO_NEW_ACCOUNT, TOPUP_SSO_ROLES } from "../src/lib/topup-sso.js";
import { PERMISSION_KEYS } from "../src/lib/permissions.js";

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
check(TOPUP_SSO_NEW_ACCOUNT.role === "staff" && TOPUP_SSO_NEW_ACCOUNT.permissions.join() === "gameinfo.access,gameinfo.report", "a first TopUp sign-in is Staff with GameInfo's top-up view");

const route = read("../src/app/api/sso/from-topup/route.js");
check(route.includes('"x-tools-sso-secret": getTopupSsoSecret()') && route.includes("/api/sso/tools/exchange"), "the code is redeemed server-to-server with the shared secret");
check(route.includes("if (!TOPUP_SSO_ROLES.includes(topupRole)) return failure(\"not_staff\");"), "customers are turned away even if TopUp answered");
check(route.includes("findOrProvisionSsoUser(email, TOPUP_SSO_NEW_ACCOUNT)"), "new TopUp accounts are made with that access");
check(route.includes('user && topupRole === "admin" ? topupAdminGrant(user) : null'), "only TopUp's admins get the wider view, not its staff");
check(TOPUP_SSO_ADMIN_VIEW.every((key) => PERMISSION_KEYS.has(key)), "the view grant names real permissions");
check(TOPUP_SSO_ADMIN_VIEW.every((key) => /\.access$/.test(key)), "and only ones that look, none that change data");
const staffGrant = topupAdminGrant({ role: "staff", permissions: ["gameinfo.access", "gameinfo.report"] });
check(staffGrant.permissions.join() === "gameinfo.access,gameinfo.report,profit.access,stock.access,workforce.access", "what an account holds is kept and the views added");
check(!("role" in staffGrant), "a Staff account stays Staff");
check(topupAdminGrant({ role: "admin", permissions: TOPUP_SSO_ADMIN_VIEW }) === null, "an account with every view is left alone, and an Admin is not demoted");
check(topupAdminGrant({ role: "user", permissions: TOPUP_SSO_ADMIN_VIEW }).role === "staff", "a template-only account becomes Staff, to reach System DB");
const repository = read("../src/server/gamedb-sso-map-repository.js");
check(repository.includes("WHERE LOWER(username) = $1 OR LOWER(COALESCE(display_name, '')) = $1") && repository.includes("if (result.rows.length === 1)"), "an email links to the one existing account named after it, never a guess between several");
const page = read("../src/app/page.js");
check(page.includes("/admin/tools-sso?return=") && page.includes("เข้าสู่ระบบด้วยบัญชี TopUp"), "the login page offers TopUp");
check(!page.includes("/api/sso/gamedb?return="), "the hiring button is gone");

console.log(`topup-sso: ${passed} passed`);
