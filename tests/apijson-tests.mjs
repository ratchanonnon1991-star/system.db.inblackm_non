import { apiJson } from "@/lib/api-json.js";

let pass = 0;
const fail = [];
const ok = (name, cond) => (cond ? pass++ : fail.push(name));

const reply = (body, status = 200, okFlag = status >= 200 && status < 300) => {
  globalThis.fetch = async () => ({ ok: okFlag, status, text: async () => body });
};

const grab = async (fn) => {
  try {
    return { value: await fn() };
  } catch (err) {
    return { err };
  }
};

// HTML error page: says what happened and keeps the status
reply("<!DOCTYPE html><html><body>504 Gateway Time-out</body></html>", 504);
let r = await grab(() => apiJson("/api/connections/test", { fallbackError: "ทดสอบการเชื่อมต่อไม่สำเร็จ" }));
ok("html: throws", !!r.err);
ok("html: no parser message", !/Unexpected token/.test(r.err.message));
ok("html: names the failure", r.err.message.includes("ทดสอบการเชื่อมต่อไม่สำเร็จ"));
ok("html: carries status text", r.err.message.includes("HTTP 504"));
ok("html: err.status", r.err.status === 504);
ok("html: keeps a snippet", r.err.body.startsWith("<!DOCTYPE html>"));

// HTML on a 200 is still not JSON
reply("<!DOCTYPE html>ok", 200);
r = await grab(() => apiJson("/x", { fallbackError: "พัง" }));
ok("html 200: throws", !!r.err && r.err.status === 200);

// A proper JSON error keeps the server's own message, with no status noise
reply(JSON.stringify({ error: "pk ไม่ถูกต้อง" }), 400);
r = await grab(() => apiJson("/x", { fallbackError: "แก้ไขข้อมูลไม่สำเร็จ" }));
ok("json 400: server message", r.err.message === "pk ไม่ถูกต้อง");
ok("json 400: status", r.err.status === 400);
ok("json 400: data", r.err.data.error === "pk ไม่ถูกต้อง");

// JSON error with no message falls back, and says the status
reply(JSON.stringify({}), 500);
r = await grab(() => apiJson("/x", { fallbackError: "พัง" }));
ok("json 500: fallback", r.err.message === "พัง (HTTP 500)");

// Empty body, not ok -> fallback rather than a parse error
reply("", 405);
r = await grab(() => apiJson("/x", { fallbackError: "เมธอดไม่ถูกต้อง" }));
ok("empty 405: fallback", r.err.message === "เมธอดไม่ถูกต้อง (HTTP 405)");
ok("empty 405: not a parse error", !/JSON/.test(r.err.message) || r.err.message.includes("HTTP 405"));

// Empty 204 succeeds with null instead of throwing
reply("", 204);
r = await grab(() => apiJson("/x"));
ok("empty 204: ok", !r.err && r.value === null);

// The happy path is unchanged
reply(JSON.stringify({ flags: { 0: { allowWrite: true } } }), 200);
r = await grab(() => apiJson("/x"));
ok("ok: returns parsed body", r.value.flags[0].allowWrite === true);

// Default fallback still applies
reply("<html>", 502);
r = await grab(() => apiJson("/x"));
ok("default fallback", r.err.message.startsWith("เกิดข้อผิดพลาด"));

console.log(`${pass} passed, ${fail.length} failed`);
if (fail.length) { console.log(fail.join("\n")); process.exit(1); }
