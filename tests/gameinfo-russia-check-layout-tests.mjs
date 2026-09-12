import strict from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
const page = readFileSync(new URL("../src/components/gameinfo-russia-check-page.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(page.slice(page.indexOf("function filterPacks("), page.indexOf("function PackCount(")), context);
vm.runInContext(page.slice(page.indexOf("function latestMovementAt("), page.indexOf("function eventBadge(")), context);

const firstSeenAt = "2026-09-01T05:00:00Z";
const activatedAt = "2026-09-02T05:00:00Z";
const removedAt = "2026-09-03T05:00:00Z";
const currentPack = { status: "active", firstSeenAt, activatedAt, removedAt: null };
assert.equal(context.latestMovementAt({ status: "active", firstSeenAt }), firstSeenAt);
assert.equal(context.latestMovementAt({ ...currentPack, activatedAt: firstSeenAt }), firstSeenAt);
assert.equal(context.latestMovementAt({ ...currentPack, displayStatus: "added" }), activatedAt);
// Restored packs retain their return date even after the new badge expires.
assert.equal(context.latestMovementAt({ ...currentPack, displayStatus: "unchanged" }), activatedAt);
assert.equal(context.latestMovementAt({ ...currentPack, lastSeenAt: "2026-09-04T05:00:00Z" }), activatedAt);
assert.equal(context.latestMovementAt({ ...currentPack, status: "pending_removal", missingRuns: 1 }), activatedAt);
assert.equal(context.latestMovementAt({ status: "pending_removal", firstSeenAt }), firstSeenAt);
assert.equal(context.latestMovementAt({ ...currentPack, status: "removed", removedAt }), removedAt);
// Missing removal metadata must not be presented as an activation date.
assert.equal(context.latestMovementAt({ ...currentPack, status: "removed" }), null);
const tableSource = page.slice(page.indexOf("function PackTable("), page.indexOf("function LogGroup("));
assert.equal((tableSource.match(/<TableHead scope="col">วันที่/g) || []).length, 1);
assert.match(tableSource, /วันที่มีการเคลื่อนไหวล่าสุด/);
assert.equal((tableSource.match(/<time /g) || []).length, 1);
assert.doesNotMatch(tableSource, /วันที่เริ่มพบ\/เพิ่ม|วันที่หาย|displayStatusDate/);
assert.match(tableSource, /formatBangkok\(latestMovementAt\(item\)\)/);

const packs = [
  { name: "Traveler's Gift", displayStatus: "added" },
  { name: "Monthly Gift", displayStatus: "unchanged" },
  { name: "แพ็กฤดูร้อน", displayStatus: "removed" },
  { name: "ＳＫＹ Bundle", displayStatus: "added" },
];
const names = (status, query) => Array.from(context.filterPacks(packs, status, query), (item) => item.name);
assert.deepEqual(names("all", ""), packs.map((item) => item.name));
assert.deepEqual(names("all", "  gIFT  "), ["Traveler's Gift", "Monthly Gift"]);
assert.deepEqual(names("added", "gift"), ["Traveler's Gift"]);
assert.deepEqual(names("removed", "แพ็ก"), ["แพ็กฤดูร้อน"]);
assert.deepEqual(names("unchanged", "gift"), ["Monthly Gift"]);
assert.deepEqual(names("all", "sky"), ["ＳＫＹ Bundle"]);
assert.deepEqual(names("all", "ｇｉｆｔ"), ["Traveler's Gift", "Monthly Gift"]);
assert.deepEqual(names("removed", "gift"), []);
assert.deepEqual(names("all", "not present"), []);
assert.equal(packs.length, 4);

assert.equal(context.runResultLabel(null, 0), "ยังไม่มีผลการตรวจ");
assert.equal(context.runResultLabel({ status: "failed" }, 0), "ตรวจไม่สำเร็จ");
assert.equal(context.runResultLabel({ status: "queued" }, 0), "รอคิวตรวจ");
assert.equal(context.runResultLabel({ status: "running" }, 0), "กำลังตรวจ…");
assert.equal(context.runResultLabel({ status: "partial" }, 0), "ตรวจสำเร็จบางส่วน · เปลี่ยนแปลง 0 รายการ");
assert.equal(context.runResultLabel({ status: "completed" }, 0), "ไม่มีการเปลี่ยนแปลง");
assert.equal(context.runResultLabel({ status: "completed" }, 3), "เปลี่ยนแปลง 3 รายการ");

// The new count is independent of search/status filters and uses the existing 24-hour policy.
assert.match(page, /newPackCount = allPackItems\.filter\(\(item\) => item\.displayStatus === "added"\)\.length/);
assert.match(page, /เพิ่มใหม่ใน 24 ชม\./);
assert.match(page, /game === "all" \? "รีทุกเกม" : "รีเกมนี้"/);
assert.match(page, /className="min-w-28"[\s\S]*refreshProgress \|\| "กำลังเริ่มตรวจ…"/);
assert.match(page, /role="status" className="min-h-4/);
assert.match(page, /showGame=\{game === "all"\}/);
assert.match(page, /htmlFor="russia-check-search"/);
assert.match(page, /htmlFor="russia-check-status"/);
assert.match(page, /htmlFor="russia-check-log-status"/);
assert.match(page, /setSearch\(""\); setStatus\("all"\)/);
assert.match(page, /aria-live="polite">\{items.length\}/);
assert.match(page, /item.status === "pending_removal"/);
assert.doesNotMatch(page, /SummaryCard|GAMEINFO · PACK AVAILABILITY/);
assert.match(page, /<nav aria-label="หน้าอื่นของ Russia Check"[\s\S]*?Log รายเกม[\s\S]*?<\/nav>/);
console.log(`${assertions} passed`);
