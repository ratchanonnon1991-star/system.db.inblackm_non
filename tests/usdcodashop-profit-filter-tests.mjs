import assert from "node:assert/strict";
import { codaProfitFilter, codaProfitLabel } from "../src/lib/usdcodashop-profit-filter.js";
assert.deepEqual(codaProfitFilter(), { profitStatus: "all", profitUnit: "thb", profitMin: "", profitMax: "" });
assert.deepEqual(codaProfitFilter({ profitStatus: null, profitUnit: null, profitMin: null }), codaProfitFilter());
assert.deepEqual(codaProfitFilter({ profitStatus: "loss", profitMin: "-10.5", profitMax: "-0" }), {
  profitStatus: "loss", profitUnit: "thb", profitMin: "-10.50", profitMax: "0.00",
});
assert.equal(codaProfitFilter({ profitMin: "0001.2" }).profitMin, "1.20");
assert.equal(codaProfitFilter({ profitMax: "999999999999.99" }).profitMax, "999999999999.99");
for (const profitMin of ["NaN", "Infinity", "1e2", "1,000", "1.001", "1; DROP TABLE x", "1000000000000", "+1"]) {
  assert.throws(() => codaProfitFilter({ profitMin }), { status: 400 });
}
for (const options of [{ profitStatus: "unknown" }, { profitUnit: "usd" },
  { profitMin: "2", profitMax: "1" }, { profitStatus: "missing", profitMin: "0" }]) {
  assert.throws(() => codaProfitFilter(options), { status: 400 });
}
assert.equal(codaProfitLabel({ profitStatus: "profit", profitUnit: "percent", profitMin: "5" }), "มีกำไร · 5.00 ถึง ไม่จำกัด %");
assert.equal(codaProfitLabel(), "กำไรทั้งหมด");
console.log("passed: profit filter enum, signed exact bounds, inclusivity inputs, labels, invalid/injection rejection");
