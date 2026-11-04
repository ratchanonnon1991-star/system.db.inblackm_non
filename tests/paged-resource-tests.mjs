// Exercise the actual hook with a controllable effect/timer scheduler. Browser
// QA separately checks React DOM inert/loading behavior with these same clients.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createInventoryReadSession } from "../src/lib/inventory-read-session.js";

let cursor = 0, slots = [], pendingEffects = [], calls = [], sequence = 0, passed = 0;
const timers = new Map();
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const react = {
  useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; },
  useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
  useCallback(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
  useEffect(effect, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { const cleanup = slots[index]?.cleanup; slots[index] = { deps }; pendingEffects.push(() => { cleanup?.(); slots[index].cleanup = effect(); }); } },
};
const hookExports = {};
const js = ts.transpileModule(readFileSync(new URL("../src/lib/use-paged-resource.js", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function("require", "exports", "setTimeout", "clearTimeout", js)((key) => {
  if (key === "react") return react;
  if (key === "@/lib/inventory-read-session") return { createInventoryReadSession: () => createInventoryReadSession({ request: (url, options) => new Promise((resolve, reject) => calls.push({ url, signal: options.signal, resolve, reject })) }) };
  throw Error(key);
}, hookExports, (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; }, (id) => timers.delete(id));
const eq = (a, b, why) => { assert.deepEqual(a, b, why); passed++; };
let endpoint = "/history", params = { page: 1, search: "" }, resource;
const render = () => { cursor = 0; resource = hookExports.usePagedResource(endpoint, params); return resource; };
const commit = () => { for (const effect of pendingEffects.splice(0)) effect(); };
const tick = async () => { const [id, timer] = [...timers][0]; timers.delete(id); void timer.fn(); await Promise.resolve(); await Promise.resolve(); };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const result = (id, snapshot) => ({ history: [{ id }], pagination: { page: params.page, total: 99, snapshot } });
render(); eq(resource.loading, true); commit(); await tick();
calls[0].resolve(result("first", "original")); await flush(); render(); eq(resource.loading, false);
params = { page: 2, search: "" }; render(); eq(resource.loading, true, "new view is locked before its effect runs"); commit(); await tick();
eq(new URL(calls[1].url, "https://x").searchParams.get("snapshot"), "original");
resource.reload(); eq(calls[1].signal.aborted, true, "manual reload cancels immediately");
// Deliberately ignore AbortSignal and resolve before the next effect cleanup.
calls[1].resolve(result("obsolete", "obsolete-token")); await flush(); render();
eq(resource.data.history[0].id, "first", "obsolete reply cannot replace visible data or restore its token"); eq(resource.loading, true);
commit(); await tick(); eq(new URL(calls[2].url, "https://x").searchParams.get("snapshot"), null);
calls[2].resolve(result("fresh", "fresh-token")); await flush(); render(); eq(resource.data.history[0].id, "fresh");
params = { page: 1, search: "n" }; render(); eq(resource.loading, true, "debounce immediately locks old rows"); commit(); eq([...timers.values()][0].delay, 250);
await tick(); calls[3].reject(new Error("temporary failure")); await flush(); render(); eq(resource.error, "temporary failure");
resource.reload(); render(); eq(resource.error, "", "retry hides the obsolete error while waiting"); commit(); await tick();
calls[4].resolve(result("recovered", "retry-token")); await flush(); render(); eq(resource.error, ""); eq(resource.loading, false);
endpoint = "/another-card"; render(); eq(resource.data, null, "resource changes cannot flash another card's data"); eq(resource.loading, true);
commit(); await tick(); calls[5].resolve(result("another", "another-token")); await flush(); render(); eq(resource.data.history[0].id, "another");
for (const slot of slots) slot?.cleanup?.();
console.log(`${passed} passed`);
