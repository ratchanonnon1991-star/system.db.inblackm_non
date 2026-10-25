import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { validDate, addDays, hourAt, hourKey, bangkokWorkday,
  forecastHours, defaultStaffPlan, normalizeStaffPlan, calculateStaffing } from "../src/lib/workforce-planning.js";
import { BOT_SOURCES, WEB_SOURCE, buildSourceQuery, aggregateSourceSql } from "../src/server/workforce-sources.js";
import { buildWorkforceReport, planningRange } from "../src/server/workforce-report.js";

let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`ok ${name}`); }

await check("strict dates and Bangkok workday remain correct across midnight", () => {
  assert.equal(validDate("2026-02-30"), false); assert.equal(validDate("2026-10-24"), true);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(bangkokWorkday(new Date("2026-10-24T03:00:00+07:00")), "2026-10-23");
  assert.equal(bangkokWorkday(new Date("2026-10-24T09:00:00+07:00")), "2026-10-24");
  assert.equal(hourKey(hourAt("2026-10-24", 27)), "2026-10-25T03");
  assert.throws(() => planningRange("2026-10-25", new Date("2026-10-24T12:00:00+07:00")));
  assert.throws(() => planningRange("bad", new Date()));
});

const date = "2026-10-24";
const history = [];
for (let d = 1; d <= 56; d++) for (let h = 9; h < 33; h++) {
  history.push({ channel: "itemku", hour: hourAt(addDays(date, -d), h).toISOString(), units: h < 18 ? 10 : 20, orders: 1, open_units: 0, open_orders: 0, unknown_status: 0, cancelled: 0 });
}
await check("seasonal forecast uses complete prior days, never current/future counts", () => {
  const options = { date, historyStart: addDays(date, -56), coverageStart: history.at(-24).hour };
  const base = forecastHours(history, options);
  const contaminated = forecastHours([...history, { hour: hourAt(date, 12).toISOString(), units: 999999 }, { hour: hourAt(addDays(date, 1), 12).toISOString(), units: 999999 }], options);
  assert.deepEqual(base, contaminated);
  assert.equal(base.length, 24); assert.equal(base[0].expected, 10); assert.equal(base[20].expected, 20);
  assert.equal(base[0].method, "weekday-hour");
});
await check("insufficient history is null and recent-hour fallback is explicit", () => {
  const options = { date, historyStart: addDays(date, -56), coverageStart: hourAt(addDays(date, -2), 9).toISOString() };
  assert.equal(forecastHours(history, options)[0].expected, null);
  const fallback = forecastHours(history, { ...options, coverageStart: hourAt(addDays(date, -6), 9).toISOString() });
  assert.equal(fallback[0].method, "recent-hour"); assert.equal(fallback[0].expected, 10);
});
await check("one productivity rate: utilization and human share applied once, unknown rate gives no headcount", () => {
  const forecast = Array.from({ length: 24 }, (_, i) => ({ hour: hourAt(date, i + 9).toISOString(), expected: i === 5 ? 30 : 20 }));
  forecast[23] = { ...forecast[23], expected: null };
  const plan = { ...defaultStaffPlan(), rate: 10, humanShare: 50, utilization: 80 };
  const result = calculateStaffing(forecast, plan);
  assert.equal(result.hours[0].demand, 10); assert.equal(result.hours[0].people, 2);
  assert.equal(result.hours[5].demand, 15); assert.equal(result.hours[5].people, 2);
  assert.equal(result.hours[23].people, null); assert.equal(result.peakPeople, 2);
  assert.equal(calculateStaffing(forecast, defaultStaffPlan()).peakPeople, null);
  assert.equal(calculateStaffing(forecast, defaultStaffPlan()).hours[0].people, null);
  assert.equal(normalizeStaffPlan({ rate: -9, utilization: 0 }).rate, 0);
  assert.equal(normalizeStaffPlan({ rate: -9, utilization: 0 }).utilization, 1);
});

const db = new PGlite();
try {
  await db.exec(`CREATE TABLE itemku_orders(order_id text,quantity int,status text,paid_at timestamptz,created_at timestamptz);
    CREATE TABLE telegram_orders_dev(task_request_id text,order_id text,source text,source_group text,status text,created_at timestamptz);
    CREATE TABLE codashop_orders(id int,source text,source_order_id text,telegram_task_request_id text,status text,quantity int,created_at timestamp,raw_data jsonb);
    CREATE TABLE orders(id text,payment_confirmed_at timestamptz);
    CREATE TABLE queue_bot_orders(id int,order_id text,status text,quantity int,created_at timestamp);
    INSERT INTO itemku_orders VALUES('OD1',2,'synced','2026-10-24 10:00+07','2026-10-24 10:00+07');
    INSERT INTO telegram_orders_dev VALUES('itemku-OD1','OD1',NULL,'Itemku','processing','2026-10-24 10:01+07');
    INSERT INTO codashop_orders VALUES(1,'itemku','OD1','itemku-OD1','completed',1,'2026-10-24 10:02','{}'),
      (2,'itemku','OD1#2','itemku-OD1','completed',1,'2026-10-24 10:03','{}');
    INSERT INTO orders VALUES('IN1-1','2026-10-24 11:00+07'),('UNPAID',NULL);
    INSERT INTO queue_bot_orders VALUES(10,'IN1-1','PENDING',1,'2026-10-24 10:00'),
      (11,'IN1-1','PENDING',2,'2026-10-24 10:00'),(12,'UNPAID','AWAITING_PAYMENT',100,'2026-10-24 10:00');`);
  const schema = (await db.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public'")).rows;
  const parts = sources => sources.map(d => buildSourceQuery(d, schema.filter(c => c.table_name === d.table), {
    telegramAvailable: true, telegramColumns: schema.filter(c => c.table_name === "telegram_orders_dev"),
  })).filter(Boolean);
  await db.exec("SET TIME ZONE 'Asia/Bangkok'");
  await check("SQL counts marketplace once across source, Telegram and multiple bot units", async () => {
    const rows = (await db.query(aggregateSourceSql(parts(BOT_SOURCES)), ["2026-10-24T09:00:00+07:00", "2026-10-25T09:00:00+07:00"])).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].orders, 1); assert.equal(rows[0].units, 2);
    assert.equal(rows[0].open_units, 0); assert.equal(hourKey(rows[0].hour), "2026-10-24T10");
  });
  await check("SQL excludes unpaid web work and combines paid sibling quantities", async () => {
    const rows = (await db.query(aggregateSourceSql(parts([WEB_SOURCE])), ["2026-10-24T09:00:00+07:00", "2026-10-25T09:00:00+07:00"])).rows;
    assert.equal(rows[0].orders, 1); assert.equal(rows[0].units, 3); assert.equal(rows[0].open_units, 3);
    assert.equal(hourKey(rows[0].hour), "2026-10-24T11");
  });
  await check("final refunded status is excluded and cannot be forecast as successful work", async () => {
    await db.exec("UPDATE itemku_orders SET status='refunded'");
    const rows = (await db.query(aggregateSourceSql(parts(BOT_SOURCES)), ["2026-10-24T09:00:00+07:00", "2026-10-25T09:00:00+07:00"])).rows;
    assert.equal(rows[0].units, 0); assert.equal(rows[0].orders, 0); assert.equal(rows[0].cancelled, 1);
  });
  await check("source identifiers are allowlisted and missing tables are never referenced", () => {
    assert.throws(() => buildSourceQuery({ table: "injected" }, []));
    assert.equal(buildSourceQuery(WEB_SOURCE, []), null);
    const sql = aggregateSourceSql(parts(BOT_SOURCES));
    assert.equal(sql.includes('public."kaleoz_orders"'), false);
    assert.equal(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/.test(sql), false);
    assert.equal(sql.includes("to_jsonb"), false);
    assert.ok(sql.includes('r."paid_at">=($1::timestamptz)'));
    assert.ok(sql.includes('r."paid_at" IS NULL AND r."created_at">='));
  });
  await check("nullable preferred timestamps keep fallback rows and date boundaries", async () => {
    await db.exec(`INSERT INTO itemku_orders VALUES
      ('OD-FALLBACK',1,'new',NULL,'2026-10-24 09:00+07'),
      ('OD-PREFERRED-OLD',9,'new','2026-10-23 23:00+07','2026-10-24 09:00+07'),
      ('OD-UPPER-BOUND',9,'new',NULL,'2026-10-25 09:00+07');`);
    const rows = (await db.query(aggregateSourceSql(parts([BOT_SOURCES.find(s => s.table === "itemku_orders")])),
      ["2026-10-24T09:00:00+07:00", "2026-10-25T09:00:00+07:00"])).rows;
    const fallback = rows.find(r => hourKey(r.hour) === "2026-10-24T09");
    assert.equal(fallback.orders, 1); assert.equal(fallback.units, 1);
    assert.equal(rows.reduce((n, r) => n + r.units, 0), 1);
  });
  await check("legacy bot source NULL still inherits the linked Telegram channel", async () => {
    await db.exec(`INSERT INTO telegram_orders_dev VALUES('PAGE-1','218000','page',NULL,'processing','2026-10-24 08:59+07');
      INSERT INTO codashop_orders VALUES(99,NULL,'transport-reference','PAGE-1','processing',1,'2026-10-24 09:01','{}');`);
    const rows = (await db.query(aggregateSourceSql(parts([BOT_SOURCES.find(s => s.table === "codashop_orders")])),
      ["2026-10-24T08:00:00+07:00", "2026-10-24T09:00:00+07:00"])).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].channel, "page");
    assert.equal(rows[0].units, 1); assert.equal(hourKey(rows[0].hour), "2026-10-24T08");
  });
  await check("Kaleoz Sending status 1003 remains open work, not a cancellation", async () => {
    await db.exec(`CREATE TABLE kaleoz_orders(order_id text,quantity int,status text,created_at timestamptz);
      INSERT INTO kaleoz_orders VALUES('K1',2,'1003','2026-10-24 12:00+07');`);
    const columns = (await db.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_name='kaleoz_orders'")).rows;
    const source = BOT_SOURCES.find(s => s.table === "kaleoz_orders");
    const sql = aggregateSourceSql([buildSourceQuery(source, columns)]);
    const rows = (await db.query(sql, ["2026-10-24T09:00:00+07:00", "2026-10-25T09:00:00+07:00"])).rows;
    assert.equal(rows[0].orders, 1); assert.equal(rows[0].units, 2);
    assert.equal(rows[0].open_units, 2); assert.equal(rows[0].cancelled, 0);
    assert.equal(rows[0].unknown_status, 0);
  });
} finally { await db.close(); }

await check("report keeps channels separate and reports unknown/partial source status", () => {
  const report = buildWorkforceReport({ buckets: history, warnings: ["missing source"], sources: [], fetchedAt: new Date().toISOString() }, { date, now: hourAt(date, 12) });
  assert.equal(report.forecast.length, 24); assert.equal(report.forecastDate, "2026-10-25");
  assert.ok(report.summary.expectedUnits > 0); assert.ok(report.warnings.includes("missing source"));
  const live = buildWorkforceReport({ buckets: [...history, { channel: "itemku", hour: hourAt(date, 9).toISOString(), orders: 4, units: 9 },
    { channel: "itemku", hour: hourAt(date, 10).toISOString(), orders: 2, units: 3 }], warnings: [], sources: [], fetchedAt: "" }, { date, now: hourAt(date, 11) });
  assert.equal(live.summary.orders, 6); assert.equal(live.summary.ordersPerHour, 3); assert.equal(live.summary.peakOrdersPerHour, 4);
  assert.throws(() => buildWorkforceReport({ buckets: [], warnings: [], sources: [] }, { date, channel: "injected" }));
});
await check("page and endpoint both gate access; SQL reads are database-enforced read-only", () => {
  const route = readFileSync(new URL("../src/app/api/workforce/route.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/workforce/page.js", import.meta.url), "utf8");
  const repository = readFileSync(new URL("../src/server/workforce-repository.js", import.meta.url), "utf8");
  assert.ok(route.includes("await requireAdmin(request)")); assert.ok(route.includes('"workforce.access"'));
  assert.ok(page.includes("getSessionUser")); assert.ok(page.includes('"workforce.access"'));
  assert.ok(repository.includes("BEGIN READ ONLY")); assert.ok(repository.includes("statement_timeout"));
  assert.ok(!repository.includes("SELECT *"));
});
console.log(`\n${passed} passed, 0 failed`);
