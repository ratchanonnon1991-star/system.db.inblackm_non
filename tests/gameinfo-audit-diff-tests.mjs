import { formatAuditValue, summarizeGameinfoAudit } from "@/lib/gameinfo-audit-diff.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

check("rename is shown first", summarizeGameinfoAudit({ before: { price: "10", name: "Old" }, after: { price: "12", name: "New" } }).map((item) => item.label), ["ชื่อ", "ราคาขาย"]);
check("identical data has no diff", summarizeGameinfoAudit({ before: { name: "A" }, after: { name: "A" } }), []);
check("internal ordering fields stay hidden", summarizeGameinfoAudit({ before: { packOrder: 1 }, after: { packOrder: 2 } }), []);
check("values stay compact", [formatAuditValue(true), formatAuditValue(["A", "B"]), formatAuditValue([{ id: 1 }])], ["ใช่", "A, B", "1 รายการ"]);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
