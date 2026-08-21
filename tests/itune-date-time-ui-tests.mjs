import { readFileSync } from "node:fs";

const table = readFileSync(new URL("../src/components/itune-admin-table.js", import.meta.url), "utf8");
const cell = readFileSync(new URL("../src/components/itune-countdown-cell.js", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/lib/itune-settings.js", import.meta.url), "utf8");

const checks = [
  ["table switches between remaining and date-time modes", table.includes('setSetting("dateTimeMode", mode)')],
  ["date-time mode reaches every admin row", table.includes("mode={dateTimeMode}")],
  ["remaining mode renders a readable badge", cell.includes("เหลือ ${formatHm(DAY_MS - elapsed)} ชม.")],
  ["named filters preserve search and selected columns", table.includes("excludedColumns: searchExcludedColumns")],
  ["display preferences persist locally", settings.includes('dateTimeMode: "remaining"') && settings.includes("savedFilters: []")],
];

const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(`\n${checks.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) {
  console.log(failed.join("\n"));
  process.exit(1);
}
