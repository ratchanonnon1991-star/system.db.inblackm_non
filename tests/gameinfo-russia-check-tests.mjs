import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  nextRussiaCheckRunAt,
  normalizeRussiaCheckCatalog,
  normalizeRussiaCheckName,
  reconcileRussiaCheckCatalog,
} from "@/lib/gameinfo-russia-check.js";
import { fetchRussiaCheckCatalog, parseExcludedGroups, selectXsollaStorefrontItems } from "@/server/gameinfo-russia-check.js";
import { normalizeRussiaCheckSessionCookie } from "@/server/gameinfo-russia-check.js";
import { decryptRussiaCheckSession, encryptRussiaCheckSession } from "@/server/crypto.js";
import { parseCodashopPage } from "@/server/gameinfo-codashop-catalog.js";

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
const candles = [{ external_id: "candles", name: "Candles" }];
const pages = [
  { has_more: true, items: [{ sku: "a", name: "A", type: "virtual_good", groups: candles }] },
  { has_more: false, items: [{ sku: "b", name: "B", type: "virtual_good", groups: candles }, { sku: "ungrouped", name: "Not on any page", type: "virtual_good", groups: [] }] },
  // Candles is a virtual-item row, so its wrapper bundle stays hidden the way `sky115` does.
  { has_more: false, items: [{ sku: "wrapper", name: "Bundle 5", type: "bundle", groups: candles }, { sku: "realbundle", name: "Real Bundle", type: "bundle", groups: [{ external_id: "packs", name: "Packs" }] }] },
];
const catalog = await fetchRussiaCheckCatalog({ sourceUrl: "https://store.xsolla.com/api/v2", projectId: "207830", country: "RU", locale: "en" }, {
  retries: 1,
  retryDelay: async () => {},
  fetchImpl: async (url) => {
    requested.push(String(url));
    return { ok: true, status: 200, json: async () => pages.shift() };
  },
});
assert.deepEqual(catalog, [{ sku: "a", name: "A" }, { sku: "b", name: "B" }, { sku: "realbundle", name: "Real Bundle" }]);
assert.match(requested[0], /country=RU/);
assert.match(requested[0], /locale=en/);
assert.match(requested[0], /offset=0/);
assert.match(requested[1], /offset=1/);
// Both catalogs every time; a group renders one type, so it is the group that
// decides, not per-source config. Verified against the rendered storefronts.
assert.deepEqual(requested.map((u) => new URL(u).pathname), [
  "/api/v2/project/207830/items/virtual_items",
  "/api/v2/project/207830/items/virtual_items",
  "/api/v2/project/207830/items/bundle",
]);
const g = (id) => [{ external_id: id, name: id }];
const bulletEcho = [
  { sku: "xsolla.bulletecho.bucks1", name: "Handful of Bucks", type: "virtual_good", groups: g("currency") },
  { sku: "xsolla.bulletecho.bucks1_TEST", name: "Handful of Bucks", type: "bundle", groups: g("currency") },
  { sku: "xsolla.bulletecho.bucks1_bundle", name: "Handful of Bucks", type: "bundle", groups: g("currency") },
  { sku: "xsolla.bulletecho.extra5", name: "Legendary Pack", type: "bundle", groups: g("extra_offers") },
  { sku: "welcome-offer-test", name: "Bucks wholesale", type: "bundle", groups: [] },
  { sku: "loyalty.ticket.5", name: "Loyalty Ticket", type: "virtual_good", groups: g("loyalty_tickets") },
];
// BUCKS PACKS holds virtual items, so the two leftover duplicate bundles stay hidden.
assert.deepEqual(selectXsollaStorefrontItems(bulletEcho).map((i) => i.sku),
  ["xsolla.bulletecho.bucks1", "xsolla.bulletecho.extra5", "loyalty.ticket.5"]);
// A group nobody can see without logging in is excluded per source.
assert.deepEqual(selectXsollaStorefrontItems(bulletEcho, parseExcludedGroups("loyalty_tickets")).map((i) => i.sku),
  ["xsolla.bulletecho.bucks1", "xsolla.bulletecho.extra5"]);
// An item kept through any one of its groups survives.
assert.deepEqual(selectXsollaStorefrontItems([
  { sku: "shared", name: "Shared", type: "bundle", groups: [{ external_id: "currency" }, { external_id: "drones" }] },
  { sku: "vg", name: "VG", type: "virtual_good", groups: g("currency") },
]).map((i) => i.sku).sort(), ["shared", "vg"]);
assert.deepEqual([...parseExcludedGroups(" a , ,b ")], ["a", "b"]);
assert.equal(parseExcludedGroups(undefined).size, 0);

let attempts = 0;
const retried = await fetchRussiaCheckCatalog({ sourceUrl: "https://store.xsolla.com/api/v2", projectId: "207830", country: "RU", locale: "en" }, {
  retries: 3,
  retryDelay: async () => {},
  fetchImpl: async () => {
    attempts += 1;
    if (attempts < 3) throw new Error("temporary");
    return { ok: true, status: 200, json: async () => ({ has_more: false, items: [{ sku: "a", name: "A", groups: [{ external_id: "candles", name: "Candles" }] }] }) };
  },
});
// Two transient failures, then virtual_items succeeds; the bundle call is the 4th.
assert.equal(attempts, 4);
assert.equal(retried.length, 1);

let clientErrors = 0;
await assert.rejects(fetchRussiaCheckCatalog({ sourceUrl: "https://store.xsolla.com/api/v2", projectId: "207830" }, {
  retries: 3,
  retryDelay: async () => {},
  fetchImpl: async () => { clientErrors += 1; return { ok: false, status: 404 }; },
}), /404/);
assert.equal(clientErrors, 1);

const codashopHtml = `<html><body><div class="sku-card" capture-custom-sku-id="12" capture-custom-sku-name="Pack &amp; Bonus" data-auto-capture="skuClick"></div><div class="sku-card sku-card--disabled" capture-custom-sku-id="13" capture-custom-sku-name="Unavailable" data-auto-capture="skuClick"></div><script type="application/json" id="__NUXT_DATA__">[]</script></body></html>`;
assert.deepEqual(parseCodashopPage(codashopHtml), [{ sku: "12", name: "Pack & Bonus" }]);
assert.throws(() => parseCodashopPage("<html></html>"), /ไม่สมบูรณ์/);

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
assert.match(ddl, /oxide-xsolla-ru[\s\S]*89[\s\S]*OXIDE : SURVIVAL ISLAND[\s\S]*274717[\s\S]*RU/);
assert.match(ddl, /bullet-echo-xsolla-ru[\s\S]*72[\s\S]*BULLET ECHO[\s\S]*190666[\s\S]*RU/);
assert.doesNotMatch(ddl, /bullet-echo-xsolla-ru', 217/);
assert.match(ddl, /store_url[\s\S]*https:\/\/store\.thatskygame\.com\//);
assert.match(ddl, /gameinfo_russia_check_source_credentials[\s\S]*session_enc[\s\S]*expires_at/);
assert.match(ddl, /love-deepspace-infold[\s\S]*LOVE AND DEEPSPACE[\s\S]*auth_required/);
assert.match(ddl, /infinity-nikki-infold[\s\S]*Infinity Nikki[\s\S]*infinitynikki\.infoldgames\.com\/charge\/th-th/);
assert.match(ddl, /stumble-guys-codashop-ph[\s\S]*21[\s\S]*STUMBLE GUYS[\s\S]*codashop\.com\/en-ph\/stumble-guys/);
assert.match(ddl, /shining-nikki-codashop-mm[\s\S]*6[\s\S]*SHINING NIKKI[\s\S]*codashop\.com\/my-mm\/shining-nikki/);
assert.match(ddl, /crystal-of-atlan-skystone-us[\s\S]*122[\s\S]*CRYSTAL OF ATLAN \( EU\/NA\)[\s\S]*skystone[\s\S]*topup\.games\.skystone\.games\/Topup\/754024[\s\S]*'754024', 'US'/);
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
assert.match(logsRoute, /date: query\.get\("date"\)/);
const server = readFileSync(new URL("../src/server/gameinfo-russia-check.js", import.meta.url), "utf8");
assert.match(server, /'bullet-echo-xsolla-ru',72,'BULLET ECHO','xsolla'/);
assert.match(server, /'crystal-of-atlan-skystone-us',122,'CRYSTAL OF ATLAN \( EU\/NA\)','skystone'[\s\S]*'754024','US','en',false,true/);
assert.doesNotMatch(server, /'bullet-echo-xsolla-ru',217/);
assert.match(server, /provider IN \('xsolla','midasbuy','codashop','skystone'\)/);
assert.match(server, /status=\$3::varchar\(24\)[\s\S]*CASE WHEN \$3::varchar\(24\)='removed'/);
assert.doesNotMatch(server, /last_scheduled_at|lastScheduledAt/);
assert.doesNotMatch(server, /JOIN game_list|Source .*ต้องผูกกับ Game ID|config_error/);
assert.match(server, /i\.is_baseline AND s\.provider<>'demo'[\s\S]*e\.event_type='added'/);
assert.match(server, /RUSSIA_CHECK_EVENT_TYPES[\s\S]*e\.event_type=\$3/);
assert.match(server, /created_at AT TIME ZONE 'Asia\/Bangkok'[\s\S]*\$4::date/);
const page = readFileSync(new URL("../src/components/gameinfo-russia-check-page.js", import.meta.url), "utf8");
assert.match(page, /TabsTrigger value="packs"[\s\S]*TabsTrigger value="logs"/);
assert.match(page, /ไม่มีการเปลี่ยนแปลง[\s\S]*เพิ่มใหม่[\s\S]*หายไป[\s\S]*ทุกเกม/);
assert.match(page, /LOG_STATUS_ITEMS[\s\S]*ทุกสถานะ[\s\S]*กลับมา[\s\S]*กรองสถานะ Log/);
assert.match(page, /russia-check-log-date[\s\S]*type="date"/);
assert.match(page, /selectedGame\?\.storeUrl[\s\S]*เปิดหน้าเว็บ/);
assert.match(page, /จัดการ Login[\s\S]*บันทึก Session/);
assert.match(page, /ใส่เฉพาะค่าใน Request Header ชื่อ Cookie และอย่าส่งรหัสผ่านบัญชี/);
assert.doesNotMatch(page, /<TableHead>พบล่าสุด<\/TableHead>/);
assert.match(page, /demoSelected[\s\S]*ข้อมูลตัวอย่างแบบอ่านอย่างเดียว/);
assert.match(page, /อัตโนมัติทุกวัน 09:00 น\. เวลาไทย/);
assert.match(page, /รีข้อมูลเสร็จแล้ว[\s\S]*เกมที่มีการเปลี่ยนแปลง[\s\S]*item\.count.*รายการ/);
assert.match(page, /status === "failed"[\s\S]*รีข้อมูลไม่สำเร็จ[\s\S]*ตรวจไม่สำเร็จ.*failedGames\.length.*เกม/);
assert.match(page, /failedGames[\s\S]*เกมที่ตรวจไม่สำเร็จ[\s\S]*item\.gameName[\s\S]*ยังสรุปไม่ได้[\s\S]*item\.reason/);
assert.match(page, /ตรวจครบทุกเกมแล้ว ไม่มีเกมที่มีการเปลี่ยนแปลง/);
assert.doesNotMatch(page, /Source (?:ยัง)?ผูกกับเกม|configErrors/);
assert.doesNotMatch(page, />SKU<|ราคา/);
const home = readFileSync(new URL("../src/components/gameinfo-gamelist-cards.js", import.meta.url), "utf8");
assert.match(home, /russia-check[\s\S]*Russia Check/);

console.log("58 passed");
