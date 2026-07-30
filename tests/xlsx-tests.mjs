// Builds a workbook through the real writer, checks the parts it produced, and
// leaves the file on disk for an independent reader to open.
import { writeFileSync } from "node:fs";
import { buildXlsxBlob } from "@/lib/gamedb-xlsx.js";
import { buildHeaderGroups, buildToneGrid, normalizeLayout } from "@/lib/gamedb-layout.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};
const ok = (name, value) => check(name, Boolean(value), true);

// --- the tone grid and header bands the panel hands over ------------------
const columns = [
  { id: "Mail", label: "Mail", type: "text" },
  { id: "ยอดเข้า", label: "ยอดเข้า", type: "number" },
  { id: "ยอดออก", label: "ยอดออก", type: "number" },
  { id: "คงเหลือ", label: "คงเหลือ", type: "number" },
  { id: "สถานะ", label: "สถานะ", type: "text" },
];
const layout = normalizeLayout({
  formats: {
    Mail: { headerBg: "greenSolid" },
    "ยอดเข้า": { bg: "pink", group: "ยอด", groupBg: "redSolid" },
    "ยอดออก": { bg: "pink", group: "ยอด", groupBg: "redSolid" },
    "คงเหลือ": { bg: "green", group: "ยอด", groupBg: "redSolid" },
    "สถานะ": { headerBg: "yellowSolid" },
  },
  rules: [
    { colId: "ยอดเข้า", op: "<", value: "[ยอดออก]", tone: "red", scope: "cell" },
    { colId: "สถานะ", op: "=", value: "เลยกำหนด", tone: "redSolid", scope: "row" },
  ],
});

const rows = [
  ["a@b.com", 300, 24, 276, "ปกติ"],
  ["c@d.com", 200, 250, -50, "ปกติ"],
  ["e@f.com", 100, 10, 90, "เลยกำหนด"],
].map((cells, sourceIndex) => ({
  sourceIndex,
  cells: cells.map((raw) => ({ raw, text: String(raw) })),
}));

const tones = buildToneGrid(columns, rows, layout);
check("a plain cell has no tone", tones[0][0], "");
check("a column tint applies to every row", tones[0][1], "pink");
check("a rule beats the column tint", tones[1][1], "red");
check("a column with its own tint keeps it", tones[0][3], "green");
check("a row rule reaches the cells with nothing of their own", tones[2][0], "redSolid");
check("a row rule does not overwrite a cell's own tint", tones[2][1], "pink");

const groups = buildHeaderGroups(columns, layout);
check(
  "neighbouring columns with the same label become one band",
  groups.map((group) => [group.label, group.span]),
  [["", 1], ["ยอด", 3], ["", 1]]
);
check("the bands cover every column", groups.reduce((sum, g) => sum + g.span, 0), columns.length);

const split = buildHeaderGroups(
  [columns[1], columns[4], columns[2]],
  layout
);
check(
  "a group broken apart by another column becomes two bands, not one wide lie",
  split.map((group) => [group.label, group.span]),
  [["ยอด", 1], ["", 1], ["ยอด", 1]]
);

// --- the workbook --------------------------------------------------------
const sheet = {
  name: "รายการเมล",
  headers: columns.map((col) => col.label),
  types: columns.map((col) => col.type),
  rows: rows.map((row) => row.cells.map((cell) => cell.raw)),
  headerTones: columns.map((col) => layout.formats[col.id]?.headerBg || ""),
  cellTones: tones,
  groups,
};

const blob = buildXlsxBlob([sheet, { name: "ไม่มีสี", headers: ["a"], rows: [[1]] }]);
const bytes = new Uint8Array(await blob.arrayBuffer());

// The parts are stored uncompressed, so they can be pulled straight out.
function readParts(data) {
  const text = new TextDecoder().decode(data);
  const parts = {};
  let offset = 0;
  while (offset < data.length - 4) {
    if (
      data[offset] === 0x50 &&
      data[offset + 1] === 0x4b &&
      data[offset + 2] === 0x03 &&
      data[offset + 3] === 0x04
    ) {
      const size = data[offset + 18] | (data[offset + 19] << 8) | (data[offset + 20] << 16) | (data[offset + 21] << 24);
      const nameLength = data[offset + 26] | (data[offset + 27] << 8);
      const name = new TextDecoder().decode(data.slice(offset + 30, offset + 30 + nameLength));
      const start = offset + 30 + nameLength;
      parts[name] = new TextDecoder().decode(data.slice(start, start + size));
      offset = start + size;
    } else {
      offset += 1;
    }
  }
  return { parts, text };
}

const { parts } = readParts(bytes);
ok("the workbook has a styles part", Boolean(parts["xl/styles.xml"]));
ok("the workbook has both sheets", Boolean(parts["xl/worksheets/sheet1.xml"] && parts["xl/worksheets/sheet2.xml"]));

const styles = parts["xl/styles.xml"];
ok("fill 1 is the reserved gray125", styles.includes('patternType="gray125"'));
ok("a pink fill was written", styles.includes("FFFCE7F3"));
ok("a solid red header fill was written", styles.includes("FFB91C1C"));
ok("white header text was written", styles.includes('rgb="FFFFFFFF"'));
const fillCount = Number(/<fills count="(\d+)"/.exec(styles)[1]);
const xfCount = Number(/<cellXfs count="(\d+)"/.exec(styles)[1]);
ok("more than the two reserved fills exist", fillCount > 2);
ok("more than the two default cell formats exist", xfCount > 2);
check(
  "the declared counts match what was written",
  [styles.split("<fill>").length - 1 + styles.split("<fill ").length - 1, styles.split("<xf ").length - 1 - 1],
  [fillCount, xfCount]
);

const sheet1 = parts["xl/worksheets/sheet1.xml"];
ok("the group band is merged across its three columns", sheet1.includes('<mergeCell ref="B1:D1"/>'));
check("only one band needed merging", (sheet1.match(/<mergeCell /g) || []).length, 1);
ok("the band carries its label", sheet1.includes("ยอด</t>"));
ok("headers moved down to row 2", sheet1.includes('<c r="A2"'));
ok("the first data row is row 3", sheet1.includes('<c r="A3"'));
ok("a styled cell references a format", /<c r="B3" s="\d+"/.test(sheet1));
ok("numbers are still stored as numbers", sheet1.includes('<v>300</v>'));

const sheet2 = parts["xl/worksheets/sheet2.xml"];
ok("a sheet with no groups keeps its header on row 1", sheet2.includes('<c r="A1"'));
ok("a sheet with no groups has no merges", !sheet2.includes("mergeCell"));

// every part must be well-formed enough to have balanced angle brackets
for (const [name, xml] of Object.entries(parts)) {
  const opens = (xml.match(/</g) || []).length;
  const closes = (xml.match(/>/g) || []).length;
  if (opens !== closes) failures.push(`${name} has unbalanced angle brackets`);
  else pass += 1;
}

// Only written when a path is asked for, so a plain run leaves nothing behind.
if (process.argv[2]) writeFileSync(process.argv[2], Buffer.from(bytes));

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
