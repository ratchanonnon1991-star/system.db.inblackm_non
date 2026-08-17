import {
  buildGameinfoPackColumns,
  formatGameinfoPackColumnValue,
  normalizeGameinfoPackLayout,
  reorderGameinfoPackColumns,
} from "@/lib/gameinfo-pack-columns.js";
import { sanitizeComputedColumns } from "@/server/gamedb-layout-sanitizer.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

const columns = buildGameinfoPackColumns([
  { key: "profit", label: "กำไร", formula: "[ราคา] * 0.1", type: "number", symbol: "฿" },
]);

check(
  "base and computed columns use one collision-safe id namespace",
  columns.map((column) => column.id),
  [
    "image",
    "name",
    "price",
    "amountChargedFee",
    "channelsMain",
    "channelsSecondary",
    "country",
    "computed:profit",
  ]
);

const normalized = normalizeGameinfoPackLayout(
  { order: ["computed:profit", "price", "missing"], hidden: ["country", "missing", "country"] },
  columns
);
check("layout keeps known saved order then appends new columns", normalized.order, [
  "computed:profit",
  "price",
  "image",
  "name",
  "amountChargedFee",
  "channelsMain",
  "channelsSecondary",
  "country",
]);
check("layout drops unknown and duplicate hidden ids", normalized.hidden, ["country"]);

check(
  "column reorder moves one id without losing the others",
  reorderGameinfoPackColumns(normalized, "price", "channelsMain").order,
  [
    "computed:profit",
    "image",
    "name",
    "amountChargedFee",
    "channelsMain",
    "price",
    "channelsSecondary",
    "country",
  ]
);

check(
  "baht symbol is a prefix on a numeric computed result",
  formatGameinfoPackColumnValue(1234.5, { type: "number", symbol: "฿" }),
  "฿1,234.5"
);
check(
  "percent symbol is a suffix",
  formatGameinfoPackColumnValue(12.5, { type: "number", symbol: "%" }),
  "12.5%"
);
check(
  "symbols are not added to an empty result",
  formatGameinfoPackColumnValue(null, { type: "number", symbol: "$" }),
  "—"
);
check(
  "computed sanitizer keeps only supported display symbols",
  sanitizeComputedColumns([
    { key: "a", label: "บาท", formula: "1", type: "number", symbol: "฿" },
    { key: "b", label: "bad", formula: "2", type: "number", symbol: "<script>" },
  ]).map((column) => column.symbol),
  ["฿", ""]
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
