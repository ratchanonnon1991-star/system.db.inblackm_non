// What a cell ends up looking like for every combination of the three colour
// settings, the chip render and a conditional rule.
//
// This is the module the table renders from, not a copy of it: the styles
// asserted here are the objects that go straight into the <td> and the chip.
import {
  CELL_TONES,
  cellVisual,
  normalizeFormat,
  toneTextColor,
} from "@/lib/gamedb-layout.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};
const ok = (name, value) => check(name, Boolean(value), true);

const f = (raw) => normalizeFormat(raw);

// --- a tone used as ink ---------------------------------------------------
// The bug this was written for: a solid tone's `fg` is the white that sits ON
// it, so using it as a text colour painted white text on a white cell.
check("solid red as text is red", toneTextColor("redSolid"), "#dc2626");
check("solid dark as text is black", toneTextColor("darkSolid"), "#000000");
check("solid green as text is green", toneTextColor("greenSolid"), "#15803d");
check("a pastel keeps its own ink", toneTextColor("red"), "#b91c1c");
check("no tone, no colour", toneTextColor(""), "");
check("an unknown tone is not a colour", toneTextColor("chartreuse"), "");
for (const [name, tone] of Object.entries(CELL_TONES)) {
  ok(`${name} has an ink that is not the cell background`, tone.ink !== "#ffffff");
}

// --- background only ------------------------------------------------------
check("a solid background fills the cell", cellVisual(f({ bg: "darkSolid" })).cell, {
  backgroundColor: "#27272a",
  color: "#ffffff",
});
check("and draws no chip", cellVisual(f({ bg: "darkSolid" })).chip, null);

// --- text only ------------------------------------------------------------
check("a text colour paints the text and nothing else", cellVisual(f({ fg: "redSolid" })).cell, {
  color: "#dc2626",
});

// --- both, which used to cancel out --------------------------------------
check(
  "a background and a text colour both apply",
  cellVisual(f({ bg: "darkSolid", fg: "redSolid" })).cell,
  { backgroundColor: "#27272a", color: "#dc2626" }
);

// --- nothing set ----------------------------------------------------------
check("a plain column asks for no style at all", cellVisual(f({})), {
  cell: null,
  chip: null,
  ink: "",
});

// --- chips ----------------------------------------------------------------
const chipOnly = cellVisual(f({ render: "chip" }));
check("a chip with no colours is grey", chipOnly.chip, {
  backgroundColor: "#f4f4f5",
  color: "#3f3f46",
});
check("and the cell behind it stays plain", chipOnly.cell, null);

check(
  "a chip takes its fill from the background tone",
  cellVisual(f({ render: "chip", bg: "darkSolid" })).chip,
  { backgroundColor: "#27272a", color: "#ffffff" }
);
check(
  "and its text from the text tone, which it used to ignore",
  cellVisual(f({ render: "chip", fg: "redSolid" })).chip,
  { backgroundColor: "#f4f4f5", color: "#dc2626" }
);
check(
  "both together",
  cellVisual(f({ render: "chip", bg: "darkSolid", fg: "yellowSolid" })).chip,
  { backgroundColor: "#27272a", color: "#a16207" }
);

// --- a rule that fired ----------------------------------------------------
check(
  "a rule replaces the column's own background",
  cellVisual(f({ bg: "darkSolid" }), "greenSolid").cell,
  { backgroundColor: "#16a34a", color: "#ffffff" }
);
check(
  "and its ink, so the value it is reacting to stays readable",
  cellVisual(f({ bg: "darkSolid", fg: "redSolid" }), "greenSolid").cell,
  { backgroundColor: "#16a34a", color: "#ffffff" }
);
check(
  "a rule colours the chip too",
  cellVisual(f({ render: "chip", bg: "zinc" }), "redSolid").chip,
  { backgroundColor: "#dc2626", color: "#ffffff" }
);

// --- the other render modes leave colour alone ---------------------------
for (const render of ["text", "link", "email", "copy"]) {
  check(
    `${render} keeps the colours on the cell`,
    cellVisual(f({ render, bg: "red" })).cell,
    { backgroundColor: "#fee2e2", color: "#b91c1c" }
  );
}

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
