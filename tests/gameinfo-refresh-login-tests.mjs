import strict from "node:assert/strict";
import { refreshWithLogin, loginRequiredGames } from "../src/lib/gameinfo-russia-check-refresh.js";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
const missing = (id) => ({ gameId: id, sourceId: id, gameName: `Game ${id}`, catalogSupported: true, authRequired: true, authState: "missing", sourceEnabled: false });
const fixture = [missing(3), missing(217), { ...missing(22), authRequired: false, authState: "not_required", sourceEnabled: true }, { ...missing(999), isDemo: true }];
assert.deepEqual(loginRequiredGames(fixture).map((g) => g.gameId), [3, 217]);
assert.deepEqual(loginRequiredGames(fixture, 217).map((g) => g.gameId), [217]);
assert.equal(loginRequiredGames([{ ...missing(3), configError: true }, { ...missing(4), catalogSupported: false }]).length, 0);
function harness({ games = structuredClone(fixture), gameId = null, cancel = false, denied = false, expiresDuringRun = false, reExpires = false } = {}) {
  const calls = [], logins = [], progress = [];
  let runCount = 0, active = 0, maxActive = 0;
  const options = {
    gameId, canManage: !denied, loadDashboard: async () => ({ games }), wait: async () => {}, onProgress: (value) => progress.push(value),
    connect: async (game) => {
      active++; maxActive = Math.max(maxActive, active); logins.push(game.sourceId);
      if (cancel) throw Error("cancelled");
      await Promise.resolve();
      game.authState = "verified"; game.sourceEnabled = true; active--;
    },
    startRun: async (body) => { calls.push(body); runCount++; return { run: { id: runCount, status: "queued" } }; },
    readRun: async (id) => {
      if (expiresDuringRun && (id === 1 || reExpires)) {
        const game = games.find((g) => g.sourceId === 217); game.authState = "invalid";
        return { run: { id, status: "partial", sources: [{ sourceId: 217, status: "failed" }, { sourceId: 22, status: "completed" }] } };
      }
      return { run: { id, status: "completed", sources: [] } };
    },
  };
  return { options, calls, logins, progress, maximum: () => maxActive };
}
const all = harness();
await refreshWithLogin(all.options);
assert.deepEqual(all.logins, [3, 217]);
assert.equal(all.maximum(), 1);
assert.deepEqual(all.calls, [{ gameId: null, retryRunId: null }]);
const selected = harness({ gameId: 217 });
await refreshWithLogin(selected.options);
assert.deepEqual(selected.logins, [217]);
assert.equal(selected.calls[0].gameId, 217);
for (const option of [{ cancel: true }, { denied: true }]) {
  const h = harness(option);
  await assert.rejects(refreshWithLogin(h.options));
  assert.equal(h.calls.length, 0);
}
const valid = fixture.filter((g) => !g.isDemo).map((g) => ({ ...g, authState: g.authRequired ? "verified" : "not_required", sourceEnabled: true }));
const expired = harness({ games: structuredClone(valid), expiresDuringRun: true });
await refreshWithLogin(expired.options);
assert.deepEqual(expired.logins, [217]);
assert.deepEqual(expired.calls, [{ gameId: null, retryRunId: null }, { gameId: null, retryRunId: 1 }]);
const repeated = harness({ games: structuredClone(valid), expiresDuringRun: true, reExpires: true });
await assert.rejects(refreshWithLogin(repeated.options), /ยังใช้ไม่ได้/);
assert.deepEqual(repeated.logins, [217]);
assert.equal(repeated.calls.length, 2);
const noLogin = harness({ games: [valid.find((g) => g.sourceId === 22)] });
await refreshWithLogin(noLogin.options);
assert.equal(noLogin.logins.length, 0);
const fakeSaved = harness(); fakeSaved.options.connect = async () => {};
await assert.rejects(refreshWithLogin(fakeSaved.options), /ยังยืนยัน Login/);
assert.equal(fakeSaved.calls.length, 0);
const long = harness({ games: [] }); long.options.readRun = async (id) => ({ run: { id, status: "running" } });
await assert.rejects(refreshWithLogin(long.options), /ยังทำงานอยู่/);
assert.equal(long.calls.length, 1);
console.log(`${assertions} passed`);
