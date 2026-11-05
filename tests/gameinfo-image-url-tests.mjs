import { existsSync, readFileSync } from "node:fs";
import {
  gamelistImageRawHref,
  isGamelistImageRawHref,
  isImageDataUrl,
  parseImageDataUrl,
} from "@/lib/gameinfo-image-url.js";

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

check("a base64 image data URL parses", parseImageDataUrl("data:image/png;base64,iVBORw0K"), {
  contentType: "image/png",
  base64: "iVBORw0K",
});
check("the content type is lower-cased", parseImageDataUrl("data:Image/WEBP;base64,UklG")?.contentType, "image/webp");
check("an svg+xml type is kept whole", parseImageDataUrl("data:image/svg+xml;base64,PHN2Zz4=")?.contentType, "image/svg+xml");
check("line breaks inside the base64 are dropped", parseImageDataUrl("data:image/jpeg;base64,/9j/\n4AAQ")?.base64, "/9j/4AAQ");
check("an https URL is not a data URL", parseImageDataUrl("https://cdn.example.com/a.png"), null);
check("a non-base64 data URL is left alone", parseImageDataUrl("data:image/svg+xml;utf8,<svg/>"), null);
check("a non-image data URL is left alone", parseImageDataUrl("data:text/html;base64,PGI+"), null);
check("empty is not a data URL", parseImageDataUrl(""), null);
ok("isImageDataUrl agrees with the parser", isImageDataUrl("data:image/gif;base64,R0lG") && !isImageDataUrl("https://x"));

check("the raw href carries the version", gamelistImageRawHref(42, "abc123"), "/api/gameinfo/gamelist/42/image/raw?v=abc123");
ok("a game's own raw href is recognised", isGamelistImageRawHref(gamelistImageRawHref(42, "abc"), 42));
ok("the id may come in as a string", isGamelistImageRawHref("/api/gameinfo/gamelist/42/image/raw?v=abc", "42"));
ok("another game's raw href is not this game's", !isGamelistImageRawHref(gamelistImageRawHref(7, "abc"), 42));
ok("an absolute URL to the same path is not taken for it", !isGamelistImageRawHref("https://evil.example/api/gameinfo/gamelist/42/image/raw", 42));
ok("the JSON image endpoint is not the raw one", !isGamelistImageRawHref("/api/gameinfo/gamelist/42/image", 42));

// The list must never ship the data URL itself, and saving its href back
// must not overwrite the stored image with a pointer to itself.
const repo = readFileSync(new URL("../src/server/gameinfo-gamelist-image.js", import.meta.url), "utf8");
ok("the list query swaps inlined images for a hash", repo.includes("md5(image_url) END AS inline_hash"));
ok("the list query blanks the inlined value", repo.includes("THEN '' ELSE image_url END AS image_url"));
ok("saving the raw href keeps the stored image", repo.includes("if (isGamelistImageRawHref(normalized, gameId))"));

const routePath = new URL("../src/app/api/gameinfo/gamelist/[id]/image/raw/route.js", import.meta.url);
ok("the raw image route exists", existsSync(routePath));
const route = readFileSync(routePath, "utf8");
ok("the raw route checks GameInfo access", route.includes("await requireGameinfoAccess(request)"));
ok("a versioned image is cached for good", route.includes("private, max-age=31536000, immutable"));
ok("the raw route sandboxes what it serves", route.includes("sandbox"));

ok(
  "GameInfo shows a loading state while a page renders",
  existsSync(new URL("../src/app/gameinfo/[lang]/loading.js", import.meta.url))
);

const picker = readFileSync(new URL("../src/components/gameinfo-image-picker-modal.js", import.meta.url), "utf8");
ok("the crop is encoded as WebP first", picker.includes('canvas.toDataURL("image/webp", 0.85)'));
ok("a browser without WebP encoding falls back", picker.includes('webp.startsWith("data:image/webp")'));

if (failures.length) {
  console.error(failures.join("\n"));
  console.error(`${pass} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
