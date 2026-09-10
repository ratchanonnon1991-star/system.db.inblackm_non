import strict from "node:assert/strict";
import { readFileSync } from "node:fs";
import { log, reset, setResponder } from "@/lib/db";
import { startRussiaCheck } from "@/server/gameinfo-russia-check";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
const fixture = JSON.parse(readFileSync(new URL("./fixtures/skystone-crystal-of-atlan-us.json", import.meta.url), "utf8"));
const source = { id: 9, source_key: "crystal-of-atlan-skystone-us", provider: "skystone", game_id: 122, expected_game_name: "CRYSTAL OF ATLAN ( EU/NA)", source_url: "https://topup.games.skystone.games", store_url: "https://topup.games.skystone.games/Topup/754024", project_id: "754024", country: "US", locale: "en" };
const catalogUrl = "https://topup.games.skystone.games/web/payment/app/754024/country/US/all_goods_detail";
const originalFetch = globalThis.fetch;
let runId = 2000;
async function run({ payload = fixture, existing = [], mode = "manual", gameId = 122, status = 200 } = {}) {
  reset(); runId++;
  let finish;
  const completed = new Promise((resolve) => { finish = resolve; });
  setResponder((sql, params) => {
    if (sql.startsWith("SELECT s.id FROM gameinfo_russia_check_sources")) {
      assert.ok(sql.includes("s.provider IN ('xsolla','midasbuy','codashop','skystone') AND NOT s.auth_required"));
      assert.equal(params[0], gameId);
      return { rows: [{ id: source.id }] };
    }
    if (sql.startsWith("INSERT INTO gameinfo_russia_check_runs")) return { rows: [{ id: runId, target_game_id: params[0], trigger_type: params[1], status: "queued" }] };
    if (sql.includes("SELECT s.* FROM gameinfo_russia_check_run_sources")) return { rows: [source] };
    if (sql.startsWith("SELECT * FROM gameinfo_russia_check_items")) return { rows: existing };
    if (sql.includes("SELECT EXISTS(SELECT 1 FROM gameinfo_russia_check_run_sources")) return { rows: [{ seen: existing.length > 0 }] };
    if (sql.includes("SELECT COUNT(*)::int total")) return { rows: [{ total: 1, completed: 1, failed: 0 }] };
    if (sql.startsWith("UPDATE gameinfo_russia_check_runs SET status=$2")) finish();
    return { rows: [] };
  });
  let fetches = 0;
  globalThis.fetch = async (url, init) => {
    fetches++;
    assert.equal(url, catalogUrl);
    assert.deepEqual(JSON.parse(init.body), { country: "US", role_id: "", pay_channel: "xsolla_paystation", aid: 754024 });
    return status === 200 ? Response.json(payload) : new Response("denied", { status });
  };
  const result = await startRussiaCheck({ id: 7 }, mode, gameId);
  assert.equal(result.run.targetGameId, gameId);
  let timer;
  try { await Promise.race([completed, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("run did not complete")), 3000); })]); }
  finally { clearTimeout(timer); }
  return { entries: log.map((entry) => ({ ...entry })), fetches };
}
const packWrites = (entries) => entries.filter(({ text }) => /^(INSERT INTO|UPDATE|DELETE FROM) gameinfo_russia_check_(items|events)/.test(text));
// startRussiaCheck commits the run row itself, so only a second COMMIT means packs were written.
const commits = (entries) => entries.filter(({ text }) => text === "COMMIT").length;
try {
  const baseline = await run();
  assert.equal(baseline.entries.filter(({ text }) => text.startsWith("INSERT INTO gameinfo_russia_check_events")).length, 21);
  assert.equal(baseline.entries.some(({ text }) => text.includes("SELECT * FROM gameinfo_russia_check_source_credentials")), false);
  assert.equal(commits(baseline.entries), 2);

  const renamed = await run({ existing: fixture.data.normal.map((pack, index) => ({ sku: pack.product_id, name: `Old store name ${index}`, status: "active", missing_runs: 0 })) });
  assert.equal(renamed.entries.filter(({ text }) => text.startsWith("INSERT INTO gameinfo_russia_check_events")).length, 0);
  assert.ok(renamed.entries.some(({ text, params }) => text.startsWith("UPDATE gameinfo_russia_check_items") && params[2] === "60 Vouchers + 5 Bonus"));

  for (const pending of [0, 1]) {
    const checked = await run({ existing: [{ sku: "us.coa.gone", name: "Gone", status: pending ? "pending_removal" : "active", missing_runs: pending }] });
    assert.ok(checked.entries.some(({ text, params }) => text.startsWith("UPDATE gameinfo_russia_check_items") && params[2] === (pending ? "removed" : "pending_removal")));
    assert.equal(checked.entries.some(({ text, params }) => text.startsWith("INSERT INTO gameinfo_russia_check_events") && params[4] === "removed"), Boolean(pending));
  }

  // A rejected or empty catalog fails the source and leaves the stored packs alone.
  for (const overrides of [
    { payload: { code: -30303, message: "goods not found" } },
    { payload: { code: 0, data: { activity: [], normal: [], classify_products: null } } },
    { status: 403 },
  ]) {
    const checked = await run(overrides);
    assert.equal(packWrites(checked.entries).length, 0);
    assert.ok(checked.entries.some(({ text }) => text.includes("SET status='failed',error=")));
    assert.equal(commits(checked.entries), 1);
  }
} finally { globalThis.fetch = originalFetch; reset(); }
console.log(`${assertions} passed`);
