import { readFileSync } from "node:fs";
import {
  CROP_OUTPUT_SIZE,
  centeredCropOffset,
  clampCropOffset,
  computeCropRect,
  coverScale,
} from "@/lib/gameinfo-image-crop.js";

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

const viewport = 300;
const wide = { naturalWidth: 1000, naturalHeight: 500, viewport, zoom: 1 };
const tall = { naturalWidth: 400, naturalHeight: 1200, viewport, zoom: 1 };

check("cover scale fills the square from the short edge", coverScale(1000, 500, 300), 0.6);
check("cover scale is zero for an unmeasured image", coverScale(0, 0, 300), 0);

check("a wide image starts centered", centeredCropOffset(wide), { x: -150, y: 0 });
check("a tall image starts centered", centeredCropOffset(tall), { x: 0, y: -300 });

check(
  "the centered crop of a wide image is the middle square",
  computeCropRect({ ...wide, offset: centeredCropOffset(wide) }),
  { sx: 250, sy: 0, size: 500 }
);
check(
  "the centered crop of a tall image is the middle square",
  computeCropRect({ ...tall, offset: centeredCropOffset(tall) }),
  { sx: 0, sy: 400, size: 400 }
);
check(
  "zooming in crops a smaller square",
  computeCropRect({ ...wide, zoom: 2, offset: centeredCropOffset({ ...wide, zoom: 2 }) }),
  { sx: 375, sy: 125, size: 250 }
);

// Dragging must never expose a blank edge, in either direction.
check("dragging past the left edge clamps", clampCropOffset({ x: 40, y: 0 }, wide), { x: 0, y: 0 });
check("dragging past the right edge clamps", clampCropOffset({ x: -900, y: 0 }, wide), { x: -300, y: 0 });
check("a square image cannot be dragged at all", clampCropOffset({ x: -50, y: 20 }, { naturalWidth: 800, naturalHeight: 800, viewport, zoom: 1 }), { x: 0, y: 0 });

// The crop square must stay inside the source bitmap so drawImage never reads
// past the edge.
const edge = computeCropRect({ ...wide, offset: { x: -1000, y: -1000 } });
ok("the crop rect stays inside the image", edge.sx + edge.size <= 1000 && edge.sy + edge.size <= 500);

check("output stays a square", CROP_OUTPUT_SIZE > 0, true);

// The modal must stage a pasted image for cropping rather than committing it,
// while the upload tab keeps its direct path.
const modal = readFileSync(new URL("../src/components/gameinfo-image-picker-modal.js", import.meta.url), "utf8");
ok("Ctrl+V routes into the crop step", modal.includes("if (file) stageFileForCrop(file);"));
ok("the pasted image only reaches onChange from the crop step", modal.includes("onDone={(dataUrl) => {"));
ok("a pending crop counts as unsaved work", modal.includes("const dirty = Boolean(cropSource)"));

if (failures.length) {
  console.error(failures.join("\n"));
  console.error(`${pass} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
