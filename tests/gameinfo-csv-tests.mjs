// The hand-rolled CSV parser/serializer: quoting, escaped quotes, embedded
// commas/newlines, BOM, CRLF, and a toCsv -> parseCsv round-trip.
import { parseCsv, toCsv } from "@/lib/gameinfo-csv.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

// --- parseCsv ------------------------------------------------------------
check(
  "simple rows keyed by header",
  parseCsv("a,b\n1,2\n3,4").rows,
  [
    { a: "1", b: "2" },
    { a: "3", b: "4" },
  ]
);

check(
  "a quoted field keeps its embedded comma",
  parseCsv('a,b\n"x, y",2').rows[0],
  { a: "x, y", b: "2" }
);

check(
  'a doubled "" inside quotes is one literal quote',
  parseCsv('a\n"he said ""hi"""').rows[0],
  { a: 'he said "hi"' }
);

check(
  "a quoted field keeps an embedded newline",
  parseCsv('a,b\n"line1\nline2",2').rows[0],
  { a: "line1\nline2", b: "2" }
);

check(
  "a leading UTF-8 BOM is stripped from the first header",
  parseCsv("﻿game_id,game_name\n1,ML").rows[0],
  { game_id: "1", game_name: "ML" }
);

check("CRLF line endings parse the same as LF", parseCsv("a,b\r\n1,2\r\n3,4").rows.length, 2);

check("a trailing newline does not add a blank row", parseCsv("a\n1\n").rows.length, 1);

check("headers are trimmed", parseCsv(" a , b \n1,2").headers, ["a", "b"]);

check("a short row fills missing cells with empty strings", parseCsv("a,b,c\n1,2").rows[0], {
  a: "1",
  b: "2",
  c: "",
});

check("empty text gives no headers and no rows", parseCsv(""), { headers: [], rows: [] });

// --- toCsv ---------------------------------------------------------------
check(
  "toCsv quotes only the fields that need it",
  toCsv(["a", "b"], [{ a: "x, y", b: "z" }]),
  'a,b\r\n"x, y",z'
);

check(
  "toCsv escapes an embedded quote by doubling it",
  toCsv(["a"], [{ a: 'say "hi"' }]),
  'a\r\n"say ""hi"""'
);

check("toCsv renders null/undefined cells as empty", toCsv(["a", "b"], [{ a: null }]), "a,b\r\n,");

// --- round-trip ----------------------------------------------------------
const rows = [
  { game_id: "1", pack_name: "Pack, A", note: 'has "quote"' },
  { game_id: "2", pack_name: "line\nbreak", note: "" },
];
const headers = ["game_id", "pack_name", "note"];
check("toCsv then parseCsv returns the original rows", parseCsv(toCsv(headers, rows)).rows, rows);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
