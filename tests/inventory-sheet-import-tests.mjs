import assert from "node:assert/strict";
import { parseAccountWorkbook, mergeSnapshots, ledgerEntries, dropDebited, sheetDay, workbookCategory, SKIPPED_WORKBOOK } from "../scripts/lib/inventory-sheet-import.mjs";
import { importRowsFromCsv } from "../scripts/lib/inventory-ledger-import.mjs";
import { entryInput, accountInput } from "../src/lib/inventory-ledger.js";

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`ok ${name}`); };
const cells = (rows) => rows.flatMap(([row, values]) => Object.entries(values).map(([col, text]) => ({ row, col, text: String(text) })));

check("dates: Excel days and day-first text, Buddhist years, impossible dates refused", () => {
  assert.equal(sheetDay("46099"), "2026-03-18");
  assert.equal(sheetDay("1/11/2026"), "2026-11-01");
  assert.equal(sheetDay("01/11/26"), "2026-11-01");
  assert.equal(sheetDay("1/11/2569"), "2026-11-01");
  assert.equal(sheetDay("01/11/69"), "2026-11-01");
  for (const bad of ["31/02/2026", "#1234", "a1b2-c3", ""]) assert.equal(sheetDay(bad), null, bad);
});

check("workbook names trim like the registry import, and non-account workbooks are skipped", () => {
  assert.equal(workbookCategory("x/1.2 UID ( MMK )_.xlsx"), "1.2 UID ( MMK )");
  const csv = '"ไฟล์","แท็บ (บัญชี/ช่องทาง)","สกุลเงิน (เดา)"\n"1.2 UID ( MMK )_","WAVEPAY 1 (80888)","MMK"\n';
  assert.equal(importRowsFromCsv(csv).accounts[0].ref, `${workbookCategory("1.2 UID ( MMK )_.xlsx")} :: WAVEPAY 1 (80888)`);
  // inner double spaces stay, as in the registry ("1.1 UID (  SMILEONE ...")
  assert.equal(workbookCategory("1.1 UID (  SMILEONE , GARENA,My CARD ).xlsx"), "1.1 UID (  SMILEONE , GARENA,My CARD )");
  for (const name of ["2.1 STOCK_ (ใช้เดือน10).xlsx", "5.BANK STATEMENT BOT.xlsx", "0.3 ORDER PAGE.xlsx", "C0.4 Preorder Genshin Impact.xlsx"]) assert.ok(SKIPPED_WORKBOOK.test(name), name);
  assert.ok(!SKIPPED_WORKBOOK.test("1.6 UID ( JPY )_.xlsx"));
});

const standard = { title: "WAVEPAY 1 (80888)", cells: cells([
  [1, { A: "วันที่", B: "ลำดับคิว", C: "ยอดโอน", D: "ต้นทุน", E: "MMK เข้าซิม", F: "MMK ออกซิม", G: "MMK คงเหลือ", H: "ผู้เติม", I: "เกมที่เติม", J: "SECRETPASS99", K: "ยอดเข้าไม่ทราบ ตรวจสอบ" }],
  [2, { A: "46099", E: "50000", G: "50000", J: "SECRETPASS99" }],
  [3, { B: "#101", C: "300", D: "250.555", F: "10000", G: "40000", H: "RIN", I: "MLBB" }],
  [4, { A: "46100", B: "#102", F: "5000", H: "Bot aToM" }],
  [5, { A: "1/03/2026", B: "#103", F: "5000", H: "" }],
  [6, { A: "#9999", F: "1" }],
  [7, { A: "46101", E: "200", H: "BoT AtOM" }],
]) };
const moniepoint = { title: "Moniepoint NP 1 [8184]", cells: cells([
  [1, { H: "account-holder-name", S: "pin 1234" }],
  [2, { A: "CHECK", B: "วันที่", C: "ลำดับที่", D: "ยอดโอน", E: "ต้นทุนรวม", H: "จำนวนเงิน เข้าเติมเงิน", I: "จำนวนเงิน เข้าอื่นๆ", J: "จำนวนเงิน ออกอื่นๆ", K: "จำนวนเงิน ออก TOPUP", L: "จำนวนเงิน คงเหลือ", N: "ผู้ทำรายการเติม", O: "ชื่อลูกค้า" }],
  [3, { B: "46327", H: "7900", L: "7900" }],
  [4, { B: "46327", I: "100", N: "BILLY", O: "Customer Name" }],
  [5, { B: "46328", C: "77", D: "120", E: "90", K: "500", J: "20", N: "BILLY", O: "Customer Name" }],
]) };
const packs = { title: "pes1", cells: cells([[1, { A: "ลำดับคิว", B: "130 เข้า", C: "130 ออก", D: "300 เข้า", E: "300 ออก" }], [2, { B: "1" }]]) };
const { tabs, skipped } = parseAccountWorkbook([standard, moniepoint, packs, { title: "ตรวจสอบยอดคงเหลือ", cells: cells([[1, { A: "ไอดี" }]]) }], "1.2 UID ( MMK )_.xlsx", "2026-11-04");

check("standard tab: deposit and use, blank date continues the day above, bot use and bad dates skipped, bot deposits kept", () => {
  const rows = tabs.get("1.2 UID ( MMK ) :: WAVEPAY 1 (80888)").rows;
  assert.deepEqual(rows.map((r) => [r.kind, r.amount, r.day, r.queue]), [
    ["deposit", "50000.00", "2026-03-18", ""], ["use", "10000.00", "2026-03-18", "#101"], ["use", "5000.00", "2026-03-01", "#103"],
    ["deposit", "200.00", "2026-03-20", ""]]);
  assert.deepEqual([rows[1].cost, rows[1].sale, rows[1].note], ["250.56", "300.00", "ชีต 1.2 UID ( MMK ) / WAVEPAY 1 (80888) · ผู้เติม RIN · MLBB"]);
  assert.equal(rows[2].blankOperator, true);
  assert.deepEqual(skipped.map((s) => s.reason), ["บอท", "วันที่ผิด (#9999)", "รูปแบบอื่น (หลายคอลัมน์เข้า/ออก)"]);
});

check("Moniepoint tab: header on row 2, other in / out become adjustments, top-up out is use", () => {
  const rows = tabs.get("1.2 UID ( MMK ) :: Moniepoint NP 1 [8184]").rows;
  assert.deepEqual(rows.map((r) => [r.kind, r.amount, r.queue]), [
    ["deposit", "7900.00", ""], ["adjust_in", "100.00", ""], ["adjust_out", "20.00", "77"], ["use", "500.00", "77"]]);
});

check("only named columns are read: no passwords, PINs or customer names", () => {
  const text = JSON.stringify([...tabs.values()]);
  for (const secret of ["SECRETPASS99", "pin 1234", "account-holder-name", "Customer Name"]) assert.ok(!text.includes(secret), secret);
});

check("a column of customer names typed under the operator header never reaches a note", () => {
  const many = Array.from({ length: 70 }, (_, i) => [i + 2, { A: "46099", B: `#${i}`, F: "1", H: `Customer ${i}` }]);
  const console = { title: "PSN Account", cells: cells([[1, { A: "วันที่", B: "ลำดับคิว", E: "ยอดเข้า", F: "ยอดออก", H: "ผู้ทำรายการเติม" }], ...many]) };
  const rows = parseAccountWorkbook([console], "4 CONSOLE__.xlsx", "2026-11-04").tabs.get("4 CONSOLE :: PSN Account").rows;
  assert.equal(rows.length, 70);
  assert.ok(rows.every((r) => !r.operator && !r.note.includes("Customer")));
});

check("uses already recorded on the debit page for the same account and order are left out", () => {
  const body = (accountId, kind, orderRef) => ({ accountId, kind, orderRef });
  const { kept, dropped } = dropDebited([body("1", "use", "#101"), body("2", "use", "#101"), body("1", "use", "ไม่มีคิว"), body("1", "deposit")], new Set(["1|#101", "1|ไม่มีคิว"]));
  assert.equal(dropped, 1);
  assert.deepEqual(kept.map((b) => `${b.accountId}|${b.kind}|${b.orderRef}`), ["2|use|#101", "1|use|ไม่มีคิว", "1|deposit|undefined"]);
});

check("backup + current: each row kept as often as the snapshot that has it most", () => {
  const r = (queue, day = "2026-10-30") => ({ kind: "use", amount: "1.00", day, queue, invoice: null, note: "n" });
  const merged = mergeSnapshots([[r("a"), r("b"), r("b")], [r("b"), r("c", "2026-11-01")]]);
  assert.deepEqual(merged.map((x) => x.queue), ["a", "b", "b", "c"]);
});

check("ledger rows: ids from content (stable when rows move), repeats kept apart, valid ledger input", () => {
  const rows = tabs.get("1.2 UID ( MMK ) :: WAVEPAY 1 (80888)").rows, key = accountInput({ provider: "wavepay", ref: "x", label: "x", currency: "MMK" }).key;
  const a = ledgerEntries(key, rows), b = ledgerEntries(key, [...rows].reverse());
  assert.deepEqual(new Set(a.map((e) => e.requestId)), new Set(b.map((e) => e.requestId)));
  const twice = ledgerEntries(key, [rows[1], rows[1]]);
  assert.notEqual(twice[0].requestId, twice[1].requestId);
  for (const e of [...a, ...ledgerEntries(key, tabs.get("1.2 UID ( MMK ) :: Moniepoint NP 1 [8184]").rows)]) entryInput({ ...e, accountId: "1" });
  assert.equal(a.find((e) => e.kind === "use").orderRef, "#101");
});

console.log(`${passed} passed`);
