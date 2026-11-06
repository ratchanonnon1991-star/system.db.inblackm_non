import assert from "node:assert/strict";
import { saveOrderAccount, resolveOrderActor, runOrderBridge } from "@/server/itune-order-usage";
import { log, reset, setResponder } from "@/lib/db";

// Staff links: any tools user may be linked and record channel amounts; iTune mails still need Topup.
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`ok ${name}`); };
const users = { 7: { id: 7, username: "reserver", role: "user", permissions: [] }, 8: { id: 8, username: "topup", role: "user", permissions: ["projectm.claim"] } };
let linkedTo = 7;
reset();
setResponder((sql, params) => {
  if (sql.includes("SELECT gamedb_user_id FROM gamedb_itune_order_accounts")) return { rows: linkedTo ? [{ gamedb_user_id: linkedTo }] : [] };
  if (sql.includes("FROM gamedb_users u") && sql.includes("LOWER(u.username)")) {
    const user = Object.values(users).find((u) => u.username === String(params[0]).toLowerCase());
    return { rows: user ? [user] : [] };
  }
  if (sql.includes("FROM gamedb_users u") && sql.includes("WHERE u.id")) return { rows: users[params[0]] ? [users[params[0]]] : [] };
  if (sql.includes("INSERT INTO gamedb_itune_order_accounts")) return { rows: [] };
  return null;
});

await check("a tools user without Topup permission can be linked", async () => {
  await saveOrderAccount({ externalUserId: "staff-1", username: "reserver" }, { id: 1 });
  const insert = log.find((q) => q.text.includes("INSERT INTO gamedb_itune_order_accounts"));
  assert.deepEqual(insert.params, ["staff-1", 7, 1]);
});

await check("an unknown username is refused", async () => {
  await assert.rejects(saveOrderAccount({ externalUserId: "staff-2", username: "nobody" }, { id: 1 }), { status: 400, message: /ไม่พบชื่อผู้ใช้/ });
});

await check("the channel bridge accepts any linked user; an unlinked ID is refused", async () => {
  assert.equal((await resolveOrderActor("staff-1")).id, 7);
  linkedTo = null;
  await assert.rejects(resolveOrderActor("staff-9"), { status: 403 });
  linkedTo = 7;
});

await check("picking iTune mails still needs Topup permission", async () => {
  await assert.rejects(runOrderBridge({ action: "list", actorId: "staff-1", payload: {} }), { status: 403 });
});

console.log(`${passed} passed`);
