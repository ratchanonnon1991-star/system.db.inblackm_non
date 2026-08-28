import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const cards = read("../src/components/gameinfo-gamelist-cards.js");
const dialog = read("../src/lib/use-gameinfo-dialog.js");
const theme = read("../src/app/globals.css");
const manager = read("../src/components/gameinfo-game-manager.js");
const packEditor = read("../src/components/gameinfo-pack-editor.js");

assert.ok(cards.includes('aria-label="ล้างคำค้นหา"'), "search has an explicit clear action");
assert.ok(cards.includes("activeFilters.map"), "active filters are visible and individually removable");
assert.ok(cards.includes("พบ {rows.length} จาก {rowsWithState.length} เกม"), "filtered result count is visible");
assert.ok(cards.includes("ล้างตัวกรองทั้งหมด"), "filtered empty state provides a recovery action");
assert.ok(cards.includes("setPage(0)"), "filter changes reset pagination");
assert.ok(cards.includes('aria-label="หน้าแรก"') && cards.includes("<ChevronsLeft"), "pagination can jump to the first page");
assert.ok(cards.includes('aria-label="หน้าสุดท้าย"') && cards.includes("setPage(pageCount - 1)"), "pagination can jump to the last page");
assert.ok(dialog.includes('event.key === "Escape"') && dialog.includes('event.key !== "Tab"'), "shared dialog behavior handles Escape and traps Tab focus");
assert.ok(dialog.includes('document.body.style.overflow = "hidden"'), "shared dialog behavior locks background scrolling");
assert.ok(dialog.includes("bodyScrollLockCount") && dialog.includes("unlockBodyScroll()"), "nested dialogs share a reference-counted scroll lock");
assert.ok(dialog.includes("openDialogs[openDialogs.length - 1]"), "only the top nested dialog handles keyboard input");
assert.ok(dialog.includes("previousFocus.isConnected"), "shared dialog behavior restores focus safely");
assert.ok(theme.includes("--color-linear-success") && theme.includes("--color-linear-warning") && theme.includes("--color-linear-danger"), "semantic status tokens are defined");
assert.ok(theme.includes("prefers-reduced-motion") && theme.includes(":focus-visible"), "GameInfo respects reduced motion and keyboard focus");
assert.ok(manager.includes("บันทึกเรียบร้อย") && packEditor.includes("บันทึกเรียบร้อย"), "admin save feedback uses consistent copy");

console.log("15 passed");
