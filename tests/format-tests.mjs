// Exercises the new layout.formats / layout.freeze / rule ops against the real
// modules (aliases rewritten), plus the server sanitizer they have to survive.
import {
  buildHeaderGroups,
  daysUntil,
  hasHeaderGroups,
  isEmptyFormat,
  normalizeFormat,
  normalizeFormats,
  normalizeFreeze,
  normalizeLayout,
  ruleMatches,
  toDate,
  toneStyle,
  CELL_TONES,
  RULE_TONES,
} from "@/lib/gamedb-layout.js";
import { sanitizeLayout } from "@/server/gamedb-layout-sanitizer.js";

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

const iso = (offsetDays) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
};

// --- dates ---------------------------------------------------------------
check("dd/mm/yyyy is day-first", toDate("28/06/2026").getMonth(), 5);
check("dd/mm/yyyy keeps the day", toDate("28/06/2026").getDate(), 28);
check("buddhist year converts", toDate("28/06/2569").getFullYear(), 2026);
check("iso still parses", toDate("2026-06-28").getFullYear(), 2026);
check("junk is not a date", toDate("ปกติ"), null);
check("dash is not a date", toDate("-"), null);
check("empty is not a date", toDate(""), null);
check("today is zero days away", daysUntil(iso(0)), 0);
check("tomorrow is one day away", daysUntil(iso(1)), 1);
check("yesterday is negative", daysUntil(iso(-1)), -1);
check("non-date has no distance", daysUntil("ปกติ"), null);

// --- rule ops ------------------------------------------------------------
const rule = (op, value, extra = {}) => ({ colId: "c", op, value, tone: "red", scope: "cell", ...extra });

ok("overdue fires on a past date", ruleMatches(rule("overdue", ""), iso(-3), iso(-3)));
ok("overdue ignores a future date", !ruleMatches(rule("overdue", ""), iso(3), iso(3)));
ok("overdue ignores today", !ruleMatches(rule("overdue", ""), iso(0), iso(0)));
ok("overdue ignores a non-date", !ruleMatches(rule("overdue", ""), "ปกติ", "ปกติ"));
ok("dueIn 7 catches day 3", ruleMatches(rule("dueIn", "7"), iso(3), iso(3)));
ok("dueIn 7 catches day 0", ruleMatches(rule("dueIn", "7"), iso(0), iso(0)));
ok("dueIn 7 skips day 10", !ruleMatches(rule("dueIn", "7"), iso(10), iso(10)));
ok("dueIn 7 skips the past", !ruleMatches(rule("dueIn", "7"), iso(-1), iso(-1)));
ok("isToday", ruleMatches(rule("isToday", ""), iso(0), iso(0)));

ok("empty matches blank", ruleMatches(rule("empty", ""), null, ""));
ok("empty matches the em dash placeholder", ruleMatches(rule("empty", ""), null, "—"));
ok("empty matches whitespace", ruleMatches(rule("empty", ""), "  ", "  "));
ok("empty rejects a value", !ruleMatches(rule("empty", ""), "x", "x"));
ok("notEmpty", ruleMatches(rule("notEmpty", ""), "x", "x"));

ok("startsWith", ruleMatches(rule("startsWith", "US9"), "US9+---450", "US9+---450"));
ok("startsWith is case-insensitive", ruleMatches(rule("startsWith", "us9"), "US9+", "US9+"));
ok("endsWith", ruleMatches(rule("endsWith", ".com"), "a@icloud.com", "a@icloud.com"));
ok("notContains", ruleMatches(rule("notContains", "OTP"), "ปกติ", "ปกติ"));
ok("notContains is false when present", !ruleMatches(rule("notContains", "OTP"), "OTP ใกล้หมดอายุ", "OTP ใกล้หมดอายุ"));
ok("in list", ruleMatches(rule("in", "YAYA, Panghou, T002"), "Panghou", "Panghou"));
ok("in list rejects an outsider", !ruleMatches(rule("in", "YAYA, Panghou"), "T002", "T002"));

// --- column references ---------------------------------------------------
const row = { "ยอดออก": "500", Supplier: "YAYA" };
const resolve = (name) => row[name];
ok(
  "less-than another column",
  ruleMatches(rule("<", "[ยอดออก]"), "300", "300", resolve)
);
ok(
  "not less-than another column",
  !ruleMatches(rule("<", "[ยอดออก]"), "900", "900", resolve)
);
ok(
  "equals another column",
  ruleMatches(rule("=", "[Supplier]"), "YAYA", "YAYA", resolve)
);
ok(
  "unknown column never matches",
  !ruleMatches(rule("=", "[ไม่มีคอลัมน์นี้]"), "YAYA", "YAYA", resolve)
);
ok(
  "a column reference without a resolver never matches",
  !ruleMatches(rule("<", "[ยอดออก]"), "300", "300")
);

// dates compare in order even though neither side is a number
ok(
  "date < date",
  ruleMatches(rule("<", "01/07/2026"), "28/06/2026", "28/06/2026")
);
ok(
  "date > date is false the other way",
  !ruleMatches(rule(">", "01/07/2026"), "28/06/2026", "28/06/2026")
);

// old rules keep behaving
ok("numeric less-than", ruleMatches(rule("<", "10"), 4, "4"));
ok("contains", ruleMatches(rule("contains", "apple"), "US9-APPLE", "US9-APPLE"));
ok("text equality", ruleMatches(rule("=", "ปกติ"), "ปกติ", "ปกติ"));

// --- formats -------------------------------------------------------------
check("unknown tone is dropped", normalizeFormat({ bg: "neon" }).bg, "");
check("known tone survives", normalizeFormat({ bg: "pink" }).bg, "pink");
check("unknown render falls back to text", normalizeFormat({ render: "iframe" }).render, "text");
check("wrap must be true, not truthy", normalizeFormat({ wrap: "yes" }).wrap, false);
check("align is limited", normalizeFormat({ align: "justify" }).align, "");
ok("a blank format is recognised as empty", isEmptyFormat(normalizeFormat({})));
ok("a format with a colour is not empty", !isEmptyFormat(normalizeFormat({ bg: "red" })));
check(
  "empty formats are not stored",
  normalizeFormats({ a: {}, b: { bg: "red" } }),
  { b: { bg: "red", fg: "", headerBg: "", render: "text", wrap: false, align: "", group: "", groupBg: "" } }
);
check("formats reject a non-object", normalizeFormats("nope"), {});

check("freeze clamps high", normalizeFreeze(99), 5);
check("freeze clamps low", normalizeFreeze(-3), 0);
check("freeze truncates", normalizeFreeze(2.7), 2);
check("freeze rejects junk", normalizeFreeze("many"), 0);

// every tone the rule UI offers must actually resolve to a style
for (const tone of RULE_TONES) {
  if (tone === "bar") continue;
  ok(`tone ${tone} has a style`, toneStyle(tone) !== null);
  ok(`tone ${tone} has a header style`, toneStyle(tone, "head") !== null);
}
check("bar has no colour", toneStyle("bar"), null);
check("no tone, no style", toneStyle(""), null);
check("every tone has a hex bg", Object.values(CELL_TONES).every((t) => /^#[0-9a-f]{6}$/i.test(t.bg)), true);

// --- layout round trip ---------------------------------------------------
const layout = normalizeLayout({
  formats: { a: { bg: "pink", render: "link" }, b: {} },
  freeze: 3,
  rules: [
    { colId: "a", op: "overdue", value: "", tone: "redSolid", scope: "row" },
    { colId: "b", op: "bogus", value: "1", tone: "red" },
    { colId: "c", op: "<", value: "1", tone: "bar", scope: "row" },
  ],
});
check("formats normalise into the layout", Object.keys(layout.formats), ["a"]);
check("freeze normalises into the layout", layout.freeze, 3);
check("an unknown op is dropped", layout.rules.length, 2);
check("row scope survives", layout.rules[0].scope, "row");
check("a bar rule is forced back to cell scope", layout.rules[1].scope, "cell");

const legacy = normalizeLayout({ rules: [{ colId: "a", op: "<", value: "1", tone: "amber" }] });
check("a rule saved before scope existed stays a cell rule", legacy.rules[0].scope, "cell");

const empty = normalizeLayout({});
check("an empty layout has no formats", empty.formats, {});
check("an empty layout is not frozen", empty.freeze, 0);

// --- sanitizer -----------------------------------------------------------
const clean = sanitizeLayout({
  formats: {
    good: { bg: "violet", headerBg: "darkSolid", render: "copy", wrap: true, align: "center" },
    bad: { bg: "url(javascript:alert(1))", render: "<script>" },
  },
  freeze: "4",
  rules: [{ colId: "x", op: "dueIn", value: "7", tone: "yellowSolid", scope: "row" }],
});
check("the sanitizer keeps a valid format", clean.formats.good.bg, "violet");
check("the sanitizer keeps the render mode", clean.formats.good.render, "copy");
check("the sanitizer drops an injected colour", clean.formats.bad, undefined);
check("the sanitizer parses a numeric string freeze", clean.freeze, 4);
check("the sanitizer keeps row scope", clean.rules[0].scope, "row");
check("the sanitizer keeps the new op", clean.rules[0].op, "dueIn");

// JSON only ever produces plain objects, so this is what a hostile body looks
// like: the wrong type in every slot.
const hostile = sanitizeLayout({ formats: "not-an-object", freeze: {}, rules: "all of them" });
check("a non-object formats becomes {}", hostile.formats, {});
check("an object freeze becomes 0", hostile.freeze, 0);
check("a string rules list becomes []", hostile.rules, []);
check("an array freeze becomes 0", sanitizeLayout({ freeze: [4] }).freeze, 0);

const many = {};
for (let i = 0; i < 300; i += 1) many[`col${i}`] = { bg: "red" };
check("formats are capped at 200 columns", Object.keys(sanitizeLayout({ formats: many }).formats).length, 200);

// --- header groups -------------------------------------------------------
check("a group label is trimmed", normalizeFormat({ group: "  ยอด  " }).group, "ยอด");
check("a group tone must be a known tone", normalizeFormat({ groupBg: "neon" }).groupBg, "");
check("a long group label is cut", normalizeFormat({ group: "x".repeat(200) }).group.length, 60);
check("a non-string group is dropped", normalizeFormat({ group: { toString: () => "x" } }).group, "");
ok("a format with only a group is not empty", !isEmptyFormat(normalizeFormat({ group: "a" })));
ok("a format with only a group tone is not empty", !isEmptyFormat(normalizeFormat({ groupBg: "red" })));
check(
  "the sanitizer keeps a group",
  sanitizeLayout({ formats: { a: { group: "ยอด", groupBg: "darkSolid" } } }).formats.a.group,
  "ยอด"
);
check(
  "the sanitizer drops an injected group tone",
  sanitizeLayout({ formats: { a: { group: "ยอด", groupBg: "</style><script>" } } }).formats.a.groupBg,
  ""
);

const cols = ["a", "b", "c", "d"].map((id) => ({ id, label: id }));
const groupLayout = normalizeLayout({
  formats: {
    b: { group: "ยอด", groupBg: "red" },
    c: { group: "ยอด", groupBg: "red" },
  },
});
ok("a layout with a group is detected", hasHeaderGroups(cols, groupLayout));
ok("a layout without one is not", !hasHeaderGroups(cols, normalizeLayout({})));
check(
  "neighbours with the same label and tone merge",
  buildHeaderGroups(cols, groupLayout).map((group) => [group.label, group.span]),
  [["", 1], ["ยอด", 2], ["", 1]]
);
check(
  "the same label in two tones does not merge",
  buildHeaderGroups(
    cols,
    normalizeLayout({
      formats: { b: { group: "ยอด", groupBg: "red" }, c: { group: "ยอด", groupBg: "blue" } },
    })
  ).map((group) => [group.label, group.tone, group.span]),
  [["", "", 1], ["ยอด", "red", 1], ["ยอด", "blue", 1], ["", "", 1]]
);
check(
  "the bands always cover every column",
  buildHeaderGroups(cols, groupLayout).reduce((sum, group) => sum + group.span, 0),
  cols.length
);
check("no columns, no bands", buildHeaderGroups([], groupLayout), []);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
