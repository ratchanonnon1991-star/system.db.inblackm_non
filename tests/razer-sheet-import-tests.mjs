import assert from "node:assert/strict";
import { parseRazerWorkbook, dropCopies, walletAccounts, excelDay, sheetZone, rowRequestId } from "../scripts/lib/razer-sheet-import.mjs";
import { entryInput, accountInput } from "../src/lib/inventory-ledger.js";

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`ok ${name}`); };
const cells = rows => rows.flatMap(([row, values]) => Object.entries(values).map(([col, text]) => ({ row, col, text: String(text) })));
const header = { A: "วันที่ ", B: "ลำดับคิว", C: "ยอดโอน", D: "ต้นทุน", E: "USD เข้า", F: "USD ออก", G: "ผู้เติม", H: "ชื่อลูกค้า",
  I: "เกม", J: "สิ่งที่ชื้อ", K: "หมายเหตุ", L: "วันที่  ตรวจสอบงาน", M: "RazerID", N: "Password" };
const sheet = (title, rows) => ({ title, cells: cells([[1, header], ...rows]) });

check("excel days and zones", () => {
  assert.equal(excelDay("46099"), "2026-03-18");
  assert.equal(excelDay("abc"), null);
  assert.equal(sheetZone("RAZER SGD 26 - 50"), "SGD");
  assert.equal(sheetZone("Razer Other"), "OTHER");
  assert.match(rowRequestId("a", 1), /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(rowRequestId("a", 1), rowRequestId("a", 2));
});

const { rows, skipped } = parseRazerWorkbook([
  { title: "ยอดคงเหลือรวม", cells: cells([[1, { A: "ไอดี" }], [2, { A: "x@y.com" }]]) },
  sheet("RAZER SGD 1 - 25", [
    [2, { A: "46099", E: "370", M: "Ro@Outlook.com ", N: "secret" }],
    [3, { B: "164755", C: "5360", D: "4469.62098", F: "235.07000001", G: "RIN", H: "Customer", I: "SOJ", J: "6480 x 2", K: "032K9", L: "46500", M: "ro@outlook.com", N: "secret" }],
    [4, { A: "46101", F: "5", M: "" }],
    [5, { A: "14/03", F: "5", M: "ro@outlook.com" }],
    [6, { A: "99999", F: "5", M: "ro@outlook.com" }],
    [7, { A: "46102", G: "RIN", M: "ro@outlook.com" }],
    [8, { A: "46102", E: "10", F: "2", M: "ro@outlook.com" }],
  ]),
], "RAZER SGD 1 - 100.xlsx", "2026-10-31");

check("rows: deposits, uses, blank date continues the day above, review date ignored", () => {
  assert.deepEqual(rows.map(r => [r.row, r.kind, r.amount, r.occurredAt.slice(0, 10)]), [
    [2, "deposit", "370.00", "2026-03-18"], [3, "use", "235.07", "2026-03-18"], [8, "deposit", "10.00", "2026-03-21"], [8, "use", "2.00", "2026-03-21"]]);
  const use = rows[1];
  assert.equal(use.email, "ro@outlook.com");
  assert.equal(use.zone, "SGD");
  assert.equal(use.orderRef, "164755");
  assert.equal(use.thbAmount, "4469.62");
  assert.equal(use.saleThb, "5360.00");
  assert.equal(use.invoice, "032K9");
  assert.match(use.note, /ผู้เติม RIN · SOJ 6480 x 2/);
  assert.equal(rows[3].orderRef, "ชีต RAZER SGD 1 - 25 แถว 8");
});

check("never reads passwords or customer names", () => {
  const text = JSON.stringify(rows);
  assert.ok(!text.includes("secret") && !text.includes("Customer"));
});

check("skips rows it cannot place, with a reason", () => {
  assert.deepEqual(skipped.map(s => s.reason), ["ไม่มี RazerID", "วันที่ผิด (14/03)", "วันที่ผิด (99999)"]);
});

check("rows and accounts pass the ledger's own input rules", () => {
  for (const r of rows) entryInput({ ...r, accountId: "1" });
  const accounts = walletAccounts(rows);
  assert.deepEqual(accounts.map(a => accountInput(a).key), ["razer:SGD:ro@outlook.com"]);
  assert.equal(accounts[0].category, "RAZER SGD 1 - 100");
});

check("the same row copied into another tab is kept once", () => {
  const copy = rows.map(r => ({ ...r, file: "RAZER SGD 401 - 500.xlsx" }));
  const { kept, copies } = dropCopies([...rows, ...copy]);
  assert.equal(kept.length, rows.length);
  assert.equal(copies.length, rows.length);
});

check("'Razer Other' layout: blank date header, transaction under another header, password never taken", () => {
  const other = { title: "Razer Other", cells: cells([
    [1, { C: "ลำดับคิว", H: "USD เข้า", I: "USD ออก", T: "วันที่ \n ตรวจสอบงาน", W: "หมายเหตุ", X: "RazerID", Y: "Password" }],
    [2, { B: "46099.0", C: "170859", I: "290.28", T: "032K9YAYFF48C934EA057", X: "in@hotmail.com", Y: "032K9WH591K840226430X" }],
  ]) };
  const [row] = parseRazerWorkbook([other], "RAZER อื่นๆ.xlsx", "2026-10-31").rows;
  assert.equal(row.occurredAt.slice(0, 10), "2026-03-18");
  assert.equal(row.zone, "OTHER");
  assert.equal(row.invoice, "032K9YAYFF48C934EA057");
});

console.log(`${passed} passed`);
