import assert from "node:assert/strict";
import { parseItuneMailTab } from "../scripts/lib/itune-mail-import.mjs";

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`ok ${name}`); };
const cells = (rows) => rows.flatMap(([row, values]) => Object.entries(values).map(([col, text]) => ({ row, col, text: String(text) })));
// The real tab: the mail sits in I while the "เมล" header (with the currency under it) is over N.
const header = { B: "วันที่สั่งซื้อ", G: "สถานะ", J: "PASS", K: "Status", L: "someone@header.com", N: "เมล", O: "ประเภทเมล", Q: "Supplier", T: "คงเหลือ", V: "LINK SMS", X: "Notice" };
const mail = (row, patch) => [row, { B: "46099", I: `m${row}@x.com`, J: "pw", K: "Active", N: "USD", Q: "Miles", T: "50", V: "https://sms.example/1", X: "ยังไม่พบปัญหา", ...patch }];
const { mails, skipped } = parseItuneMailTab({ cells: cells([[1, header],
  mail(2, {}), mail(3, { T: "0" }), mail(4, { K: "Complete" }), mail(5, { X: "mail lock" }), mail(6, { J: "" }),
  mail(7, { N: "ITUNE +9" }), mail(8, { I: "M2@X.com" }), mail(9, { V: "0812345678", N: "DE", T: "12.345" }), [10, { A: "note" }]]) });

check("usable mails only: balance left, not Complete, no problem, with password and currency", () => {
  assert.deepEqual(mails.map((m) => [m.email, m.currency, m.amount]), [["m2@x.com", "USD", "50.00"], ["m9@x.com", "DE", "12.35"]]);
  assert.deepEqual(skipped.map((s) => s.reason.replace(/\(.*\)/, "").trim()),
    ["ไม่มียอดคงเหลือ", "Status Complete", "มีปัญหา", "ไม่มีรหัสผ่าน", "สกุลเงินไม่ชัด", "เมลซ้ำในชีต"]);
});

check("fields the iTune page stores: purchase day as added, SMS link only when it is a link", () => {
  assert.deepEqual(mails[0], { email: "m2@x.com", password: "pw", currency: "USD", supplier: "Miles", amount: "50.00",
    linkSms: "https://sms.example/1", addedAt: "2026-03-18T00:00:00+07:00" });
  assert.equal(mails[1].linkSms, "");
});

check("a tab without the needed columns is refused", () => {
  assert.throws(() => parseItuneMailTab({ cells: cells([[1, { A: "x" }], [2, { A: "a@b.co" }]]) }), /PASS/);
});

console.log(`${passed} passed`);
