import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { usdCents, centsUsd, normalizeUsdInventory, mapUsdInventory, canManageUsdInventory, canViewUsdInventory } from "../src/lib/usdcodashop-inventory.js";
import { createUsdInventoryRepository } from "../src/server/usdcodashop-inventory.js";

let count = 0;
const check = (condition) => { assert.ok(condition); count++; };
const admin = { id: 16, username: "khong", permissions: ["projectm.admin", "projectm.claim"] };
const topup = { id: 17, permissions: ["projectm.claim"] };
check(canViewUsdInventory(topup)); check(!canManageUsdInventory(topup)); check(canManageUsdInventory(admin)); check(!canViewUsdInventory(null)); check(!canViewUsdInventory({ permissions: [] }));
for (const [current, used, remaining] of [["51.35", "0.00", "51.35"], ["376.74", "0", "376.74"], ["15,665.80", "1,047.79", "14618.01"], ["1458.00", "1452.36", "5.64"], ["573.69", "572.67", "1.02"], ["309.16", "301.80", "7.36"], ["0.30", "0.20", "0.10"]]) {
  check(normalizeUsdInventory({ name: "account", status: "ปกติ", current, used }).remaining === remaining);
}
for (const value of ["-1", "1.001", "NaN", "Infinity", "1e3", "1,2", "1000000000000", "", null]) { assert.throws(() => usdCents(value), { status: 400 }); count++; }
check(centsUsd(usdCents("999,999,999,999.99")) === "999999999999.99");
const body = { name: "(USD) Skrill", status: "ปกติ", current: "51.35", used: "0.00", requestId: "00000000-0000-4000-8000-000000000001", createdBy: "forged", remaining: "99999" };
assert.throws(() => normalizeUsdInventory({ ...body, used: "51.36" }), { status: 400 }); count++;
assert.throws(() => normalizeUsdInventory({ ...body, status: "invalid" }), { status: 400 }); count++;
assert.throws(() => normalizeUsdInventory({ ...body, name: " " }), { status: 400 }); count++;
const row = { id: "1", account_name: body.name, status: body.status, current_amount: "51.35", used_amount: "0.00", created_by_user_id: 16, created_by_label: "khong", updated_by_label: "khong", request_id: body.requestId, version: 1 };
check(mapUsdInventory(row).remaining === "51.35");
let entries = []; let conflict = false; let failAudit = false; const statements = [];
const client = {
  query: async (sql, params) => {
    statements.push({ sql, params });
    if (sql.startsWith("SELECT * FROM gamedb_usdcodashop_inventory")) return { rows: params ? entries.filter((entry) => String(entry.id) === String(params[0]) || entry.request_id === params[0]) : entries };
    if (sql.startsWith("INSERT INTO gamedb_usdcodashop_inventory\n")) { if (conflict) return { rows: [] }; entries = [{ ...row }]; return { rows: entries }; }
    if (sql.startsWith("UPDATE gamedb_usdcodashop_inventory")) { const updated = { ...row, account_name: params[1], status: params[2], current_amount: params[3], used_amount: params[4], version: 2 }; return { rows: [updated] }; }
    if (sql.startsWith("INSERT INTO gamedb_usdcodashop_inventory_log") && failAudit) throw new Error("audit failed");
    return { rows: [] };
  }, release() {},
};
const pool = { query: client.query, connect: async () => client };
const repo = createUsdInventoryRepository(pool);
await assert.rejects(repo.list({ permissions: [] }), { status: 403 }); count++;
await assert.rejects(repo.save(body, topup), { status: 403 }); count++;
const saved = await repo.save(body, admin); check(saved.createdBy === "khong");
const insert = statements.find((item) => item.sql.startsWith("INSERT INTO gamedb_usdcodashop_inventory\n"));
check(insert.params[5] === 16 && insert.params[6] === "khong"); check(!insert.sql.includes(body.name));
check(statements.some((item) => item.sql.includes("inventory_log") && item.params?.[1] === "create"));
check((await repo.list(topup)).canManage === false);
const auditCount = () => statements.filter((item) => item.sql.startsWith("INSERT INTO gamedb_usdcodashop_inventory_log")).length;
conflict = true; const beforeAudits = auditCount();
await repo.save(body, admin); check(auditCount() === beforeAudits);
await assert.rejects(repo.save({ ...body, name: "changed" }, admin), { status: 409 }); count++;
await assert.rejects(repo.save({ ...body, version: 0 }, admin, "1"), { status: 400 }); count++;
await assert.rejects(repo.save({ ...body, version: 2 }, admin, "1"), { status: 409 }); count++;
const updated = await repo.save({ ...body, version: 1, used: "1.35" }, admin, "1"); check(updated.remaining === "50.00");
failAudit = true;
await assert.rejects(repo.save({ ...body, version: 1 }, admin, "1"), /audit failed/); count++;
check(statements.at(-1).sql === "ROLLBACK");
const api = readFileSync(new URL("../src/app/api/projectm/usdcodashop/route.js", import.meta.url), "utf8");
check((api.match(/await requireAdmin\(request\)/g) || []).length === 3);
check(api.includes('sec-fetch-site') && api.includes("16384") && api.includes('"no-store"'));
console.log(`\n${count} passed, 0 failed`);
