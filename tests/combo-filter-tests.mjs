import assert from "node:assert/strict";
import { filterComboGroups } from "../src/lib/combo-filter.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

const groups = [{ label: "ใช้บ่อย", options: ["THB", "USDT", "USD"] }, { label: "เคยใช้", options: ["CNY", "USDC"] }];
check(filterComboGroups(groups, null).flatMap((group) => group.options).length === 5 && filterComboGroups(groups, "").length === 2, "an empty box lists every choice");
check(filterComboGroups(groups, "us").flatMap((group) => group.options).join() === "USDT,USD,USDC" && filterComboGroups(groups, "usdc").flatMap((group) => group.options).join() === "USDC", "each letter typed narrows the list");
check(filterComboGroups([{ label: "", options: ["Twocard Shop", "Panghou"] }], "two sh").length === 1 && filterComboGroups(groups, "zzz").length === 0, "every typed word must match; nothing matching leaves the typed text as is");
console.log(`combo-filter: ${passed} passed`);
