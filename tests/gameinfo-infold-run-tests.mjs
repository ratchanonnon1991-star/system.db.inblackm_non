import strict from "node:assert/strict";
import { log, reset, setResponder } from "@/lib/db";
import { getRussiaCheckRun, recoverRussiaChecks } from "@/server/gameinfo-russia-check";
import { buildInfoldForm, encryptInfoldData, parseInfoldFormData } from "@/server/gameinfo-infold-catalog";
import { encryptRussiaCheckSession } from "@/server/crypto";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
const session = parseInfoldFormData(buildInfoldForm({ data: { nid: "fixture", token: "fixture-token", role_id: "1", zone_id: "1", area: "global", region: "test", shelf_id: "payment" } }, 1900000000000));
const credential = { credential_kind: "infold", verified_at: new Date(), session_enc: encryptRussiaCheckSession(JSON.stringify(session)) };
const source = { id: 2, provider: "infold", project_id: "love-and-deepspace", game_id: 3, expected_game_name: "LOVE AND DEEPSPACE" };
const fixture = { product_list: [{ product_info: { sku_id: "new", name: [{ lang: "en", text: "New pack" }] } }] };
const originalFetch = globalThis.fetch;
// Initialize schema once, then isolate run statements from seed/migration SQL.
await assert.rejects(getRussiaCheckRun(999999), { status: 404 });
let runId = 100;
async function run({ payload = fixture, code = 0, disconnect = false, writeFailure = false } = {}) {
  reset();
  runId++;
  let finish;
  const completed = new Promise((resolve) => { finish = resolve; });
  setResponder((sql) => {
    if (sql.startsWith("SELECT id FROM gameinfo_russia_check_runs WHERE status='queued'")) return { rows: [{ id: runId }] };
    if (sql.includes("SELECT s.* FROM gameinfo_russia_check_run_sources")) return { rows: [source] };
    if (sql.startsWith("SELECT id, game FROM game_list")) return { rows: [{ game: source.expected_game_name }] };
    if (sql.startsWith("SELECT * FROM gameinfo_russia_check_source_credentials")) return { rows: [credential] };
    if (sql.startsWith("SELECT enabled FROM")) return { rows: [{ enabled: !disconnect }] };
    if (sql.startsWith("SELECT session_enc,invalidated_at")) return { rows: [credential] };
    if (sql.startsWith("SELECT * FROM gameinfo_russia_check_items")) return { rows: [{ sku: "old", name: "Old pack", status: "active", missing_runs: 0 }] };
    if (sql.includes("SELECT EXISTS(SELECT 1 FROM gameinfo_russia_check_run_sources")) return { rows: [{ seen: true }] };
    if (writeFailure && sql.startsWith("INSERT INTO gameinfo_russia_check_events")) throw Error("fixture write failure");
    if (sql.includes("SELECT COUNT(*)::int total")) return { rows: [{ total: 1, completed: 1, failed: 0 }] };
    if (sql.startsWith("UPDATE gameinfo_russia_check_runs SET status=$2")) finish();
    return { rows: [] };
  });
  globalThis.fetch = async () => Response.json({ code, data: encryptInfoldData(payload) });
  await recoverRussiaChecks();
  let timer;
  try { await Promise.race([completed, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("run did not complete")), 3000); })]); }
  finally { clearTimeout(timer); }
  return log.map((entry) => ({ ...entry }));
}
const packWrites = (entries) => entries.filter(({ text }) => /^(INSERT INTO|UPDATE|DELETE FROM) gameinfo_russia_check_(items|events)/.test(text));
try {
  for (const payload of [{ ...fixture, pagination: { has_more: true } }, { product_list: [] }, { product_list: [{ product_info: { sku_id: "bad", name: "" } }] }]) {
    const entries = await run({ payload });
    assert.equal(packWrites(entries).length, 0);
    assert.ok(entries.some(({ text }) => text.includes("SET status='failed',error=")));
    assert.equal(entries.some(({ text }) => text === "COMMIT"), false);
  }
  const invalid = await run({ code: 1012 });
  assert.equal(packWrites(invalid).length, 0);
  assert.ok(invalid.some(({ text, params }) => text.includes("SET invalidated_at=NOW()") && text.includes("session_enc=$2") && params[1] === credential.session_enc));
  const disconnected = await run({ disconnect: true });
  assert.equal(packWrites(disconnected).length, 0);
  assert.ok(disconnected.some(({ text }) => text === "ROLLBACK"));
  const failedWrite = await run({ writeFailure: true });
  assert.ok(failedWrite.some(({ text }) => text === "ROLLBACK"));
  assert.equal(failedWrite.some(({ text }) => text === "COMMIT"), false);
  const success = await run();
  assert.ok(success.some(({ text }) => text === "COMMIT"));
  assert.equal(success.some(({ text }) => text === "ROLLBACK"), false);
  assert.ok(success.some(({ text, params }) => text.startsWith("INSERT INTO gameinfo_russia_check_events") && params[4] === "added"));
  assert.ok(success.some(({ text, params }) => text.startsWith("UPDATE gameinfo_russia_check_items") && params[2] === "pending_removal"));
} finally { globalThis.fetch = originalFetch; reset(); }
console.log(`${assertions} passed`);
