// The formula engine: parsing, arity, the function library, type inference and
// what happens when the data is missing or the wrong shape.
import {
  evaluateFormula,
  extractFormulaRefs,
  inferFormulaType,
  parseFormula,
  FUNCTION_NAMES,
  FUNCTIONS,
} from "@/lib/gamedb-formula.js";
import { formatCell } from "@/lib/gamedb-layout.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}
function ok(name, value) {
  check(name, Boolean(value), true);
}
function throws(name, formula, fragment) {
  try {
    parseFormula(formula);
    failures.push(`${name}\n    expected a parse error, got none`);
  } catch (err) {
    if (fragment && !err.message.includes(fragment)) {
      failures.push(`${name}\n    expected the message to mention "${fragment}"\n    actual   ${err.message}`);
    } else pass += 1;
  }
}

const thai = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const ROW = {
  "ราคาขาย": 150,
  "ต้นทุน": 100,
  "ยอดเข้า": "300",
  "ยอดออก": "24",
  Mail: "yfcgb45@icloud.com",
  PASS: "Cz367599",
  "สถานะ": "ปกติ",
  "วันหมดอายุ": thai(2),
  "วันที่สั่งซื้อ": "28/06/2026",
  "ว่าง": null,
  "ช่องว่าง": "   ",
};
const run = (formula) => evaluateFormula(parseFormula(formula), (name) => ROW[name]);

// --- what already worked keeps working -----------------------------------
check("arithmetic", run("([ราคาขาย] - [ต้นทุน]) / [ต้นทุน] * 100"), 50);
check("numeric text coerces", run("[ยอดเข้า] - [ยอดออก]"), 276);
check("precedence", run("2 + 3 * 4"), 14);
check("parentheses", run("(2 + 3) * 4"), 20);
check("unary minus", run("-[ต้นทุน]"), -100);
check("divide by zero is blank, not Infinity", run("[ต้นทุน] / 0"), null);
check("a missing column makes it blank", run("[ไม่มี] + 1"), null);
check("a blank column makes it blank", run("[ว่าง] * 2"), null);

// --- text ----------------------------------------------------------------
check("string literal", run('"ปกติ"'), "ปกติ");
check("doubled quote is one quote", run('"เขาว่า ""ok"""'), 'เขาว่า "ok"');
check("single quotes work too", run("'ok'"), "ok");
check("concat operator", run('[PASS] & " · " & [สถานะ]'), "Cz367599 · ปกติ");
check("CONCAT", run('CONCAT([PASS], "-", [สถานะ])'), "Cz367599-ปกติ");
check("concat treats blank as empty", run('[ว่าง] & "x"'), "x");
check("LEFT", run("LEFT([Mail], 7)"), "yfcgb45");
check("RIGHT", run("RIGHT([Mail], 10)"), "icloud.com");
check("RIGHT of zero is empty, not the whole string", run("RIGHT([Mail], 0)"), "");
check("MID is 1-based", run("MID([PASS], 1, 2)"), "Cz");
check("MID past the end", run("MID([PASS], 99, 3)"), "");
check("LEN", run("LEN([PASS])"), 8);
check("UPPER", run("UPPER([PASS])"), "CZ367599");
check("LOWER", run("LOWER([PASS])"), "cz367599");
check("TRIM", run("TRIM([ช่องว่าง])"), "");
check("TEXT of a number", run("TEXT([ราคาขาย])"), "150");
check("CONTAINS ignores case", run('CONTAINS([Mail], "ICLOUD")'), true);
check("CONTAINS false", run('CONTAINS([Mail], "gmail")'), false);

// --- conditions ----------------------------------------------------------
check("IF true branch", run('IF([ราคาขาย] > [ต้นทุน], "กำไร", "ขาดทุน")'), "กำไร");
check("IF false branch", run('IF([ราคาขาย] < [ต้นทุน], "กำไร", "ขาดทุน")'), "ขาดทุน");
check("IF on text equality", run('IF([สถานะ] = "ปกติ", 1, 0)'), 1);
check("<> is not-equal", run('[สถานะ] <> "ปกติ"'), false);
check("!= is accepted as <>", run('[สถานะ] != "ปกติ"'), false);
check("AND", run("AND([ราคาขาย] > 100, [ต้นทุน] > 100)"), false);
check("OR", run("OR([ราคาขาย] > 100, [ต้นทุน] > 100)"), true);
check("NOT", run('NOT([สถานะ] = "ปกติ")'), false);
check("ISBLANK on null", run("ISBLANK([ว่าง])"), true);
check("ISBLANK on whitespace", run("ISBLANK([ช่องว่าง])"), true);
check("ISBLANK on a value", run("ISBLANK([PASS])"), false);
check("COALESCE skips blanks", run('COALESCE([ว่าง], [ช่องว่าง], [PASS])'), "Cz367599");
check("COALESCE with nothing left is blank", run("COALESCE([ว่าง], [ช่องว่าง])"), null);
check("IFERROR falls back", run('IFERROR([ว่าง], "ไม่มีข้อมูล")'), "ไม่มีข้อมูล");
check("IFERROR keeps a good value", run('IFERROR([PASS], "ไม่มีข้อมูล")'), "Cz367599");
// short-circuit: the untaken branch must not be evaluated into an error
check("IF does not evaluate the untaken branch", run('IF(1 = 1, "ok", [ต้นทุน] / 0)'), "ok");
check("blank = blank", run("[ว่าง] = [ว่าง]"), true);
check("blank compared with a value has no answer", run("[ว่าง] < 5"), null);

// --- dates ---------------------------------------------------------------
check("DAYSUNTIL counts forward", run("DAYSUNTIL([วันหมดอายุ])"), 2);
check("DAYSUNTIL of a non-date is blank", run("DAYSUNTIL([สถานะ])"), null);
check("DAYS between two dates", run('DAYS("01/07/2026", "28/06/2026")'), 3);
check("DAYS is signed", run('DAYS("28/06/2026", "01/07/2026")'), -3);
check("YEAR", run("YEAR([วันที่สั่งซื้อ])"), 2026);
check("MONTH is 1-based", run("MONTH([วันที่สั่งซื้อ])"), 6);
check("DAY", run("DAY([วันที่สั่งซื้อ])"), 28);
check("buddhist year", run('YEAR("28/06/2569")'), 2026);
check("ADDDAYS moves the day", run('DAY(ADDDAYS("28/06/2026", 5))'), 3);
check("ADDDAYS rolls the month", run('MONTH(ADDDAYS("28/06/2026", 5))'), 7);
check("TODAY has no time of day", run("DAYS(TODAY(), TODAY())"), 0);
check("dates compare in order", run('"28/06/2026" < "01/07/2026"'), true);
check(
  "the near-expiry rule the sheet actually wants",
  run('IF(DAYSUNTIL([วันหมดอายุ]) < 3, "OTP ใกล้หมดอายุ", "ปกติ")'),
  "OTP ใกล้หมดอายุ"
);

// --- numbers -------------------------------------------------------------
check("ROUND to whole", run("ROUND(3.7)"), 4);
check("ROUND to digits", run("ROUND(3.14159, 2)"), 3.14);
check("ROUND avoids binary floating-point drift", run("ROUND(1.005, 2)"), 1.01);
check("ROUND handles a repeating product", run("ROUND(1.0049999, 2)"), 1);
check("ROUNDDOWN cuts the remainder", run("ROUNDDOWN(10.567, 2)"), 10.56);
check("ROUNDDOWN keeps whole numbers", run("ROUNDDOWN(10.9)"), 10);
check("ROUNDUP lifts any remainder", run("ROUNDUP(10.561, 2)"), 10.57);
check("ROUNDUP leaves exact values alone", run("ROUNDUP(10.56, 2)"), 10.56);
check("ROUNDDOWN goes toward zero", run("ROUNDDOWN(-10.5)"), -10);
check("INT rounds negative values down", run("INT(-10.5)"), -11);
check("ROUNDUP goes away from zero", run("ROUNDUP(-10.1)"), -11);
check("FLOOR snaps down to a step", run("FLOOR(127, 10)"), 120);
check("CEILING snaps up to a step", run("CEILING(121, 10)"), 130);
check("MROUND picks the nearer step", run("MROUND(127, 10)"), 130);
check("MROUND rounds down when nearer", run("MROUND(122, 10)"), 120);
check("step defaults to 1", run("CEILING(10.2)"), 11);
check("fractional steps survive float division", run("FLOOR(1.2, 0.1)"), 1.2);
check("half steps work", run("MROUND(2.3, 0.5)"), 2.5);
check("a zero step has no answer", run("FLOOR(10, 0)"), null);
check("rounding a blank stays blank", run("ROUNDDOWN([Missing], 2)"), null);
check("ABS", run("ABS(0 - 5)"), 5);
check("MIN", run("MIN([ราคาขาย], [ต้นทุน], 120)"), 100);
check("MAX", run("MAX([ราคาขาย], [ต้นทุน], 120)"), 150);
check("SUM", run("SUM(1, 2, 3)"), 6);
check("SUM with a blank is blank", run("SUM([ว่าง], 2)"), null);

// --- parse errors --------------------------------------------------------
throws("unclosed bracket", "[ราคาขาย", "]");
throws("empty column name", "[]", "ว่างเปล่า");
throws("unclosed paren", "(1 + 2", ")");
throws("unclosed string", '"abc', "คำพูด");
throws("unknown function", "FOO(1)", "FOO");
throws("IF with two arguments", 'IF(1, "a")', "3");
throws("NOT with two arguments", "NOT(1, 2)", "1");
throws("a bare word is not a value", "abc", "(");
throws("trailing junk", "1 + 2 )", "เกิน");
throws("missing comma", "MIN(1 2)", ",");

// Arity is enforced for every function in the table: exactly `min` arguments
// parses, one fewer does not.
check("MIN accepts many arguments", run("MIN(9, 8, 7, 6, 5, 4, 3, 2, 1)"), 1);
const arityProblems = [];
for (const name of FUNCTION_NAMES) {
  const [min] = FUNCTIONS[name];
  const args = (count) => Array.from({ length: count }, () => "1").join(", ");
  try {
    parseFormula(`${name}(${args(min)})`);
  } catch (err) {
    arityProblems.push(`${name} rejected its own minimum: ${err.message}`);
  }
  if (min > 0) {
    try {
      parseFormula(`${name}(${args(min - 1)})`);
      arityProblems.push(`${name} accepted ${min - 1} arguments`);
    } catch {
      // expected
    }
  }
}
check("every function enforces its own arity", arityProblems, []);

// --- refs ----------------------------------------------------------------
check(
  "refs are collected from every branch",
  [...extractFormulaRefs(parseFormula('IF([a] > 1, CONCAT([b], [c]), [d] & [e])'))],
  ["a", "b", "c", "d", "e"]
);
check("no refs in a constant", [...extractFormulaRefs(parseFormula("1 + 2"))], []);

// --- inferred type -------------------------------------------------------
const typeOf = (formula) => inferFormulaType(parseFormula(formula));
check("arithmetic is a number", typeOf("[a] + 1"), "number");
check("a literal string is text", typeOf('"x"'), "text");
check("concat is text", typeOf('[a] & "x"'), "text");
check("a comparison is a yes/no", typeOf("[a] > 1"), "boolean");
check("TODAY is a date", typeOf("TODAY()"), "date");
check("ADDDAYS is a date", typeOf("ADDDAYS([a], 1)"), "date");
check("DAYSUNTIL is a number", typeOf("DAYSUNTIL([a])"), "number");
check("LEN is a number", typeOf("LEN([a])"), "number");
check("CONTAINS is a yes/no", typeOf('CONTAINS([a], "x")'), "boolean");
check("IF of two texts is text", typeOf('IF([a] > 1, "x", "y")'), "text");
check("IF of two numbers is a number", typeOf("IF([a] > 1, 1, 2)"), "number");
check("IF of mixed branches is text", typeOf('IF([a] > 1, 1, "y")'), "text");
check("COALESCE follows its arguments", typeOf('COALESCE("a", "b")'), "text");

// --- how the panel renders each type -------------------------------------
check("a blank formula result shows as a dash", formatCell(null, "number"), "—");
check("a true shows as Yes", formatCell(true, "boolean"), "Yes");
check("a false shows as No", formatCell(false, "boolean"), "No");
check("text passes through", formatCell("ปกติ", "text"), "ปกติ");
ok("a date result formats as a date", /\d/.test(formatCell(run('ADDDAYS("28/06/2026", 1)'), "date")));

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
