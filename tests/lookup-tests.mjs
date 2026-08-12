// Per-column input widgets, dropdowns whose options come from another table,
// and the label/value split a CASE column needs.
import { fetchLookupOptions } from "@/server/gamedb-lookup.js";
import { log, reset } from "@/lib/db.js";
import {
  INPUT_WIDGETS,
  matchChoice,
  matchOption,
  normalizeInputs,
  normalizeLookup,
  parseOption,
  widgetForPgType,
} from "@/lib/gamedb-layout.js";
import { sanitizeLayout } from "@/server/gamedb-layout-sanitizer.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};
const ok = (name, value) => check(name, Boolean(value), true);
async function rejects(name, promise, fragment) {
  try {
    await promise;
    failures.push(`${name}\n    expected a rejection, got none`);
  } catch (err) {
    if (fragment && !err.message.includes(fragment)) {
      failures.push(`${name}\n    message "${err.message}"`);
    } else pass += 1;
  }
}
const statements = () => log.filter((e) => e.text !== "RELEASE").map((e) => e.text.trim());

// --- label = stored value ------------------------------------------------
check("a plain option is its own value", parseOption("YAYA"), { label: "YAYA", value: "YAYA" });
check("an option can store something else", parseOption("Bot Auto = BOT_AUTO"), {
  label: "Bot Auto",
  value: "BOT_AUTO",
});
check("spaces around the = are trimmed", parseOption("  a  =  b  "), { label: "a", value: "b" });
check("only the first = splits", parseOption("a=b=c"), { label: "a", value: "b=c" });
check("an empty option is empty", parseOption(""), { label: "", value: "" });

const OPTIONS = ["Bot Auto = BOT_AUTO", "Manual = MANUAL"];
check(
  "a cell holding the label finds its option",
  matchOption(OPTIONS, "Bot Auto"),
  { label: "Bot Auto", value: "BOT_AUTO" }
);
check(
  "a cell holding the stored value finds it too",
  matchOption(OPTIONS, "BOT_AUTO"),
  { label: "Bot Auto", value: "BOT_AUTO" }
);
check("something else matches nothing", matchOption(OPTIONS, "อื่น ๆ"), null);
check("a blank cell matches nothing", matchOption(OPTIONS, ""), null);
check(
  "a lookup row matches on its id even when the id is a number",
  matchChoice([{ value: 3, label: "Ooredoo" }], "3"),
  { value: 3, label: "Ooredoo" }
);
check(
  "and on its label, which is what a joined column actually shows",
  matchChoice([{ value: 3, label: "Ooredoo" }], "Ooredoo"),
  { value: 3, label: "Ooredoo" }
);

// --- the lookup config ---------------------------------------------------
check("a lookup needs all three parts", normalizeLookup({ table: "t", valueColumn: "id" }), null);
check("a non-object lookup is nothing", normalizeLookup("t"), null);
check(
  "a complete lookup survives",
  normalizeLookup({ table: " topup.game ", valueColumn: " id ", labelColumn: " name " }),
  { table: "topup.game", valueColumn: "id", labelColumn: "name" }
);
check(
  "an input keeps its lookup",
  normalizeInputs([
    { column: "Game", widget: "lookup", lookup: { table: "topup.game", valueColumn: "id", labelColumn: "name" } },
  ])[0].lookup.table,
  "topup.game"
);
check("an input with no lookup has none", normalizeInputs([{ column: "a" }])[0].lookup, null);
check(
  "boolean is a real, savable widget -- not silently downgraded to text",
  normalizeInputs([{ column: "a", widget: "boolean" }])[0].widget,
  "boolean"
);
check("boolean is in the widget allowlist", INPUT_WIDGETS.includes("boolean"), true);

// --- widgetForPgType: guessing an "add row" widget from the real DB type ---
check("boolean type", widgetForPgType("boolean"), "boolean");
check("integer type", widgetForPgType("integer"), "number");
check("bigint type", widgetForPgType("bigint"), "number");
check("numeric(12,2) type keeps its precision suffix but still matches", widgetForPgType("numeric(12,2)"), "number");
check("date type", widgetForPgType("date"), "date");
check("timestamp without time zone", widgetForPgType("timestamp without time zone"), "datetime");
check("timestamp with time zone", widgetForPgType("timestamp with time zone"), "datetime");
check(
  "time without time zone is its own widget, not folded into datetime",
  widgetForPgType("time without time zone"),
  "time"
);
check("character varying(255) falls back to text", widgetForPgType("character varying(255)"), "text");
check("uuid falls back to text (still editable, just no special widget)", widgetForPgType("uuid"), "text");
check("jsonb falls back to text", widgetForPgType("jsonb"), "text");
check("an empty/unknown type falls back to text", widgetForPgType(""), "text");

// --- what the sanitizer lets through -------------------------------------
const base = {
  table: "topup.topup_entry",
  pk: "ID",
  pkColumn: "id",
  columns: ["Game", "ช่องทางการเติม"],
  columnMap: { Game: "game_id", "ช่องทางการเติม": "channel_id" },
};
const clean = sanitizeLayout({
  editable: {
    ...base,
    inputs: [
      {
        column: "Game",
        widget: "lookup",
        lookup: { table: "topup.game", valueColumn: "id", labelColumn: "name" },
      },
      {
        column: "ช่องทางการเติม",
        widget: "lookup",
        lookup: { table: 'x"; DROP TABLE gamedb_users; --', valueColumn: "id", labelColumn: "name" },
      },
    ],
  },
});
check("a valid lookup is kept", clean.editable.inputs[0].lookup.table, "topup.game");
check("a hostile lookup table is dropped", clean.editable.inputs[1].lookup, null);
check(
  "and the field falls back to a plain box rather than a broken dropdown",
  clean.editable.inputs[1].widget,
  "text"
);

const badColumn = sanitizeLayout({
  editable: {
    ...base,
    inputs: [
      {
        column: "Game",
        widget: "lookup",
        lookup: { table: "topup.game", valueColumn: 'id" , (SELECT 1)) --', labelColumn: "name" },
      },
    ],
  },
});
check("a hostile lookup column is dropped too", badColumn.editable.inputs[0].lookup, null);

const keptWidget = sanitizeLayout({
  editable: {
    ...base,
    inputs: [{ column: "Game", widget: "select", options: ["a"], lookup: { table: "!!" } }],
  },
});
check(
  "a bad lookup on a non-lookup field leaves the widget alone",
  keptWidget.editable.inputs[0].widget,
  "select"
);

// --- reading the options -------------------------------------------------
reset({ rows: [{ value: 1, label: "Ooredoo" }, { value: 2, label: "Wavepay" }] });
const options = await fetchLookupOptions({
  lookup: { table: "topup.payment_channel", valueColumn: "id", labelColumn: "name" },
  connection: null,
});
check("the rows come back as choices", options, [
  { value: 1, label: "Ooredoo" },
  { value: 2, label: "Wavepay" },
]);
const select = statements().find((s) => s.startsWith("SELECT"));
ok("identifiers are quoted", select.includes('SELECT "id" AS value, "name" AS label'));
ok("it reads the named table", select.includes('FROM "topup"."payment_channel"'));
ok("it orders by what is shown", select.includes('ORDER BY "name"'));
ok("it is capped", /LIMIT 500/.test(select));
ok("rows with no key are skipped", select.includes('WHERE "id" IS NOT NULL'));
ok("a statement timeout is set", statements().some((s) => s.includes("statement_timeout")));
ok("it takes no parameters at all", log.every((entry) => !entry.params || entry.params === null));

reset({ rows: [{ value: 7, label: null }] });
const nullLabel = await fetchLookupOptions({
  lookup: { table: "t", valueColumn: "id", labelColumn: "name" },
  connection: null,
});
check("a row with no label falls back to its key", nullLabel, [{ value: 7, label: "7" }]);

reset();
await rejects(
  "a hostile table cannot reach the database",
  fetchLookupOptions({
    lookup: { table: 'x"; DROP TABLE gamedb_users; --', valueColumn: "id", labelColumn: "n" },
    connection: null,
  }),
  "ไม่ถูกต้อง"
);
check("nothing was run", statements(), []);

reset({ fail: "relation does not exist" });
await rejects(
  "a missing table is reported",
  fetchLookupOptions({
    lookup: { table: "nope", valueColumn: "id", labelColumn: "n" },
    connection: null,
  }),
  "relation does not exist"
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
