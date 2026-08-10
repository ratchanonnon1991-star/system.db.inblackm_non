// buildDisplayColumns + the sanitizer, for computed columns that are no longer
// all numbers.
import { buildDisplayColumns, normalizeLayout } from "@/lib/gamedb-layout.js";
import { sanitizeLayout } from "@/server/gamedb-layout-sanitizer.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

const resultColumns = [
  { key: "c0", name: "ราคาขาย", type: "number" },
  { key: "c1", name: "วันหมดอายุ", type: "text" },
];

const layout = normalizeLayout({
  computed: [
    { key: "a", label: "กำไร", formula: "[ราคาขาย] * 2" },
    { key: "b", label: "สถานะ", formula: 'IF(DAYSUNTIL([วันหมดอายุ]) < 3, "ใกล้", "ปกติ")', type: "text" },
    { key: "c", label: "ครบกำหนด", formula: "ADDDAYS([วันหมดอายุ], 7)", type: "date" },
    { key: "d", label: "พัง", formula: "[ราคาขาย] +", type: "number" },
  ],
});
const columns = buildDisplayColumns(resultColumns, layout);

check("a computed column with no saved type stays a number", columns[2].type, "number");
check("a text formula keeps its type", columns[3].type, "text");
check("a date formula keeps its type", columns[4].type, "date");
check("a broken formula reports why", Boolean(columns[5].formulaError), true);
check("a broken formula has no ast to run", columns[5].ast, null);
check("a working formula has an ast", Boolean(columns[2].ast), true);
check("computed ids are prefixed", columns.slice(2).map((c) => c.id), ["#a", "#b", "#c", "#d"]);

const layoutWithJunkType = normalizeLayout({
  computed: [{ key: "x", label: "x", formula: "1", type: "html" }],
});
check(
  "an unknown result type falls back to number",
  buildDisplayColumns([], layoutWithJunkType)[0].type,
  "number"
);

const gameinfoColumns = buildDisplayColumns([], normalizeLayout({
  computed: [
    { key: "tutorial", label: "Tutorial", formula: "1", type: "tutorial" },
    { key: "image", label: "วางรูป", formula: "1", type: "image" },
  ],
}));
check("a tutorial action keeps its type", gameinfoColumns[0].type, "tutorial");
check("an image action keeps its type", gameinfoColumns[1].type, "image");

const clean = sanitizeLayout({
  computed: [
    { key: "a", label: "ok", formula: "1 + 1", type: "date" },
    { key: "b", label: "bad", formula: "1", type: "html" },
    { key: "c", label: "missing" },
    { key: "d", label: "Tutorial", formula: "1", type: "tutorial" },
    { key: "e", label: "วางรูป", formula: "1", type: "image" },
  ],
});
check("the sanitizer keeps a valid result type", clean.computed[0].type, "date");
check("the sanitizer rejects an unknown result type", clean.computed[1].type, "number");
check("the sanitizer keeps a tutorial action", clean.computed[2].type, "tutorial");
check("the sanitizer keeps an image action", clean.computed[3].type, "image");
check("the sanitizer drops an entry with no formula", clean.computed.length, 4);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
