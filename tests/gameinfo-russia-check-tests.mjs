import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  nextRussiaCheckRunAt,
  normalizeRussiaCheckCatalog,
  normalizeRussiaCheckName,
  reconcileRussiaCheckCatalog,
} from "@/lib/gameinfo-russia-check.js";
import { fetchRussiaCheckCatalog } from "@/server/gameinfo-russia-check.js";
import { normalizeRussiaCheckSessionCookie } from "@/server/gameinfo-russia-check.js";
import { decryptRussiaCheckSession, encryptRussiaCheckSession } from "@/server/crypto.js";

assert.equal(normalizeRussiaCheckName("  Pack\u00a0  Name  "), "Pack Name");
assert.deepEqual(normalizeRussiaCheckCatalog([
  { sku: "b", name: " Pack B " },
  { sku: "hidden", name: "Hidden", can_be_bought: false },
  { sku: "a", name: "Pack A" },
]), [{ sku: "a", name: "Pack A" }, { sku: "b", name: "Pack B" }]);
assert.throws(() => normalizeRussiaCheckCatalog([]), /ว่าง/);
assert.throws(() => normalizeRussiaCheckCatalog([{ sku: "a", name: "" }]), /ไม่มี SKU หรือชื่อ/);
assert.throws(() => normalizeRussiaCheckCatalog([{ sku: "a", name: "A" }, { sku: "a", name: "A2" }]), /SKU ซ้ำ/);

const baseline = reconcileRussiaCheckCatalog([], [{ sku: "a", name: "A" }], { baseline: true });
assert.equal(baseline.items[0].status, "active");
assert.equal(baseline.items[0].baseline, true);
assert.deepEqual(baseline.events, [{ kind: "added", sku: "a", name: "A" }]);

const added = reconcileRussiaCheckCatalog([{ sku: "a", name: "A", status: "active", missingRuns: 0 }], [
  { sku: "a", name: "A renamed" }, { sku: "b", name: "B" },
]);
assert.deepEqual(added.events, [{ kind: "added", sku: "b", name: "B" }]);
assert.equal(added.items.find((item) => item.sku === "a").name, "A renamed");

const pending = reconcileRussiaCheckCatalog([{ sku: "a", name: "A", status: "active", missingRuns: 0 }], []);
assert.equal(pending.items[0].status, "pending_removal");
assert.equal(pending.items[0].missingRuns, 1);
assert.deepEqual(pending.events, []);

const removed = reconcileRussiaCheckCatalog([{ sku: "a", name: "A", status: "pending_removal", missingRuns: 1 }], []);
assert.equal(removed.items[0].status, "removed");
assert.deepEqual(removed.events, [{ kind: "removed", sku: "a", name: "A" }]);

const returnedBeforeRemoval = reconcileRussiaCheckCatalog([{ sku: "a", name: "A", status: "pending_removal", missingRuns: 1 }], [{ sku: "a", name: "A" }]);
assert.equal(returnedBeforeRemoval.items[0].status, "active");
assert.equal(returnedBeforeRemoval.items[0].missingRuns, 0);
assert.deepEqual(returnedBeforeRemoval.events, []);

const restored = reconcileRussiaCheckCatalog([{ sku: "a", name: "A", status: "removed", missingRuns: 2 }], [{ sku: "a", name: "A" }]);
assert.equal(restored.items[0].status, "active");
assert.deepEqual(restored.events, [{ kind: "restored", sku: "a", name: "A" }]);
assert.equal(nextRussiaCheckRunAt(new Date("2026-09-02T01:59:59Z")).toISOString(), "2026-09-02T02:00:00.000Z");
assert.equal(nextRussiaCheckRunAt(new Date("2026-09-02T02:00:00Z")).toISOString(), "2026-09-03T02:00:00.000Z");

const requested = [];
const pages = [
  { has_more: true, items: [{ sku: "a", name: "A" }] },
  { has_more: false, items: [{ sku: "b", name: "B" }] },
];
const catalog = await fetchRussiaCheckCatalog({ sourceUrl: "https://store.xsolla.com/api/v2", projectId: "207830", country: "RU", locale: "en" }, {
  retries: 1,
  retryDelay: async () => {},
  fetchImpl: async (url) => {
    requested.push(String(url));
    return { ok: true, status: 200, json: async () => pages.shift() };
  },
});
assert.deepEqual(catalog, [{ sku: "a", name: "A" }, { sku: "b", name: "B" }]);
assert.match(requested[0], /country=RU/);
assert.match(requested[0], /locale=en/);
assert.match(requested[0], /offset=0/);
assert.match(requested[1], /offset=1/);

let attempts = 0;
const retried = await fetchRussiaCheckCatalog({ sourceUrl: "https://store.xsolla.com/api/v2", projectId: "207830", country: "RU", locale: "en" }, {
  retries: 3,
  retryDelay: async () => {},
  fetchImpl: async () => {
    attempts += 1;
    if (attempts < 3) throw new Error("temporary");
    return { ok: true, status: 200, json: async () => ({ has_more: false, items: [{ sku: "a", name: "A" }] }) };
  },
});
assert.equal(attempts, 3);
assert.equal(retried.length, 1);

let clientErrors = 0;
await assert.rejects(fetchRussiaCheckCatalog({ sourceUrl: "https://store.xsolla.com/api/v2", projectId: "207830" }, {
  retries: 3,
  retryDelay: async () => {},
  fetchImpl: async () => { clientErrors += 1; return { ok: false, status: 404 }; },
}), /404/);
assert.equal(clientErrors, 1);

assert.equal(normalizeRussiaCheckSessionCookie("  sid=abc; token=xyz  "), "sid=abc; token=xyz");
assert.throws(() => normalizeRussiaCheckSessionCookie("sid=abc\nother=value"), /บรรทัดเดียว/);
assert.throws(() => normalizeRussiaCheckSessionCookie("missing-separator"), /รูปแบบ Cookie/);
const previousSessionKey = process.env.RUSSIA_CHECK_SESSION_KEY;
process.env.RUSSIA_CHECK_SESSION_KEY = "test-only-russia-check-session-key";
const encryptedSession = encryptRussiaCheckSession("sid=secret-value");
assert.notEqual(encryptedSession, "sid=secret-value");
assert.equal(decryptRussiaCheckSession(encryptedSession), "sid=secret-value");
if (previousSessionKey == null) delete process.env.RUSSIA_CHECK_SESSION_KEY;
else process.env.RUSSIA_CHECK_SESSION_KEY = previousSessionKey;

const ddl = readFileSync(new URL("../db-init/006-gameinfo-russia-check.sql", import.meta.url), "utf8");
assert.match(ddl, /sky-xsolla-ru[\s\S]*139[\s\S]*SKY CHILDREN/);
assert.match(ddl, /store_url[\s\S]*https:\/\/store\.thatskygame\.com\//);
assert.match(ddl, /gameinfo_russia_check_source_credentials[\s\S]*session_enc[\s\S]*expires_at/);
assert.match(ddl, /love-deepspace-infold[\s\S]*LOVE AND DEEPSPACE[\s\S]*auth_required/);
assert.match(ddl, /infinity-nikki-infold[\s\S]*Infinity Nikki[\s\S]*infinitynikki\.infoldgames\.com\/charge\/th-th/);
assert.match(ddl, /WHERE status IN \('queued', 'running'\)/);
assert.match(ddl, /event_type IN \('added', 'removed', 'restored'\)/);
assert.match(ddl, /demo-data[\s\S]*demo data[\s\S]*'demo'[\s\S]*false/);
assert.match(ddl, /Demo — Existing Pack[\s\S]*Demo — New Pack[\s\S]*Demo — Pending Confirmation[\s\S]*Demo — Removed Pack/);
assert.match(ddl, /item_count=20,added_count=6,removed_count=4,restored_count=3/);
const scheduler = readFileSync(new URL("../src/server/gameinfo-russia-check-scheduler.js", import.meta.url), "utf8");
assert.match(scheduler, /nextRussiaCheckRunAt[\s\S]*startRussiaCheck\(null, "scheduled"\)/);
const instrumentation = readFileSync(new URL("../src/instrumentation.js", import.meta.url), "utf8");
assert.match(instrumentation, /startGameinfoRussiaCheckScheduler/);
const refreshRoute = readFileSync(new URL("../src/app/api/gameinfo/russia-check/refresh/route.js", import.meta.url), "utf8");
assert.match(refreshRoute, /requireGameinfoMarketChecker/);
assert.match(refreshRoute, /startRussiaCheck\(user, "manual", body\.gameId, body\.retryRunId\)/);
const readRoute = readFileSync(new URL("../src/app/api/gameinfo/russia-check/route.js", import.meta.url), "utf8");
assert.match(readRoute, /requireGameinfoAccess/);
const sessionRoute = readFileSync(new URL("../src/app/api/gameinfo/russia-check/sources/[id]/session/route.js", import.meta.url), "utf8");
assert.match(sessionRoute, /requireGameinfoEditor[\s\S]*saveRussiaCheckSourceSession/);
assert.doesNotMatch(sessionRoute, /GET\s*\(/);
const logsRoute = readFileSync(new URL("../src/app/api/gameinfo/russia-check/logs/route.js", import.meta.url), "utf8");
assert.match(logsRoute, /eventType: query\.get\("eventType"\)/);
const server = readFileSync(new URL("../src/server/gameinfo-russia-check.js", import.meta.url), "utf8");
assert.doesNotMatch(server, /last_scheduled_at|lastScheduledAt/);
assert.doesNotMatch(server, /JOIN game_list|Source .*ต้องผูกกับ Game ID|config_error/);
assert.match(server, /i\.is_baseline AND s\.provider<>'demo'[\s\S]*e\.event_type='added'/);
assert.match(server, /RUSSIA_CHECK_EVENT_TYPES[\s\S]*e\.event_type=\$3/);
const page = readFileSync(new URL("../src/components/gameinfo-russia-check-page.js", import.meta.url), "utf8");
assert.match(page, /TabsTrigger value="packs"[\s\S]*TabsTrigger value="logs"/);
assert.match(page, /ไม่มีการเปลี่ยนแปลง[\s\S]*เพิ่มใหม่[\s\S]*หายไป[\s\S]*ทุกเกม/);
assert.match(page, /LOG_STATUS_ITEMS[\s\S]*ทุกสถานะ[\s\S]*กลับมา[\s\S]*กรองสถานะ Log/);
assert.match(page, /selectedGame\?\.storeUrl[\s\S]*เปิดหน้าเว็บ/);
assert.match(page, /จัดการ Login[\s\S]*บันทึก Session/);
assert.match(page, /ใส่เฉพาะค่าใน Request Header ชื่อ Cookie และอย่าส่งรหัสผ่านบัญชี/);
assert.doesNotMatch(page, /<TableHead>พบล่าสุด<\/TableHead>/);
assert.match(page, /demoSelected[\s\S]*ข้อมูลตัวอย่างแบบอ่านอย่างเดียว/);
assert.match(page, /อัตโนมัติทุกวัน 09:00 น\. เวลาไทย/);
assert.doesNotMatch(page, /Source (?:ยัง)?ผูกกับเกม|configErrors/);
assert.doesNotMatch(page, />SKU<|ราคา/);
const home = readFileSync(new URL("../src/components/gameinfo-gamelist-cards.js", import.meta.url), "utf8");
assert.match(home, /russia-check[\s\S]*Russia Check/);

console.log("45 passed");
