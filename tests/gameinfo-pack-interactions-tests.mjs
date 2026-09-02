import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const columnControls = read("../src/components/gameinfo-pack-column-layout.js");
const editor = read("../src/components/gameinfo-pack-editor.js");
const view = read("../src/components/gameinfo-game-view.js");
const rates = read("../src/components/gameinfo-rate-panel.js");
const tagsInput = read("../src/components/gameinfo-tags-input.js");

assert.ok(columnControls.includes("<Popover.Portal>"), "column controls render outside horizontal overflow");
assert.ok(columnControls.includes('positionMethod="fixed"'), "popover positioning is viewport-relative");
assert.ok(columnControls.includes("collisionAvoidance={{"), "popover detects viewport collisions");
assert.ok(columnControls.includes("calc(100vw-1rem)"), "popover width fits a 320px viewport");
assert.ok(columnControls.includes("calc(100dvh-1rem)"), "popover height stays within the viewport");
assert.ok(columnControls.includes("<Popover.Close") && columnControls.includes("<Popover.Title"), "popover has accessible close and title semantics");
assert.ok(columnControls.includes("aria-expanded={open}") && columnControls.includes("aria-controls={popoverId}"), "trigger exposes popup state and relationship");
assert.ok(columnControls.includes("initialFocus={closeButtonRef}") && columnControls.includes("finalFocus={triggerRef}"), "focus enters and returns from the popup");
assert.ok(columnControls.includes("--ll-shadow-modal"), "popover uses theme-aware level-2 elevation");
assert.ok(columnControls.includes("orderDirty") && columnControls.includes("ขยับแล้ว · กดเพื่อบันทึก"), "column reorder visibly points users to the preset save control");
assert.ok(editor.includes("<GameinfoPackColumnControls") && view.includes("<GameinfoPackColumnControls"), "editor and view share the repaired controls");
assert.ok(editor.includes('render={<label htmlFor={csvInputId} />}') && editor.includes('className="sr-only"'), "CSV input uses an accessible button-style label");
assert.ok(editor.includes('<FileUp data-icon="inline-start" />') && editor.includes('"เลือกไฟล์ CSV"'), "CSV picker has a clear button label and icon");
assert.ok(editor.includes("scopeMode, entryMode") && editor.includes("scopeMode, entryMode, kind:"), "manual column mode survives creation");
// A market's price is now a link to a column the game already has, so the
// column is ordinary and deletable; it used to be created by turning a market
// on and nothing could unmake it.
assert.ok(!editor.includes('if (column?.kind === "market") return;'), "market columns are no longer undeletable");
assert.ok(!editor.includes('column.computed.kind !== "market"'), "delete is no longer withheld from market columns");
// Main and secondary channels share one column in the read-only view, with a
// switch, rather than two columns the second of which is empty for most packs.
assert.ok(!view.includes('column.id === "channelsSecondary"') || view.includes('filter((column) => column.id !== "channelsSecondary")'), "the view merges the two channel columns into one");
assert.ok(view.includes('field: secondary ? "channelsSecondary" : "channelsMain"'), "the merged column switches which field it reads");
assert.ok(view.includes('label: secondary ? "ช่องทางรอง" : "ช่องทางหลัก"'), "the merged column says which channel it is showing");
assert.ok(view.includes('"สลับช่องทางรอง"') || view.includes("สลับช่องทางรอง"), "the switch is labelled for the reader");
assert.ok(view.includes("hasSecondaryChannels"), "the switch only appears when the game has a second channel");
assert.ok(view.includes("onPointerDown={(event) => event.stopPropagation()}"), "the switch survives the header's drag-to-reorder handlers");
// Per-cell scope badges crowded a table that is mostly numbers; the tooltip
// and the dialog title already say which scope a formula came from.
assert.ok(!editor.includes(">เฉพาะแถว<"), "cells no longer label row-specific formulas inline");
assert.ok(!editor.includes(">เฉพาะหมวด<"), "cells no longer label category formulas inline");
assert.ok(editor.includes("effective.sourceLabel"), "the cell tooltip still names the formula's scope");

assert.ok(tagsInput.includes("w-max min-w-full flex-nowrap"), "channel tags stay on one horizontal line");
assert.ok(tagsInput.includes("inline-flex shrink-0") && tagsInput.includes("whitespace-nowrap"), "channel tags never wrap internally");
assert.ok(tagsInput.includes("(text.length + 1) * 8"), "channel cursor input grows at the end of the tag row");
assert.ok(tagsInput.includes("focus-visible:outline-none"), "channel input delegates focus styling to its single outer frame");

assert.ok(editor.includes('className="group/pack-tools '), "outer pack tools details uses an isolated group");
assert.ok(editor.includes("group-open/pack-tools:rotate-180"), "outer arrow follows only the pack tools details");
assert.ok(rates.includes("<TooltipProvider") && rates.includes("<TooltipContent"), "rate charts use shared tooltip primitives");
assert.ok(rates.includes("<TooltipTrigger") && rates.includes("aria-label={`ดูกราฟอัตราแลกเปลี่ยน"), "each rate chart is available by hover and keyboard focus");
assert.ok(rates.includes("calc(100vw-1rem)"), "rate tooltip fits narrow viewports");
assert.equal(rates.includes("<details"), false, "rate cards no longer add a nested folding state");
assert.equal(rates.includes("group-open/rate-card"), false, "rate cards no longer depend on nested details arrows");

// The read-only view (used by the topup view) colours country and channels the
// same way the editor does, and splits channels into one tag per entry.
assert.ok(view.includes("gameinfoStableColorStyle"), "view tags carry the shared name-derived colour");
assert.ok(
  view.includes('column.id === "country" || column.id === "channelsMain" || column.id === "channelsSecondary"'),
  "country and both channel columns render as coloured tags"
);
assert.ok(view.includes("values.map((item) => ("), "each channel becomes its own tag");
assert.ok(view.includes("function StableTag({ value, label = value, className"), "one tag component serves the table and the header summary");
assert.ok(view.includes("gameinfoCountryDisplayName(item)"), "the view shows the same trimmed country name as the editor");

console.log("41 passed");
