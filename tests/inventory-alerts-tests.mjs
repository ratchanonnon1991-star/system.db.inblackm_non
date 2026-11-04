import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { alertTarget, isLowStock, stockAlertText } from "../src/lib/inventory-alerts.js";
import { createInventoryAlerts, sendStockTelegram, telegramConfigured } from "../src/server/inventory-alerts.js";
import { balanceReaders, loadAlertBalances } from "../src/server/inventory-alert-balances.js";
import { canViewUsdInventory, canManageUsdInventory, inventoryError } from "../src/lib/usdcodashop-inventory.js";
import { reset, setResponder, log } from "@/lib/db";

let count = 0;
const check = (condition, message) => { assert.ok(condition, message); count++; };
const reject = async (promise, expected) => { await assert.rejects(promise, expected); count++; };
check(alertTarget("") === null && alertTarget(null) === null);
check(alertTarget("1,000.10") === "1000.10");
for (const value of ["0", "-1", "NaN", "1e3", "1.001", {}, 50, undefined, "1000000000000"]) {
  assert.throws(() => alertTarget(value), { status: 400 }); count++;
}
check(isLowStock("49.99", "100") === true);
check(isLowStock("50", "100") === false, "exact 50% does not alert");
check(isLowStock("0", "0.01") === true);
check(isLowStock("499999999999.99", "999999999999.99") === true, "large decimals stay exact");
for (const value of [null, undefined, "", "bad", "--1"]) check(isLowStock(value, "100") === null);
check(isLowStock("-1.00", "100") === true, "a confirmed negative balance must alert");
check(isLowStock("1", null) === null);
const c = { key: "plsbuy:MYR", provider: "plsbuy", label: "Plsbuy", currency: "MYR", balance: "49.99", balanceAt: "2026-11-02T00:00:00Z", source: "plsbuy_api" };
check(stockAlertText(c, "100").includes("49.99 MYR") && stockAlertText(c, "100").includes(c.balanceAt));

let rule = { channel_key: c.key, provider: c.provider, label: c.label, currency: c.currency, target: "100.00", notified: false, updated_by: 1 };
let lock = true, failSend = false, balance = c.balance, missing = false, reads = 0, released = 0;
const statements = [], messages = [];
const query = async (sql, params) => {
  statements.push({ sql, params });
  if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: lock }] };
  if (sql.startsWith("SELECT provider FROM")) return { rows: rule ? [{ provider: rule.provider }] : [] };
  if (sql.startsWith("SELECT * FROM")) return { rows: rule ? [{ ...rule }] : [] };
  if (sql.startsWith("UPDATE") && sql.includes("last_checked_at")) {
    rule.last_balance = params[1]; rule.last_error = params[2]; rule.last_checked_at = "now";
    if (params[3] === false) rule.notified = false;
  }
  if (sql.startsWith("UPDATE") && sql.includes("SET notified=TRUE")) { rule.notified = true; rule.last_sent_at = "sent"; }
  if (sql.startsWith("UPDATE") && sql.includes("SET last_error=")) rule.last_error = params[1];
  if (sql.startsWith("DELETE")) rule = null;
  if (sql.startsWith("INSERT")) {
    const same = rule?.target === params[4];
    rule = { ...rule, channel_key: params[0], provider: params[1], label: params[2], currency: params[3], target: params[4], notified: same ? rule.notified : false };
  }
  return { rows: [] };
};
const pool = { query, connect: async () => ({ query, release() { released++; } }) };
const balances = async () => { reads++; return { channels: missing ? [] : [{ ...c, balance }], errors: [] }; };
const repo = createInventoryAlerts({ pool, balances, send: async text => { if (failSend) throw new Error("failed"); messages.push(text); } });
const admin = { id: 1, permissions: ["projectm.admin"] };
check((await repo.run()).sent === 1 && rule.notified && messages.length === 1);
check((await repo.run()).sent === 0 && messages.length === 1, "latch prevents repeat");
const restarted = createInventoryAlerts({ pool, balances, send: async text => messages.push(text) });
check((await restarted.run()).sent === 0, "DB latch survives a new worker instance");
missing = true; check((await repo.run()).skipped === 1 && rule.notified, "missing account cannot rearm");
missing = false; balance = null; check((await repo.run()).skipped === 1 && rule.notified && rule.last_balance === null);
balance = "50.00"; check((await repo.run()).sent === 0 && !rule.notified, "50% rearms");
balance = "49.99"; failSend = true;
check((await repo.run()).failed === 1 && !rule.notified && rule.last_error, "delivery failure stays retryable");
failSend = false; check((await repo.run()).sent === 1 && rule.notified && !rule.last_error);
rule.currency = "USD";
check((await repo.run()).skipped === 1 && rule.notified, "currency change cannot compare a target in different units");
rule.currency = "MYR";
await repo.save({ key: c.key, target: "100" }, admin);
check(rule.notified, "saving same target keeps latch");
await repo.save({ key: c.key, target: "200" }, admin);
check(!rule.notified, "changed target starts new cycle");
await reject(repo.save({ key: c.key, target: "100" }, { id: 2, permissions: ["projectm.claim"] }), { status: 403 });
await reject(repo.save({ key: "bad:wallet", target: "100" }, admin), { status: 400 });
await reject(repo.save({ key: "plsbuy:forged", target: "100" }, admin), { status: 409 });
missing = true;
const unavailable = await repo.list();
check(unavailable.channels[0].balance === null && unavailable.channels[0].target === "200.00", "unavailable saved rules remain editable");
await repo.save({ key: c.key, target: "" }, admin); check(rule === null, "disable works even with source down");
const readsBefore = reads; await repo.run(); check(reads === readsBefore, "no configured targets means no source reads");
lock = false; check((await repo.run()).sent === 0 && statements.at(-1).sql.includes("pg_try_advisory_lock"));
check(released > 0);

const env = { TOPUP_TELEGRAM_BOT_TOKEN: "secret-token", TOPUP_TELEGRAM_CHAT_ID: "-100123" };
check(telegramConfigured(env) && !telegramConfigured({}));
let payload;
await sendStockTelegram("hello", { env, fetcher: async (url, options) => {
  payload = JSON.parse(options.body);
  check(url === "https://api.telegram.org/botsecret-token/sendMessage" && options.signal && !payload.parse_mode);
  return { ok: true, json: async () => ({ ok: true }) };
} });
check(payload.chat_id === "-100123" && payload.text === "hello");
for (const fetcher of [async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ ok: false }) }), async () => { throw new Error("secret-token in URL"); }]) {
  await reject(sendStockTelegram("test", { env, fetcher }), { message: "TELEGRAM_SEND_FAILED" });
}
await reject(sendStockTelegram("test", { env: {} }), /TELEGRAM_NOT_CONFIGURED/);

// Real readers with stored provider evidence, without external database calls.
const at = "2026-11-02T00:00:00Z";
const gp = await balanceReaders.gamepoint(async () => [{ id: 1, occurred_at: at, balance_before: "100", submitted_at: at,
  plan_total: 1, provider_amount: "60", ledger_slices: [] }]);
check(gp[0].balance === "40.00" && gp[0].source.startsWith("calculated"));
const unknownGp = await balanceReaders.gamepoint(async () => [{ id: 1, occurred_at: at, balance_before: "100", submitted_at: at, quantity: 2 }]);
check(unknownGp[0].balance === null, "never alert on a before-only Gamepoint balance");
const pls = await balanceReaders.plsbuy(async sql => {
  check(!sql.includes("inventory_topups"), "valid API balance needs no lot fallback");
  return [{ wallet_after: "1.50", wallet_checked_at: at, wallet_currency: "MYR", wallet_source: "plsbuy_api" }];
});
check(pls[0].balance === "1.50");
const lots = await balanceReaders.plsbuy(async sql => sql.includes("inventory_topups") ? [{ remaining: "0", observed_at: at }] : []);
check(lots[0].balance === "0.00" && lots[0].source === "inventory_lots");
const netease = await balanceReaders.netease(async () => [{ purchase_email: "inblacknetease1@hotmail.com", currency: "USD", new_balance: "1", balance_at: at }]);
check(netease.find(c => c.key === "netease:pay2").balance === null && netease.find(c => c.key === "netease:credit2").balance === null, "ambiguous wallets stay unknown");
const shells = await balanceReaders["garena-shell"](async () => [{ account: "inblackrb2c", balance: "0", balance_at: at }]);
check(shells[0].balance === "0.00" && shells[1].balance === null);
const wave = await balanceReaders.wavepay(async () => [{ phone: "0912345678", balance: "Ks1,000", balance_at: at }, { phone: "", balance: "1" }]);
check(wave.length === 1 && wave[0].balance === "1000.00" && wave[0].currency === "MMK");
const partial = await loadAlertBalances(["plsbuy", "gamepoint"], { plsbuy: async () => [c], gamepoint: async () => { throw new Error("source error with secrets"); } });
check(partial.channels.length === 1 && partial.errors[0].provider === "gamepoint" && !JSON.stringify(partial).includes("secrets"));
reset();
setResponder(sql => {
  if (sql.includes("profit_razer_accounts")) return { rows: [
    { id: 1, email: "one@example.com", zone: "SGD", gold_balance: "100", last_synced_at: at },
    { id: 2, email: "hidden@example.com", zone: "CAD", gold_balance: "1", hidden: true, last_synced_at: at },
  ] };
  if (sql.includes("FROM gamedb_mgc_cards c")) return { rows: [{ id: 1, serial: "CARD", balance_points: "2", created_at: at }] };
  if (sql.includes("FROM gamedb_coda_wallet")) return { rows: [{ balance: "3.000000", balance_at: at }] };
  if (sql.startsWith("SELECT id,email,currency,amount")) return { rows: [{ id: 1, email: "one@example.com", currency: "USD", amount: "4", updated_at: at }] };
  return null;
});
const razer = await balanceReaders.razer(async () => [{ purchase_email: "one@example.com", currency_code: "SGD", new_balance_gold: "5", occurred_at: "2026-11-02T01:00:00Z" }]);
check(razer.length === 1 && razer[0].balance === "5.00", "Razer uses newer purchase evidence and excludes hidden accounts");
const mgc = await balanceReaders.multigamecard(async () => [
  { serial: "DUPLICATE", balance: "1", balance_at: at }, { serial: "DUPLICATE", balance: "9", balance_at: at },
  { serial: "DISABLED", enabled: "false", balance: "1" }, { serial: "CARD", balance: "3", balance_at: at },
]);
check(mgc.length === 3 && mgc.find(c => c.key.endsWith("DUPLICATE")).balance === null, "duplicate serial cannot alert on an arbitrary balance");
check(mgc.find(c => c.key === "multigamecard:bot:CARD").balance === "3.00" && mgc.find(c => c.key === "multigamecard:manual:1").balance === "2.00", "bot and manual balances stay separate");
const usdBot = (await balanceReaders.usdcodashop())[0];
check(usdBot.balance === "3.00" && usdBot.key === "usdcodashop:USD" && usdBot.balanceAt === new Date(at).toISOString());
const itune = await balanceReaders.itune();
check(itune[0].key === "itune:1:USD" && itune[0].balance === "4.00" && !JSON.stringify(itune).includes("password"));
check(log.filter(r => /^(SELECT|WITH)/.test(r.text) && (r.text.includes("profit_razer_accounts") || r.text.includes("SELECT id,email,currency,amount"))).every(r => !/SELECT \*/.test(r.text)), "wallet reads use safe projections");

// Exercise route auth/body validation with real Web Request streams.
const require = createRequire(import.meta.url);
let actor = null, writes = 0;
const routeSource = readFileSync(new URL("../src/app/api/projectm/inventory-alerts/route.js", import.meta.url), "utf8");
const mocks = {
  "@/server/auth": { requireAdmin: async () => { if (!actor) throw inventoryError("login", 401); return actor; } },
  "@/lib/usdcodashop-inventory": { canViewUsdInventory, canManageUsdInventory, inventoryError },
  "@/lib/http": { jsonOk: data => Response.json(data), jsonError: (error, status) => Response.json({error}, {status}) },
  "@/server/inventory-alerts": { inventoryAlerts: () => ({ list: async () => ({channels: []}), save: async () => { writes++; } }) },
};
const exports = {};
new Function("require", "exports", ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(name => mocks[name] || require(name), exports);
const request = (body, headers = {}) => new Request("https://tools.inblackm.com/api/projectm/inventory-alerts", { method: "PUT", body, headers: { "content-type": "application/json", ...headers } });
check((await exports.GET(request("{}"))).status === 401);
actor = { permissions: ["projectm.claim"] };
check((await exports.GET(request("{}"))).status === 200);
check((await exports.PUT(request("{}"))).status === 403);
actor = admin;
check((await exports.PUT(request("{}", { "sec-fetch-site": "cross-site" }))).status === 403);
check((await exports.PUT(request("{}", { "content-type": "text/plain" }))).status === 400);
check((await exports.PUT(request("{"))).status === 400);
check((await exports.PUT(request("x".repeat(4097)))).status === 413);
check((await exports.PUT(request(JSON.stringify({ key: c.key, target: "100" })))).status === 200 && writes === 1);
check((await exports.GET(request("{}"))).headers.get("Cache-Control") === "no-store");
const disabled = spawnSync(process.execPath, ["scripts/inventory-alert-worker.mjs"], { encoding: "utf8", env: { ...process.env, TOPUP_INVENTORY_ALERTS_ENABLED: "false" } });
check(disabled.status === 0 && disabled.stdout.includes("disabled"), "disabled worker exits before any DB or Telegram import");
console.log(`\n${count} passed, 0 failed`);
