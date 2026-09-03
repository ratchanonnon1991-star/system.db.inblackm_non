import strict from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPool, log, reset, setResponder } from "@/lib/db";
import { getRussiaCheckDailyLog } from "@/server/gameinfo-russia-check-daily";
import { russiaCheckRecentBounds } from "@/lib/gameinfo-russia-check-recency";
import { getRussiaCheckDashboard, getRussiaCheckGameLog } from "@/server/gameinfo-russia-check";

let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });
const now = new Date("2026-09-03T02:00:00.000Z");
const expectedBounds = { startAt: "2026-09-02T02:00:00.000Z", endAt: "2026-09-03T02:00:00.000Z" };
assert.deepEqual(russiaCheckRecentBounds(now), expectedBounds);
assert.deepEqual(russiaCheckRecentBounds("2026-09-03T17:00:00.000Z"), {
  startAt: "2026-09-02T17:00:00.000Z", endAt: "2026-09-03T17:00:00.000Z",
});
assert.deepEqual(russiaCheckRecentBounds("2026-12-31T17:00:00.000Z"), {
  startAt: "2026-12-30T17:00:00.000Z", endAt: "2026-12-31T17:00:00.000Z",
});
assert.throws(() => russiaCheckRecentBounds("bad date"), /Invalid/);

const rows = [
  { game_id: "1", game_name: "Changed within 24 hours", has_changes: true, checked_recently: true },
  { game_id: "2", game_name: "No changes", has_changes: false, checked_recently: true },
  { game_id: "3", game_name: "Failed or missing checks", has_changes: false, checked_recently: false },
  { game_id: "4", game_name: "Changes despite partial coverage", has_changes: true, checked_recently: false },
];
reset({ rows });
const result = await getRussiaCheckDailyLog(getPool(), null, now);
assert.deepEqual(result, { ...expectedBounds, games: [
  { gameId: 1, gameName: rows[0].game_name, status: "changed" },
  { gameId: 2, gameName: rows[1].game_name, status: "unchanged" },
  { gameId: 3, gameName: rows[2].game_name, status: "unchecked" },
  { gameId: 4, gameName: rows[3].game_name, status: "changed" },
] });
const query = log[0];
assert.deepEqual(query.params, [null, expectedBounds.startAt, expectedBounds.endAt]);
assert.match(query.text, /BOOL_OR\(EXISTS/);
assert.match(query.text, /BOOL_AND\(EXISTS/);
assert.match(query.text, /e\.created_at > \$2::timestamptz AND e\.created_at <= \$3::timestamptz/);
assert.match(query.text, /e\.event_type IN \('added','removed','restored'\)/);
assert.match(query.text, /rs\.status='completed'/);
assert.match(query.text, /rs\.finished_at > \$2::timestamptz AND rs\.finished_at <= \$3::timestamptz/);
assert.match(query.text, /GROUP BY s\.game_id\s+ORDER BY/);
assert.match(query.text, /s\.enabled OR s\.provider='demo' OR s\.auth_required/);
assert.match(query.text, /\(\$1::int IS NULL OR s\.game_id=\$1\)/);
assert.doesNotMatch(query.text, /LIMIT|cursor|trigger_type|pack_name|sku/);

reset({ rows: [rows[1]] });
assert.equal((await getRussiaCheckDailyLog(getPool(), 2, now)).games[0].status, "unchanged");
assert.deepEqual(log[0].params, [2, expectedBounds.startAt, expectedBounds.endAt]);
reset();
assert.deepEqual((await getRussiaCheckDailyLog(getPool(), 999, now)).games, []);
reset({ fail: "database unavailable" });
await assert.rejects(getRussiaCheckDailyLog(getPool(), null, now), /database unavailable/);

// Dashboard always exposes all games in the daily log, even for a selected game.
reset();
setResponder((sql) => ({ rows: sql.includes("BOOL_OR(EXISTS") ? rows : [] }));
const all = await getRussiaCheckDashboard();
assert.equal(all.dailyLog.games.length, 4);
assert.equal(log.find(({ text }) => text.includes("BOOL_OR(EXISTS")).params[0], null);
reset();
setResponder((sql) => ({ rows: sql.includes("BOOL_OR(EXISTS") ? rows : [] }));
const selected = await getRussiaCheckDashboard({ gameId: "2", status: "removed" });
assert.deepEqual(selected.dailyLog.games, all.dailyLog.games);
assert.equal(log.find(({ text }) => text.includes("BOOL_OR(EXISTS")).params[0], null);
assert.deepEqual(log.find(({ text }) => text.includes("SELECT i.name,i.status")).params, [2, "removed"]);
await assert.rejects(getRussiaCheckDashboard({ gameId: "invalid" }), { status: 400 });

const page = readFileSync(new URL("../src/components/gameinfo-russia-check-page.js", import.meta.url), "utf8");
assert.match(page, /TabsTrigger value="logs"/);
assert.doesNotMatch(page, /value="daily-logs"/);
assert.doesNotMatch(page, /DailyGameLog/);
assert.match(page, /href=\{`\/gameinfo\/\$\{lang\}\/russia-check\/game-logs`\}[\s\S]*Log รายเกม/);
const dailyUi = readFileSync(new URL("../src/components/gameinfo-russia-check-game-logs-page.js", import.meta.url), "utf8");
assert.equal((dailyUi.match(/<TableHead scope=/g) || []).length, 2);
assert.match(dailyUi, /formatBangkok\(log.startAt\)[\s\S]*formatBangkok\(log.endAt\)/);
assert.match(dailyUi, /changed: "มีการเปลี่ยนแปลง", unchanged: "ไม่มีการเปลี่ยนแปลง", unchecked: "ยังตรวจไม่ครบใน 24 ชม\."/);
assert.match(dailyUi, /setInterval\(reload, 60_000\)/);
assert.match(dailyUi, /โหลดสรุปรายเกมไม่สำเร็จ/);
assert.match(dailyUi, /ยังไม่มีเกมที่ติดตาม/);
assert.match(dailyUi, /24 ชั่วโมงล่าสุด · ทุกเกม/);
assert.match(dailyUi, /กลับ Russia Check/);
assert.match(dailyUi, /clearInterval\(timer\)/);
assert.doesNotMatch(dailyUi, /<Select|<Tabs|method: "POST"/);
assert.match(dailyUi, /russia-check\?gameId=\$\{item.gameId\}/);
assert.doesNotMatch(dailyUi, /packName|nextCursor|logStatus|\.events/);
assert.doesNotMatch(dailyUi, /วันนี้|00:00/);

const routePage = readFileSync(new URL("../src/app/gameinfo/[lang]/russia-check/game-logs/page.js", import.meta.url), "utf8");
assert.match(routePage, /getSessionUser\(\)[\s\S]*hasGameinfoAccess\(user\)[\s\S]*await getRussiaCheckGameLog\(\)/);
const routeApi = readFileSync(new URL("../src/app/api/gameinfo/russia-check/game-logs/route.js", import.meta.url), "utf8");
assert.match(routeApi, /await requireGameinfoAccess\(request\)[\s\S]*await getRussiaCheckGameLog\(\)/);
assert.doesNotMatch(routeApi, /searchParams|POST|requireGameinfoMarketChecker/);
reset();
setResponder((sql) => ({ rows: sql.includes("BOOL_OR(EXISTS") ? rows : [] }));
assert.deepEqual((await getRussiaCheckGameLog()).games, all.dailyLog.games);
assert.equal(log.find(({ text }) => text.includes("BOOL_OR(EXISTS")).params[0], null);
assert.ok(!log.some(({ text }) => text.includes("SELECT i.name,i.status")));
console.log(`${assertions} passed`);
