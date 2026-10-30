import pg from "pg";
import { BOT_SOURCES, WEB_SOURCE, buildSourceQuery, aggregateSourceSql } from "./workforce-sources.js";
let botPool;
let webPool;
export function getWorkforceWebPool() {
  // The tools login database is NOT necessarily the storefront database.
  // Never change or silently reuse PG_* just to load workforce analytics.
  const connectionString = process.env.WORKFORCE_WEB_DATABASE_URL;
  if (!connectionString) return null;
  if (!webPool) {
    webPool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 8000 });
    webPool.on("error", error => console.error("[workforce] web pool", error.code));
  }
  return webPool;
}
function getBotPool() {
  if (!process.env.PROFIT_DATABASE_URL) throw new Error("Bot database is not configured");
  if (!botPool) {
    botPool = new pg.Pool({ connectionString: process.env.PROFIT_DATABASE_URL, max: 2, connectionTimeoutMillis: 8000 });
    botPool.on("error", error => console.error("[workforce] remote pool", error.code));
  }
  return botPool;
}

// READ ONLY is enforced by PostgreSQL, not merely by convention in this file.
export async function readWorkforceSource(pool, definitions, range, { excludeWeb = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout='25000'");
    await client.query("SET LOCAL TIME ZONE 'Asia/Bangkok'");
    const { rows: schema } = await client.query(`SELECT table_name,column_name,data_type
      FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])`, [definitions.map(d => d.table)]);
    const sources = definitions.map(def => {
      const telegramColumns = schema.filter(c => c.table_name === "telegram_orders_dev");
      const telegramAvailable = ["task_request_id", "order_id", "created_at"].every(key => telegramColumns.some(c => c.column_name === key));
      const sql = buildSourceQuery(def, schema.filter(c => c.table_name === def.table), { telegramAvailable, telegramColumns });
      return { table: def.table, sql, available: Boolean(sql) };
    });
    const sql = aggregateSourceSql(sources.filter(s => s.sql).map(s => s.sql), { excludeWeb });
    const rows = sql ? (await client.query(sql, [range.from, range.to])).rows : [];
    await client.query("ROLLBACK");
    return { rows, sources: sources.map(({ table, available }) => ({ table, available })) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

let cached;
let pending;
export async function loadWorkforceData(range) {
  const key = `${range.from}/${range.to.slice(0, 16)}`;
  if (cached?.key === key && Date.now() - cached.at < (cached.data.warnings.length ? 15000 : 60000)) return cached.data;
  if (pending?.key === key) return pending.promise;
  const promise = (async () => {
    const warnings = [];
    let web;
    try {
      const pool = getWorkforceWebPool();
      if (pool) {
        web = await readWorkforceSource(pool, [WEB_SOURCE], range);
        if (!web.sources[0].available) warnings.push("ไม่พบ queue_bot_orders ใน WORKFORCE_WEB_DATABASE_URL: ใช้ข้อมูลเว็บที่ส่งถึงฐานบอทเท่านั้น");
      } else {
        warnings.push("ยังไม่ได้ตั้ง WORKFORCE_WEB_DATABASE_URL: แสดงเว็บเฉพาะงานที่ส่งถึงฐานบอท งาน Human อาจไม่ครบ");
        web = { rows: [], sources: [{ table: WEB_SOURCE.table, available: false }] };
      }
    } catch (error) {
      console.error("[workforce] web source", error.code);
      warnings.push("อ่านฐานเว็บไม่สำเร็จ: จำนวนงาน Human ที่ยังไม่ส่งบอทอาจไม่ครบ");
    }
    let bot;
    try {
      bot = await readWorkforceSource(getBotPool(), BOT_SOURCES, range, { excludeWeb: web?.sources[0].available === true });
      for (const source of bot.sources.filter(s => !s.available)) warnings.push(`ไม่พบแหล่งข้อมูล ${source.table}`);
    } catch (error) {
      console.error("[workforce] bot source", error.code);
      warnings.push("อ่านฐานบอท/Marketplace ไม่สำเร็จ: ข้อมูลช่องทางอื่นไม่ครบ");
    }
    if (!web?.sources.some(s => s.available) && !bot?.sources.some(s => s.available)) {
      throw Object.assign(new Error("ยังอ่านแหล่งข้อมูลคิวไม่ได้ กรุณาตรวจ WORKFORCE_WEB_DATABASE_URL และ PROFIT_DATABASE_URL รวมถึง log [workforce]"), { status: 503 });
    }
    const data = { buckets: [...(web?.rows || []), ...(bot?.rows || [])], warnings,
      sources: [...(web?.sources || []).map(s => ({ ...s, database: "web" })), ...(bot?.sources || []).map(s => ({ ...s, database: "bot" }))],
      fetchedAt: new Date().toISOString() };
    cached = { key, at: Date.now(), data };
    return data;
  })();
  pending = { key, promise };
  try { return await promise; } finally { if (pending?.promise === promise) pending = null; }
}
