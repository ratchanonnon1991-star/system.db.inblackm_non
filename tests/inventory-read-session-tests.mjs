import assert from "node:assert/strict";
import { createInventoryReadSession, inventoryPollDelay } from "../src/lib/inventory-read-session.js";

let passed = 0, clock = 0;
const timers = new Map(), calls = [];
const reader = createInventoryReadSession({ setTimer: (fn) => { timers.set(++clock, fn); return clock; }, clearTimer: (id) => timers.delete(id),
  request: (url, { signal }) => new Promise((resolve, reject) => {
    calls.push({ url, signal, resolve, reject });
    if (signal.aborted) reject(new DOMException("Cancelled", "AbortError"));
    else signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
  }) });
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); passed++; };
const a = reader.run("first", "/first"); const same = reader.run("first", "/first");
check(a === same, true, "concurrent identical reads share one promise");
await Promise.resolve(); check(calls.length, 1, "only one HTTP read starts");
const b = reader.run("second", "/second");
await assert.rejects(a, { name: "AbortError" }); passed++;
check(calls[0].signal.aborted, true, "switching views aborts obsolete fetch/body parsing");
calls[1].resolve({ value: 2 }); check(await b, { value: 2 }, "replacement read succeeds");
check(timers.size, 0, "settled and cancelled reads release their deadline timers");
const timeout = reader.run("third", "/third"); await Promise.resolve(); [...timers.values()][0]();
await assert.rejects(timeout, { name: "TimeoutError" }); passed++;
const retry = reader.run("third", "/third"); await Promise.resolve(); calls.at(-1).resolve({ recovered: true });
check(await retry, { recovered: true }, "timeout does not leave the read slot permanently locked");
const unmounted = reader.run("fourth", "/fourth"); await Promise.resolve(); reader.cancel();
await assert.rejects(unmounted, { name: "AbortError" }); passed++;
check(timers.size, 0, "unmount releases all read timers");
check([0, 1, 2, 20].map(inventoryPollDelay), [30000, 60000, 120000, 120000], "polling failures back off to a bounded interval");
console.log(`${passed} passed, 0 failed`);
