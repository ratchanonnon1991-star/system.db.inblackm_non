import strict from "node:assert/strict";
import { log, reset, setResponder } from "@/lib/db";
import { getRussiaCheckRun, startRussiaCheck } from "@/server/gameinfo-russia-check";
import { encryptRussiaCheckSession } from "@/server/crypto";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
const source = { id: 5, provider: "gryphline", game_id: 217, expected_game_name: "ARKNIGHTS: ENDFIELD" };
const session = { kind: "gryphline", version: 1, token: "Zml4dHVyZQ==", appCode: "d9f6dbb6bbd6bb33", serverId: "1", region: "TH" };
const credential = { credential_kind: "gryphline", verified_at: new Date(), session_enc: encryptRussiaCheckSession(JSON.stringify(session)) };
const payload = { status: 0, data: { region: "TH", productType: [], productList: [{ productCode: "new", productName: "New pack" }] } };
const originalFetch = globalThis.fetch;
await assert.rejects(getRussiaCheckRun(999999), { status: 404 });
let id = 3000;
async function run({ data = payload, disconnect = false, retryId = null, missingCredential = false } = {}) {
  reset(); id++;
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  setResponder((sql, params) => {
    if (sql.startsWith("SELECT s.id FROM gameinfo_russia_check_sources")) {
      assert.ok(sql.includes("s.provider='gryphline' AND c.credential_kind='gryphline' AND c.verified_at IS NOT NULL AND c.invalidated_at IS NULL"));
      if (retryId) { assert.ok(sql.includes("previous.run_id=$2 AND previous.status='failed'")); assert.deepEqual(params, [217, retryId]); }
      return { rows: [{ id: source.id }] };
    }
    if (sql.startsWith("INSERT INTO gameinfo_russia_check_runs")) return { rows: [{ id, status: "queued" }] };
    if (sql.includes("SELECT s.* FROM gameinfo_russia_check_run_sources")) return { rows: [source] };
    if (sql.startsWith("SELECT id, game FROM game_list")) return { rows: [{ game: source.expected_game_name }] };
    if (sql.startsWith("SELECT * FROM gameinfo_russia_check_source_credentials")) return { rows: missingCredential ? [] : [credential] };
    if (sql.startsWith("SELECT enabled FROM")) return { rows: [{ enabled: !disconnect }] };
    if (sql.startsWith("SELECT session_enc,invalidated_at")) return { rows: [credential] };
    if (sql.includes("SELECT COUNT(*)::int total")) return { rows: [{ total: 1, completed: 1, failed: 0 }] };
    if (sql.startsWith("UPDATE gameinfo_russia_check_runs SET status=$2")) finish();
    return { rows: [] };
  });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json(data); };
  await startRussiaCheck({ id: 1 }, "manual", 217, retryId);
  let timer;
  try { await Promise.race([done, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("run did not finish")), 3000); })]); }
  finally { clearTimeout(timer); }
  return { entries: [...log], calls };
}
const writes = (entries) => entries.filter(({ text }) => /^(INSERT INTO|UPDATE|DELETE FROM) gameinfo_russia_check_(items|events)/.test(text));
try {
  const success = await run({ retryId: 2999 });
  assert.ok(success.entries.some(({ text, params }) => text.startsWith("INSERT INTO gameinfo_russia_check_events") && params[4] === "added"));
  for (const options of [{ data: { status: 3 } }, { data: { status: 0, data: { ...payload.data, productList: [] } } }, { data: { status: 0, data: { ...payload.data, hasMore: true } } }, { disconnect: true }, { missingCredential: true }]) {
    const failed = await run(options);
    assert.equal(writes(failed.entries).length, 0);
    assert.ok(failed.entries.some(({ text }) => text.includes("SET status='failed',error=")));
    if (options.data?.status === 3) assert.ok(failed.entries.some(({ text, params }) => text.includes("SET invalidated_at=NOW()") && params[1] === credential.session_enc));
    if (options.missingCredential) assert.equal(failed.calls, 0);
  }
} finally { globalThis.fetch = originalFetch; reset(); }
console.log(`${assertions} passed`);
