import strict from "node:assert/strict";
import { readFileSync } from "node:fs";
import { log, reset, setResponder } from "@/lib/db";
import { getRussiaCheckRun, recoverRussiaChecks, startRussiaCheck } from "@/server/gameinfo-russia-check";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
const fixture = JSON.parse(readFileSync(new URL("./fixtures/midasbuy-nikke-th.json", import.meta.url), "utf8"));
const source = { id: 4, source_key: "nikke-midasbuy-th", provider: "midasbuy", game_id: 22, expected_game_name: "GODDESS OF VICTORY: NIKKE UID", project_id: "1460000285", country: "TH", locale: "en" };
const originalFetch = globalThis.fetch;
await assert.rejects(getRussiaCheckRun(999999), { status: 404 });
assert.ok(log.some(({ text }) => text.includes("WHERE source_key='nikke-midasbuy-th'") && text.includes("enabled=false")));
let runId = 1000;
async function run({ payload = fixture, existing = [], mode = "recovery", gameId = 22, writeFailure = false, failedSecondPage = false } = {}) {
  reset(); runId++;
  let finish;
  const completed = new Promise((resolve) => { finish = resolve; });
  setResponder((sql, params) => {
    if (sql.startsWith("SELECT id FROM gameinfo_russia_check_runs WHERE status='queued'")) return { rows: [{ id: runId }] };
    if (sql.startsWith("SELECT s.id FROM gameinfo_russia_check_sources")) {
      assert.ok(sql.includes("s.provider IN ('xsolla','midasbuy','codashop','skystone') AND NOT s.auth_required"));
      assert.ok(sql.includes("($1::int IS NULL OR s.game_id=$1)"));
      assert.equal(params[0], gameId);
      return { rows: [{ id: source.id }] };
    }
    if (sql.startsWith("INSERT INTO gameinfo_russia_check_runs")) return { rows: [{ id: runId, target_game_id: params[0], trigger_type: params[1], status: "queued" }] };
    if (sql.includes("SELECT s.* FROM gameinfo_russia_check_run_sources")) return { rows: [source] };
    if (sql.startsWith("SELECT * FROM gameinfo_russia_check_items")) return { rows: existing };
    if (sql.includes("SELECT EXISTS(SELECT 1 FROM gameinfo_russia_check_run_sources")) return { rows: [{ seen: existing.length > 0 }] };
    if (writeFailure && sql.startsWith("INSERT INTO gameinfo_russia_check_events")) throw Error("fixture write failure");
    if (sql.includes("SELECT COUNT(*)::int total")) return { rows: [{ total: 1, completed: 1, failed: 0 }] };
    if (sql.startsWith("UPDATE gameinfo_russia_check_runs SET status=$2")) finish();
    return { rows: [] };
  });
  let fetches = 0;
  globalThis.fetch = async (url) => {
    fetches++;
    assert.equal(url, "https://www.midasbuy.com/frontend/api/midasbuy/v1/shelves/query");
    if (failedSecondPage && fetches === 2) return new Response("denied", { status: 403 });
    return Response.json(payload);
  };
  if (mode === "recovery") await recoverRussiaChecks();
  else {
    const result = await startRussiaCheck({ id: 7 }, mode, gameId);
    assert.equal(result.run.targetGameId, gameId);
    assert.equal(result.run.triggerType, mode);
  }
  let timer;
  try { await Promise.race([completed, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("run did not complete")), 3000); })]); }
  finally { clearTimeout(timer); }
  return { entries: log.map((entry) => ({ ...entry })), fetches };
}
const packWrites = (entries) => entries.filter(({ text }) => /^(INSERT INTO|UPDATE|DELETE FROM) gameinfo_russia_check_(items|events)/.test(text));
try {
  const baseline = await run();
  assert.equal(baseline.entries.filter(({ text }) => text.startsWith("INSERT INTO gameinfo_russia_check_events")).length, 9);
  assert.equal(baseline.entries.some(({ text }) => text.includes("SELECT * FROM gameinfo_russia_check_source_credentials")), false);
  assert.ok(baseline.entries.some(({ text }) => text === "COMMIT"));
  const renamed = await run({ existing: fixture.shelf.products.map((product, index) => ({ sku: product.product_id, name: `Old localized name ${index}`, status: "active", missing_runs: 0 })) });
  assert.equal(renamed.entries.filter(({ text }) => text.startsWith("INSERT INTO gameinfo_russia_check_events")).length, 0);
  assert.ok(renamed.entries.some(({ text, params }) => text.startsWith("UPDATE gameinfo_russia_check_items") && params[2] === "Monthly pass"));
  for (const pending of [0, 1]) {
    const checked = await run({ existing: [{ sku: "gone", name: "Gone", status: pending ? "pending_removal" : "active", missing_runs: pending }] });
    assert.ok(checked.entries.some(({ text, params }) => text.startsWith("UPDATE gameinfo_russia_check_items") && params[2] === (pending ? "removed" : "pending_removal")));
    assert.equal(checked.entries.some(({ text, params }) => text.startsWith("INSERT INTO gameinfo_russia_check_events") && params[4] === "removed"), Boolean(pending));
  }
  for (const mode of ["manual", "scheduled"]) {
    const checked = await run({ mode, gameId: mode === "scheduled" ? null : 22 });
    assert.ok(checked.entries.some(({ text, params }) => text.startsWith("INSERT INTO gameinfo_russia_check_run_sources") && params[1] === source.id));
  }
  for (const overrides of [
    { payload: { shelf: { ...fixture.shelf, is_part_activity_fail: true } } },
    { payload: { shelf: { ...fixture.shelf, products: [] } } },
    { payload: { shelf: { ...fixture.shelf, product_offset: "next" } }, failedSecondPage: true },
  ]) {
    const checked = await run(overrides);
    assert.equal(packWrites(checked.entries).length, 0);
    assert.ok(checked.entries.some(({ text }) => text.includes("SET status='failed',error=")));
    assert.equal(checked.entries.some(({ text }) => text === "COMMIT"), false);
  }
  const failedWrite = await run({ writeFailure: true });
  assert.ok(failedWrite.entries.some(({ text }) => text === "ROLLBACK"));
  assert.equal(failedWrite.entries.some(({ text }) => text === "COMMIT"), false);
} finally { globalThis.fetch = originalFetch; reset(); }
console.log(`${assertions} passed`);
