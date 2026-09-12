import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../src/", import.meta.url);
const apiRoot = new URL("app/api/profit/", root);
const routes = readdirSync(apiRoot, { recursive: true })
  .filter((name) => name.endsWith("route.js"))
  .map((name) => readFileSync(new URL(name.replaceAll("\\", "/"), apiRoot), "utf8"));
const auth = readFileSync(new URL("server/auth.js", root), "utf8");
const layout = readFileSync(new URL("app/profit/layout.js", root), "utf8");
const permissions = readFileSync(new URL("lib/permissions.js", root), "utf8");
const home = readFileSync(new URL("app/page.js", root), "utf8");
const remoteDb = readFileSync(new URL("lib/profit-remote-db.js", root), "utf8");

function hasProfitSessionAuth(route) {
  return route.includes("requireProfitAccess") || route.includes("requireProfitEditor");
}

/** Razer bot routes use Bearer key auth instead of the Profit session cookie. */
function hasBotApiAuth(route) {
  return route.includes("requireRazerBotApiKey") || route.includes("verifyRazerBotApiKey");
}

function hasAnyAuth(route) {
  return hasProfitSessionAuth(route) || hasBotApiAuth(route);
}

const checks = [
  ["Profit routes do not use the generic login guard", routes.every((route) => !route.includes("requireAdmin"))],
  ["Every Profit route requires at least view access", routes.every(hasAnyAuth)],
  ["Mutating Profit routes require the editor permission", routes
    .filter((route) => /export async function (POST|PATCH|DELETE)/.test(route))
    .every((route) => route.includes("requireProfitEditor") || route.includes("requireRazerBotApiKey"))],
  ["auth.js exposes the Profit guards", ["hasProfitAccess", "requireProfitAccess", "canManageProfit", "requireProfitEditor"].every((name) => auth.includes(name))],
  ["Profit layout blocks accounts without access", layout.includes("hasProfitAccess(user)") && layout.includes('redirect("/")')],
  ["Profit permissions have their own matrix group", permissions.includes('site: "Profit"')],
  ["Hub only shows the Profit tile with profit.access", home.includes('hasPermission(me, "profit.access")')],
  ["The GoCash/Oxide remote pool never writes back", remoteDb.includes("selectQuery") && !/\b(INSERT|UPDATE|DELETE)\b/i.test(remoteDb)],
];

const failed = checks.filter(([, passed]) => !passed);
console.log(`\n${checks.length - failed.length} passed, ${failed.length} failed`);
for (const [name] of failed) console.error(`FAIL: ${name}`);
process.exit(failed.length ? 1 : 0);
