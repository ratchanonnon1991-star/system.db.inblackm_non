import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { AUTO_SYNC_ACTOR, SYNC_INTERVAL_MS, createAutoSyncLoop, safeSyncError } from "../scripts/lib/usdcodashop-auto-sync.mjs";
let passed = 0;
const check = (v) => { assert.ok(v); passed++; };
check(SYNC_INTERVAL_MS === 60000);
check(AUTO_SYNC_ACTOR.id === 0 && AUTO_SYNC_ACTOR.displayName === "USDCodashop Auto Sync");
check(!safeSyncError(new Error("postgresql://secret:password@host")).includes("password"));
check(safeSyncError({ code: "CODA_NOT_CONFIGURED" }).includes("ยอดยกมา"));
check(safeSyncError({ status: 409, message: "Order K1: ambiguous" }).includes("K1"));

let release; let runs = 0; const events = []; const timers = []; const logs = [];
const loop = createAutoSyncLoop({
  run: async () => { runs++; await new Promise((resolve) => { release = resolve; }); return { added: 1, checked: 1 }; },
  report: async (event) => events.push(event), log: (s) => logs.push(s),
  schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel() {},
});
const active = loop.tick();
await new Promise((resolve) => setImmediate(resolve));
await loop.tick(); check(runs === 1); check(timers.length === 0);
release(); await active;
check(events[0].state === "syncing" && events[1].state === "ok");
check(timers.length === 1 && timers[0].ms === 60000); check(logs[0].includes("added=1"));
await loop.stop(); await timers[0].fn(); check(runs === 1); check(events.at(-1).state === "stopped");

// Transient failure recovers on the next scheduled run, without overlapping/restarting a tight loop.
let fail = true; const scheduled = []; const reports = []; const messages = [];
const retry = createAutoSyncLoop({
  run: async () => { if (fail) throw new Error("postgresql://private:secret@host"); return { added: 0, checked: 1 }; },
  report: async (event) => reports.push(event), log: (s) => messages.push(s),
  schedule: (fn, ms) => { scheduled.push({ fn, ms }); return fn; }, cancel() {},
});
await retry.tick(); check(reports.at(-1).state === "error"); check(scheduled[0].ms === 60000);
check(!JSON.stringify(messages).includes("private:secret")); fail = false;
await scheduled[0].fn(); check(reports.at(-1).state === "ok"); await retry.stop();

// A synchronous initialization/status failure must be contained and retried too.
let next; const bad = createAutoSyncLoop({ run: async () => { throw new Error("must not run"); },
  report: () => { throw new Error("bad config password"); }, log() {}, schedule: (fn) => { next = fn; }, cancel() {} });
await bad.tick(); check(typeof next === "function"); await bad.stop();

const waitingReports = []; const waiting = createAutoSyncLoop({
  run: async () => { throw Object.assign(new Error("unconfigured"), { code: "CODA_NOT_CONFIGURED" }); },
  report: async (v) => waitingReports.push(v), log() {}, schedule() {}, cancel() {},
});
await waiting.tick(); check(waitingReports.at(-1).state === "waiting"); await waiting.stop();

// SIGTERM-style stop waits for the in-flight work before writing stopped and schedules no new round.
let finish; const shutdownEvents = []; let count = 0;
const graceful = createAutoSyncLoop({ run: async () => { await new Promise((resolve) => { finish = resolve; }); return { added: 0, checked: 0 }; },
  report: async (s) => shutdownEvents.push(s.state), log() {}, schedule: () => { count++; }, cancel() {} });
const inFlight = graceful.tick(); await new Promise((resolve) => setImmediate(resolve));
const stopping = graceful.stop(); finish(); await Promise.all([inFlight, stopping]);
check(shutdownEvents.at(-1) === "stopped"); check(count === 0);

// Resolve real source aliases in a separate process (not the suite's DB stubs).
const alias = spawnSync(process.execPath, ["--import", "./scripts/register-app-alias.mjs", "--input-type=module", "-e",
  'import { CODA_BOUNDARY } from "@/lib/usdcodashop-ledger"; console.log(CODA_BOUNDARY);'], { encoding: "utf8" });
check(alias.status === 0 && alias.stdout.trim() === "K7306171");
const disabled = spawnSync(process.execPath, ["./scripts/usdcodashop-sync-worker.mjs"], {
  encoding: "utf8", env: { ...process.env, CODASHOP_AUTO_SYNC_ENABLED: "false" }, timeout: 15000,
});
check(disabled.status === 0 && disabled.stdout.includes("disabled"));
const require = createRequire(import.meta.url);
const worker = require("../ecosystem.config.cjs").apps.find((app) => app.name === "usdcodashop-sync-worker");
check(worker.instances === 1 && worker.exec_mode === "fork" && worker.autorestart);
check(worker.script === "scripts/usdcodashop-sync-worker.mjs");
for (const file of ["deploy-server.sh", ".github/workflows/deploy.yml"]) {
  check(readFileSync(new URL(`../${file}`, import.meta.url), "utf8").includes("--only system.db.inblackm,usdcodashop-sync-worker"));
}
const entry = readFileSync(new URL("../scripts/usdcodashop-sync-worker.mjs", import.meta.url), "utf8");
check(entry.includes("default_transaction_read_only=on")); check(!entry.includes("tests/register.mjs"));
check(entry.includes('process.on("SIGTERM"'));
console.log(`${passed} passed`);
