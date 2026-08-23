import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/gameinfo-tutorial-modal.js", import.meta.url), "utf8");

assert.ok(source.includes("<CheckCircle2"), "successful save shows a confirmation icon");
assert.ok(source.includes("บันทึกเรียบร้อย"), "successful save shows confirmation text");
assert.ok(source.includes("window.setTimeout(onClose, 900)"), "successful save closes the modal automatically");

console.log("3 passed");
