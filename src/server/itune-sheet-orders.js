import { hasPermission } from "@/lib/permissions";
import { getReadyPool } from "@/server/itune-entries-repository";
import { createGoogleReader } from "@/server/google-sheets";
import {
  ITUNE_SHEET_SOURCES, costThb, dailyFileDate, daysToRead, extractItunesRows, sheetAmount, sheetDate,
} from "@/lib/itune-sheet-orders";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
// Folder/workbook IDs from auto-balance's configuration; override per server when they move.
const config = () => ({
  russiaFolder: process.env.ITUNE_SHEET_RUSSIA_FOLDER_ID || "1ayIGUVyDXJh7Lwd75qqOharidPi20ejv",
  pageFolder: process.env.ITUNE_SHEET_PAGE_FOLDER_ID || "1HANO9uNU6hssPR9JOF1JSg0PrnhUjXm1",
  inblackmFolder: process.env.ITUNE_SHEET_INBLACKM_FOLDER_ID || "18v0NoazI_Vu6p6vUImYzKmbtb38t-PUr",
  // Marketplace is one workbook per month ("Market Place BOT - Oct 2026"): found by name, plus any listed here.
  marketplaceIds: String(process.env.ITUNE_SHEET_MARKETPLACE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
});
const quote = (value) => `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

const schemas = new WeakMap();
export async function sheetPool(getPool = getReadyPool) {
  const pool = await getPool();
  if (!schemas.has(pool)) schemas.set(pool, (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS projectm_itune_sheet_imports (
      id BIGSERIAL PRIMARY KEY, import_key VARCHAR(320) NOT NULL UNIQUE, source VARCHAR(32) NOT NULL,
      sheet_date DATE NOT NULL, tab VARCHAR(256) NOT NULL, row_number INTEGER NOT NULL, order_id VARCHAR(128) NOT NULL,
      channel VARCHAR(128) NOT NULL, currency VARCHAR(16) NOT NULL, email VARCHAR(320) NOT NULL, entry_id INTEGER NOT NULL,
      used_amount NUMERIC(14,2) NOT NULL, amount_before NUMERIC(14,2) NOT NULL, amount_after NUMERIC(14,2) NOT NULL,
      cost_rate NUMERIC(14,6), cost_thb NUMERIC(14,2), imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query("CREATE INDEX IF NOT EXISTS itune_sheet_imports_entry ON projectm_itune_sheet_imports(entry_id, imported_at DESC)");
    // Append-only: the multiplier in force is the newest row of that currency.
    await pool.query(`CREATE TABLE IF NOT EXISTS projectm_itune_cost_rates (
      id BIGSERIAL PRIMARY KEY, currency VARCHAR(16) NOT NULL, rate NUMERIC(14,6) NOT NULL CHECK (rate > 0),
      effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_by_user_id INTEGER, created_by_username TEXT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS projectm_itune_sheet_sync_status (
      id INTEGER PRIMARY KEY CHECK (id = 1), last_run_at TIMESTAMPTZ, last_success_at TIMESTAMPTZ,
      last_older_scan_at TIMESTAMPTZ, summary JSONB NOT NULL DEFAULT '{}'::jsonb)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS projectm_itune_balance_photos (
      id BIGSERIAL PRIMARY KEY, entry_id INTEGER NOT NULL, entry_email TEXT, image TEXT NOT NULL,
      taken_at TIMESTAMPTZ NOT NULL, system_amount NUMERIC(14,2), currency TEXT,
      created_by_user_id INTEGER, created_by_username TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`ALTER TABLE projectm_itune_balance_photos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS deleted_by_user_id INTEGER, ADD COLUMN IF NOT EXISTS deleted_by_username TEXT`);
    await pool.query(`ALTER TABLE projectm_itune_sheet_imports ADD COLUMN IF NOT EXISTS order_time VARCHAR(32),
      ADD COLUMN IF NOT EXISTS sale_thb NUMERIC(14,2), ADD COLUMN IF NOT EXISTS customer TEXT, ADD COLUMN IF NOT EXISTS link TEXT,
      ADD COLUMN IF NOT EXISTS game TEXT, ADD COLUMN IF NOT EXISTS pack TEXT, ADD COLUMN IF NOT EXISTS player_id TEXT,
      ADD COLUMN IF NOT EXISTS note TEXT, ADD COLUMN IF NOT EXISTS created_by_username TEXT,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by_user_id INTEGER,
      ADD COLUMN IF NOT EXISTS deleted_by_username TEXT`);
    await pool.query(`CREATE TABLE IF NOT EXISTS projectm_itune_sheet_order_edits (
      id BIGSERIAL PRIMARY KEY, import_id BIGINT NOT NULL, entry_id INTEGER NOT NULL, old_amount NUMERIC(14,2) NOT NULL,
      new_amount NUMERIC(14,2) NOT NULL, reason TEXT, edited_by_user_id INTEGER, edited_by_username TEXT,
      edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query("CREATE INDEX IF NOT EXISTS itune_sheet_order_edits_entry ON projectm_itune_sheet_order_edits(entry_id, edited_at DESC)");
    await pool.query("CREATE INDEX IF NOT EXISTS itune_balance_photos_entry ON projectm_itune_balance_photos(entry_id, taken_at DESC)");
  })().catch((err) => { schemas.delete(pool); throw err; }));
  await schemas.get(pool);
  return pool;
}

// Reads every waiting iTunes row of the given Thai calendar days from the four sources.
// A failing source is reported and skipped; the others still import.
export async function readSheetOrders(reader, days, cfg = config()) {
  const wanted = new Set(days); const orders = []; const issues = []; const errors = []; let withoutTime = 0;
  let filled = 0;
  const take = (source, rows, date, tab) => {
    const found = extractItunesRows(source, rows, { sheetDate: date, tab });
    orders.push(...found.orders); issues.push(...found.issues); withoutTime += found.withoutTime;
  };
  // Russia: paste F into the empty E of iTunes rows (as auto-balance does), then reread so K's
  // formula shows the THB sale. Only E is written, only where it is empty.
  const takeRussia = async (file, date) => {
    let rows = await reader.rows(file.id, file.name);
    const fills = extractItunesRows("russia", rows, { sheetDate: date, tab: file.name }).orders.filter((o) => o.fillE);
    if (fills.length && reader.writeRaw) {
      const tab = `'${file.name.replaceAll("'", "''")}'`;
      await reader.writeRaw(file.id, fills.map((o) => ({ range: `${tab}!E${o.row}`, value: o.fillE })));
      filled += fills.length;
      rows = await reader.rows(file.id, file.name);
    }
    take("russia", rows, date, file.name);
  };
  const guarded = async (source, work) => {
    try { await work(); } catch (e) { errors.push({ source, message: String(e.message || e).slice(0, 300) }); }
  };
  for (const [source, folder] of [["russia", cfg.russiaFolder], ["inblackm", cfg.inblackmFolder]]) {
    await guarded(source, async () => {
      for (const file of await reader.listSpreadsheets(`${quote(folder)} in parents`)) {
        const date = dailyFileDate(file.name, ITUNE_SHEET_SOURCES[source].filePrefix);
        if (!date || !wanted.has(date)) continue;
        if (source === "russia") await takeRussia(file, date);
        else take(source, await reader.rows(file.id, file.name), date, file.name);
      }
    });
  }
  const datedTabs = async (source, spreadsheetId) => {
    for (const tab of await reader.tabTitles(spreadsheetId)) {
      const date = sheetDate(tab);
      if (date && wanted.has(date)) take(source, await reader.rows(spreadsheetId, tab), date, tab);
    }
  };
  await guarded("page", async () => {
    const files = await reader.listSpreadsheets(`${quote(cfg.pageFolder)} in parents and name = '0.3 ORDER PAGE'`);
    if (files.length !== 1) throw new Error(`พบไฟล์ 0.3 ORDER PAGE ${files.length} ไฟล์ (ต้องมี 1)`);
    await datedTabs("page", files[0].id);
  });
  await guarded("marketplace", async () => {
    const ids = new Set(cfg.marketplaceIds);
    for (const file of await reader.listSpreadsheets("name contains 'Market Place BOT - '")) ids.add(file.id);
    for (const id of ids) await datedTabs("marketplace", id);
  });
  return { orders, issues, errors, withoutTime, filled };
}

function amountText(value) { return Number(value).toFixed(2); }
const DETAIL_COLUMNS = ["sale_thb", "customer", "link", "game", "pack", "player_id"];
const detailValues = (d = {}) => [d.saleThb ?? null, d.customer || null, d.link || null, d.game || null, d.pack || null, d.playerId || null];

// Deducts the order from the locked entry and records it; shared by the sheet import and manual adds.
async function recordUsage(client, entry, order, logLabel) {
  // The multiplier in force when the order is moved in; later changes do not touch it.
  const rate = (await client.query(`SELECT rate::text FROM projectm_itune_cost_rates WHERE currency=$1
    ORDER BY effective_at DESC, id DESC LIMIT 1`, [order.currency])).rows[0]?.rate ?? null;
  const before = Number(entry.amount); const after = Math.round((before - Number(order.amount)) * 100) / 100;
  await client.query("UPDATE projectm_itune_entries SET amount=$1, updated_at=NOW() WHERE id=$2", [after, entry.id]);
  const { rows } = await client.query(`INSERT INTO projectm_itune_sheet_imports (import_key, source, sheet_date, tab, row_number, order_id,
    channel, currency, email, entry_id, used_amount, amount_before, amount_after, cost_rate, cost_thb, order_time,
    ${DETAIL_COLUMNS.join(", ")}, note, created_by_username)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING id`,
  [order.key, order.source, order.sheetDate, order.tab.slice(0, 256), order.row, order.orderId.slice(0, 128),
    order.channel.slice(0, 128), order.currency, order.email, entry.id, order.amount, amountText(before), amountText(after),
    rate, costThb(order.amount, rate), order.time ?? null, ...detailValues(order.details), order.note || null, order.createdBy || null]);
  await client.query(`INSERT INTO projectm_itune_amount_log (entry_id, entry_email, old_amount, new_amount, changed_by_username)
    VALUES ($1,$2,$3,$4,$5)`, [entry.id, entry.email, before, after, `${logLabel} · ${order.orderId}`.slice(0, 200)]);
  return { id: String(rows[0].id), after };
}

// One transaction per order: the import row is the dedupe guard, so a retried pass never deducts twice.
// A row seen again only refreshes its sale/game/customer fields (rows moved before those were read).
export async function importSheetOrder(client, order) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`itune-sheet:${order.key}`]);
    if ((await client.query("SELECT 1 FROM projectm_itune_sheet_imports WHERE import_key=$1", [order.key])).rows.length) {
      const param = (c, i) => `$${i + 2}::${c === "sale_thb" ? "numeric" : "text"}`;
      await client.query(`UPDATE projectm_itune_sheet_imports SET ${DETAIL_COLUMNS.map((c, i) => `${c}=COALESCE(${param(c, i)},${c})`).join(", ")}
        WHERE import_key=$1 AND deleted_at IS NULL
          AND (${DETAIL_COLUMNS.map((c, i) => `(${param(c, i)} IS NOT NULL AND ${param(c, i)} IS DISTINCT FROM ${c})`).join(" OR ")})`,
      [order.key, ...detailValues(order.details)]);
      await client.query("COMMIT"); return { status: "already" };
    }
    const entries = (await client.query(`SELECT id, email, currency, amount FROM projectm_itune_entries
      WHERE lower(btrim(email)) = $1 ORDER BY id FOR UPDATE`, [order.email])).rows;
    if (!entries.length) { await client.query("ROLLBACK"); return { status: "no_email" }; }
    if (entries.length > 1) { await client.query("ROLLBACK"); return { status: "duplicate_email" }; }
    const entry = entries[0];
    if (String(entry.currency || "").trim().toUpperCase() !== order.currency) {
      await client.query("ROLLBACK"); return { status: "currency_mismatch", entryCurrency: entry.currency || "" };
    }
    const { after } = await recordUsage(client, entry, order, `ชีท ${ITUNE_SHEET_SOURCES[order.source].label}`);
    await client.query("COMMIT");
    return { status: "imported", entryId: entry.id, negative: after < 0 };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
}

const OLDER_SCAN_MS = 30 * 60_000;
export function thaiToday(now = new Date()) { return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }); }

export function createItuneSheetSync({ reader = createGoogleReader(), getPool = getReadyPool, now = () => new Date(), cfg } = {}) {
  return {
    async run() {
      const pool = await sheetPool(getPool);
      const started = now();
      const status = (await pool.query("SELECT last_older_scan_at FROM projectm_itune_sheet_sync_status WHERE id=1")).rows[0];
      const includeOlder = !status?.last_older_scan_at || started - new Date(status.last_older_scan_at) >= OLDER_SCAN_MS;
      const days = daysToRead(thaiToday(started), { includeOlder });
      const { orders, issues, errors, withoutTime, filled } = await readSheetOrders(reader, days, cfg);
      const counts = { imported: 0, already: 0, no_email: 0, duplicate_email: 0, currency_mismatch: 0 };
      const waiting = []; const negative = [];
      const client = await pool.connect();
      try {
        for (const order of orders) {
          const result = await importSheetOrder(client, order);
          counts[result.status]++;
          if (result.status !== "imported" && result.status !== "already") {
            waiting.push({ source: order.source, sheetDate: order.sheetDate, orderId: order.orderId, email: order.email,
              currency: order.currency, amount: order.amount, reason: result.status, entryCurrency: result.entryCurrency });
          }
          if (result.negative) negative.push({ email: order.email, orderId: order.orderId });
        }
      } finally { client.release(); }
      const summary = { days, includeOlder, found: orders.length, withoutTime, russiaFilled: filled, counts, waiting: waiting.slice(0, 200),
        issues: issues.slice(0, 200).map(({ source, sheetDate: d, tab, row, orderId, email, reason }) => ({ source, sheetDate: d, tab, row, orderId, email, reason })),
        errors, negative: negative.slice(0, 50) };
      await pool.query(`INSERT INTO projectm_itune_sheet_sync_status (id, last_run_at, last_success_at, last_older_scan_at, summary)
        VALUES (1, $1::timestamptz, CASE WHEN $2::boolean THEN $1::timestamptz END, CASE WHEN $3::boolean THEN $1::timestamptz END, $4::jsonb)
        ON CONFLICT (id) DO UPDATE SET last_run_at=EXCLUDED.last_run_at,
          last_success_at=COALESCE(EXCLUDED.last_success_at, projectm_itune_sheet_sync_status.last_success_at),
          last_older_scan_at=COALESCE(EXCLUDED.last_older_scan_at, projectm_itune_sheet_sync_status.last_older_scan_at),
          summary=EXCLUDED.summary`, [started.toISOString(), errors.length === 0, includeOlder && errors.length === 0, JSON.stringify(summary)]);
      return summary;
    },
  };
}

// ---- Admin reads/writes (cost multipliers, import history, balance photos) ----

const RATE = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,6})?$/;
const CURRENCY = /^[A-Z]{2,8}$/;
const actorName = (actor) => actor?.displayName || actor?.username || null;

export async function getSheetOverview(getPool = getReadyPool) {
  const pool = await sheetPool(getPool);
  const [rates, history, status, recent] = await Promise.all([
    pool.query(`SELECT DISTINCT ON (currency) currency, rate::text, effective_at, created_by_username
      FROM projectm_itune_cost_rates ORDER BY currency, effective_at DESC, id DESC`),
    pool.query(`SELECT id, currency, rate::text, effective_at, created_by_username FROM projectm_itune_cost_rates
      ORDER BY effective_at DESC, id DESC LIMIT 50`),
    pool.query("SELECT last_run_at, last_success_at, last_older_scan_at, summary FROM projectm_itune_sheet_sync_status WHERE id=1"),
    pool.query(`SELECT ${ORDER_COLUMNS} FROM projectm_itune_sheet_imports ORDER BY imported_at DESC, id DESC LIMIT 200`),
  ]);
  return { rates: rates.rows, rateHistory: history.rows, status: status.rows[0] || null, imports: recent.rows };
}

export async function setCostRate({ currency, rate }, actor, getPool = getReadyPool) {
  const code = String(currency ?? "").trim().toUpperCase(); const value = String(rate ?? "").trim();
  if (!CURRENCY.test(code)) fail("สกุลเงินไม่ถูกต้อง");
  if (!RATE.test(value) || Number(value) <= 0) fail("ตัวคูณต้นทุนต้องเป็นตัวเลขมากกว่า 0 (ทศนิยมไม่เกิน 6 ตำแหน่ง)");
  const pool = await sheetPool(getPool);
  const { rows } = await pool.query(`INSERT INTO projectm_itune_cost_rates (currency, rate, created_by_user_id, created_by_username)
    VALUES ($1,$2,$3,$4) RETURNING id, currency, rate::text, effective_at`, [code, value, actor?.id ?? null, actorName(actor)]);
  return rows[0];
}

const photoKey = (value) => { const id = String(value ?? ""); if (!/^[1-9]\d{0,17}$/.test(id)) fail("ไม่พบรูป", 404); return id; };
const entryKey = (value) => { const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) fail("ไม่พบเมลนี้", 404); return id; };

// Admins see every email; a topup user only the emails they currently hold.
export async function assertEntryAccess(pool, entryId, actor) {
  const id = entryKey(entryId);
  if (hasPermission(actor, "projectm.admin")) return id;
  if (!hasPermission(actor, "projectm.claim")) fail("บัญชีนี้ไม่มีสิทธิ์ใช้งานหน้า Topup", 403);
  const { rows } = await pool.query("SELECT 1 FROM projectm_itune_entries WHERE id=$1 AND claimed_by_user_id=$2", [id, actor?.id ?? null]);
  if (!rows.length) fail("ดูได้เฉพาะเมลที่คุณถืออยู่", 403);
  return id;
}

const ORDER_COLUMNS = `id, source, sheet_date::text AS sheet_date, order_time, order_id, channel, currency, email, entry_id,
  used_amount::text, amount_before::text, amount_after::text, cost_rate::text, cost_thb::text, sale_thb::text,
  customer, link, game, pack, player_id, note, created_by_username, imported_at, deleted_at, deleted_by_username`;

export async function entrySheetOrders(entryId, actor, getPool = getReadyPool) {
  const pool = await sheetPool(getPool);
  const id = await assertEntryAccess(pool, entryId, actor);
  const { rows } = await pool.query(`SELECT ${ORDER_COLUMNS} FROM projectm_itune_sheet_imports
    WHERE entry_id=$1 ORDER BY imported_at DESC, id DESC LIMIT 300`, [id]);
  const edits = (await pool.query(`SELECT e.id, e.import_id, i.order_id, e.old_amount::text, e.new_amount::text, e.reason,
    e.edited_by_username, e.edited_at FROM projectm_itune_sheet_order_edits e JOIN projectm_itune_sheet_imports i ON i.id = e.import_id
    WHERE e.entry_id=$1 ORDER BY e.edited_at DESC, e.id DESC LIMIT 200`, [id])).rows;
  return { orders: rows.filter((r) => !r.deleted_at), deleted: rows.filter((r) => r.deleted_at), edits };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const field = (value, max) => String(value ?? "").trim().slice(0, max);

// Staff add an order by hand (no sheet row): same deduction, cost and history as a sheet import.
export async function addManualOrder(body, actor, getPool = getReadyPool) {
  if (!UUID.test(String(body?.requestId || ""))) fail("รหัสคำขอไม่ถูกต้อง กรุณาโหลดหน้าใหม่");
  const orderId = field(body.orderId, 128); const amount = sheetAmount(body.usedAmount);
  const at = new Date(body.orderAt);
  if (!orderId) fail("ระบุเลขออเดอร์");
  if (!amount || !/^\d+(\.\d{1,2})?$/.test(String(body.usedAmount).trim())) fail("ยอดออกต้องเป็นตัวเลขมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง");
  const saleText = String(body.saleThb ?? "").trim();
  const saleThb = saleText ? sheetAmount(saleText) : null;
  if (saleText && !saleThb) fail("ยอดโอนต้องเป็นตัวเลข");
  if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 5 * 60_000) fail("วันที่และเวลาไม่ถูกต้อง");
  const pool = await sheetPool(getPool);
  const entryId = await assertEntryAccess(pool, body.entryId, actor);
  const key = `manual|${body.requestId.toLowerCase()}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const existing = (await client.query("SELECT id FROM projectm_itune_sheet_imports WHERE import_key=$1", [key])).rows[0];
    if (existing) { await client.query("ROLLBACK"); return { id: String(existing.id) }; } // retried submit
    const entry = (await client.query("SELECT id, email, currency, amount FROM projectm_itune_entries WHERE id=$1 FOR UPDATE", [entryId])).rows[0];
    if (!entry) fail("ไม่พบเมลนี้ (อาจถูกลบไปแล้ว)", 404);
    const thai = (opts) => at.toLocaleString("sv-SE", { timeZone: "Asia/Bangkok", ...opts });
    const result = await recordUsage(client, entry, {
      key, source: "manual", sheetDate: thai({ year: "numeric", month: "2-digit", day: "2-digit" }), tab: "เพิ่มเอง", row: 0,
      orderId, channel: "เพิ่มเอง", currency: String(entry.currency || "").trim().toUpperCase().slice(0, 16) || "-",
      email: String(entry.email || "").trim().toLowerCase(), amount, time: thai({ hour: "2-digit", minute: "2-digit" }),
      details: { saleThb, customer: field(body.customer, 200), link: field(body.link, 500), game: field(body.game, 200),
        pack: field(body.pack, 300), playerId: field(body.playerId, 200) },
      note: field(body.note, 500), createdBy: actorName(actor),
    }, `เพิ่มเองโดย ${actorName(actor) || "-"}`);
    await client.query("COMMIT");
    return { id: result.id };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
  finally { client.release(); }
}

// Emergency correction of an order's amount out: the email moves by the difference, the cost is
// recomputed with the multiplier locked on that order, and every change is kept as edit history.
export async function updateSheetOrderAmount(orderId, { usedAmount, reason }, actor, getPool = getReadyPool) {
  const id = String(orderId ?? "");
  if (!/^[1-9]\d{0,17}$/.test(id)) fail("ไม่พบออเดอร์", 404);
  const amount = sheetAmount(usedAmount);
  if (!amount || !/^\d+(\.\d{1,2})?$/.test(String(usedAmount ?? "").trim())) fail("ยอดออกต้องเป็นตัวเลขมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง");
  const pool = await sheetPool(getPool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const order = (await client.query(`SELECT entry_id, order_id, used_amount::text, amount_before::text, cost_rate::text, deleted_at
      FROM projectm_itune_sheet_imports WHERE id=$1 FOR UPDATE`, [id])).rows[0];
    if (!order) fail("ไม่พบออเดอร์", 404);
    await assertEntryAccess(client, order.entry_id, actor);
    if (order.deleted_at) fail("ออเดอร์นี้ถูกลบไปแล้ว", 409);
    if (Number(order.used_amount) === Number(amount)) fail("ยอดออกเท่าเดิม");
    const cents = (v) => Math.round(Number(v) * 100);
    const delta = cents(amount) - cents(order.used_amount);
    const entry = (await client.query("SELECT id, email, amount FROM projectm_itune_entries WHERE id=$1 FOR UPDATE", [order.entry_id])).rows[0];
    if (entry) {
      const before = Number(entry.amount); const after = (cents(before) - delta) / 100;
      await client.query("UPDATE projectm_itune_entries SET amount=$1, updated_at=NOW() WHERE id=$2", [after, entry.id]);
      await client.query(`INSERT INTO projectm_itune_amount_log (entry_id, entry_email, old_amount, new_amount, changed_by_user_id, changed_by_username)
        VALUES ($1,$2,$3,$4,$5,$6)`, [entry.id, entry.email, before, after, actor?.id ?? null,
        `แก้ยอดออก ${order.order_id} ${order.used_amount}→${amount} · ${actorName(actor) || "-"}`.slice(0, 200)]);
    }
    await client.query(`UPDATE projectm_itune_sheet_imports SET used_amount=$2, cost_thb=$3,
      amount_after=amount_before - $2::numeric WHERE id=$1`, [id, amount, costThb(amount, order.cost_rate)]);
    await client.query(`INSERT INTO projectm_itune_sheet_order_edits (import_id, entry_id, old_amount, new_amount, reason, edited_by_user_id, edited_by_username)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, order.entry_id, order.used_amount, amount, field(reason, 500) || null, actor?.id ?? null, actorName(actor)]);
    await client.query("COMMIT");
    return { usedAmount: amount };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
  finally { client.release(); }
}

// Deleting gives the amount back to the email. The row stays (marked deleted) as history and so the
// sheet row is never moved in again.
export async function deleteSheetOrder(orderId, actor, getPool = getReadyPool) {
  const id = String(orderId ?? "");
  if (!/^[1-9]\d{0,17}$/.test(id)) fail("ไม่พบออเดอร์", 404);
  const pool = await sheetPool(getPool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const order = (await client.query("SELECT entry_id, order_id, used_amount, deleted_at FROM projectm_itune_sheet_imports WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!order) fail("ไม่พบออเดอร์", 404);
    await assertEntryAccess(client, order.entry_id, actor);
    if (order.deleted_at) fail("ออเดอร์นี้ถูกลบไปแล้ว", 409);
    const entry = (await client.query("SELECT id, email, amount FROM projectm_itune_entries WHERE id=$1 FOR UPDATE", [order.entry_id])).rows[0];
    if (entry) {
      const before = Number(entry.amount); const after = Math.round((before + Number(order.used_amount)) * 100) / 100;
      await client.query("UPDATE projectm_itune_entries SET amount=$1, updated_at=NOW() WHERE id=$2", [after, entry.id]);
      await client.query(`INSERT INTO projectm_itune_amount_log (entry_id, entry_email, old_amount, new_amount, changed_by_user_id, changed_by_username)
        VALUES ($1,$2,$3,$4,$5,$6)`, [entry.id, entry.email, before, after, actor?.id ?? null,
        `ลบออเดอร์ ${order.order_id} คืนยอด · ${actorName(actor) || "-"}`.slice(0, 200)]);
    }
    await client.query(`UPDATE projectm_itune_sheet_imports SET deleted_at=NOW(), deleted_by_user_id=$2, deleted_by_username=$3 WHERE id=$1`,
      [id, actor?.id ?? null, actorName(actor)]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
  finally { client.release(); }
}

const IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
export async function addBalancePhoto({ entryId, image, takenAt }, actor, getPool = getReadyPool) {
  const when = new Date(takenAt);
  if (typeof image !== "string" || !IMAGE.test(image) || image.length > 6 * 1024 * 1024) fail("แนบรูป (PNG/JPG/WebP ไม่เกิน 4MB)");
  if (!Number.isFinite(when.getTime()) || when.getTime() > Date.now() + 5 * 60_000) fail("วันที่และเวลาไม่ถูกต้อง");
  const pool = await sheetPool(getPool);
  const id = await assertEntryAccess(pool, entryId, actor);
  // The balance shown on the site at save time sits beside the photo for the check.
  const { rows } = await pool.query(`INSERT INTO projectm_itune_balance_photos
    (entry_id, entry_email, image, taken_at, system_amount, currency, created_by_user_id, created_by_username)
    SELECT e.id, e.email, $2, $3, e.amount, e.currency, $4, $5 FROM projectm_itune_entries e WHERE e.id=$1
    RETURNING id`, [id, image, when.toISOString(), actor?.id ?? null, actorName(actor)]);
  if (!rows.length) fail("ไม่พบเมลนี้ (อาจถูกลบไปแล้ว)", 404);
  return { id: String(rows[0].id) };
}

// Deleted photos stay as history (who deleted, when); only the active list hides them.
export async function listBalancePhotos(entryId, actor, getPool = getReadyPool) {
  const pool = await sheetPool(getPool);
  const id = await assertEntryAccess(pool, entryId, actor);
  const { rows } = await pool.query(`SELECT id::text, entry_id, entry_email, taken_at, system_amount::text, currency,
    created_by_username, created_at, deleted_at, deleted_by_username
    FROM projectm_itune_balance_photos WHERE entry_id=$1 ORDER BY taken_at DESC, id DESC LIMIT 300`, [id]);
  return { photos: rows.filter((r) => !r.deleted_at), deleted: rows.filter((r) => r.deleted_at) };
}

async function photoEntry(pool, photoId) {
  const { rows } = await pool.query("SELECT entry_id, image, deleted_at FROM projectm_itune_balance_photos WHERE id=$1", [photoKey(photoId)]);
  if (!rows.length) fail("ไม่พบรูป", 404);
  return rows[0];
}

export async function balancePhotoImage(photoId, actor, getPool = getReadyPool) {
  const pool = await sheetPool(getPool);
  const photo = await photoEntry(pool, photoId);
  await assertEntryAccess(pool, photo.entry_id, actor);
  return photo.image;
}

export async function deleteBalancePhoto(photoId, actor, getPool = getReadyPool) {
  const pool = await sheetPool(getPool);
  const photo = await photoEntry(pool, photoId);
  await assertEntryAccess(pool, photo.entry_id, actor);
  const { rowCount } = await pool.query(`UPDATE projectm_itune_balance_photos SET deleted_at=NOW(), deleted_by_user_id=$2,
    deleted_by_username=$3 WHERE id=$1 AND deleted_at IS NULL`, [photoKey(photoId), actor?.id ?? null, actorName(actor)]);
  if (!rowCount) fail("รูปนี้ถูกลบไปแล้ว", 409);
}
