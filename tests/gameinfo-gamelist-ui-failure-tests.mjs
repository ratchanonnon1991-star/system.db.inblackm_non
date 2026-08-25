import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/gameinfo-gamelist-table.js", import.meta.url), "utf8");
const cards = readFileSync(new URL("../src/components/gameinfo-gamelist-cards.js", import.meta.url), "utf8");
const deleteRequest = source.indexOf('await apiJson(`/api/gameinfo/gamelist/${id}`, { method: "DELETE" })');
const removeRow = source.indexOf("setRows((prev) => prev.filter((r) => r.id !== id))", deleteRequest);

assert.ok(deleteRequest >= 0 && removeRow > deleteRequest, "persisted games are removed from UI only after DELETE succeeds");
assert.ok(source.includes('setStatusError(error instanceof Error ? error.message : "ลบเกมไม่สำเร็จ")'));
assert.ok(source.includes('setSaveError(error instanceof Error ? error.message : "บันทึกข้อมูลเกมไม่สำเร็จ")'));
assert.ok(source.includes("ข้อมูลบางส่วนอาจถูกบันทึกแล้ว"));
assert.ok(source.includes("onClick={requestGameinfoReload}"), "reload after a partial save goes through the unsaved guard");
assert.ok(cards.includes("อัปเดต Report ไม่สำเร็จ — ระบบจะลองใหม่อัตโนมัติ"));

console.log("6 passed");
