import { getPool } from "@/lib/db";
import {
  normalizeStockCode,
  normalizeStockMoney,
  STOCK_ACCOUNT_PLATFORMS,
  STOCK_ACCOUNT_STATUSES,
  STOCK_DEFAULT_LOW_AT,
  stockPackNameParts,
  stockTone,
  validateStockMove,
  stockMargin,
  normalizeStockWebPackageIds,
  STOCK_WEB_PACKAGES_MAX,
} from "@/lib/stock";
import { stockOrderPackKey } from "@/lib/stock-pending-orders";

// Stock accounts, their packs, and every move in or out (src/lib/stock.js).
// game_id points at a GameInfo game, which lives in another database, so it
// is a plain number checked where it matters, not a foreign key.
let schemaReady;

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function ensureStockSchema() {
  return ensureSchema();
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const client = await getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_accounts (
          id          SERIAL PRIMARY KEY,
          code        VARCHAR(32) NOT NULL UNIQUE,
          game_id     INTEGER,
          game_name   VARCHAR(255) NOT NULL DEFAULT '',
          data_mode   VARCHAR(16) NOT NULL DEFAULT 'uid' CHECK (data_mode IN ('uid', 'idpass')),
          status      VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'check', 'closed')),
          note        TEXT NOT NULL DEFAULT '',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_items (
          id          SERIAL PRIMARY KEY,
          account_id  INTEGER NOT NULL REFERENCES stock_accounts(id) ON DELETE CASCADE,
          label       VARCHAR(120) NOT NULL,
          unit_usd    NUMERIC(12, 2),
          low_at      INTEGER NOT NULL DEFAULT ${STOCK_DEFAULT_LOW_AT},
          pack_name   VARCHAR(255) NOT NULL DEFAULT '',
          sort_order  INTEGER NOT NULL DEFAULT 0,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (account_id, label)
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_moves (
          id          BIGSERIAL PRIMARY KEY,
          account_id  INTEGER NOT NULL REFERENCES stock_accounts(id) ON DELETE CASCADE,
          kind        VARCHAR(8) NOT NULL CHECK (kind IN ('in', 'out', 'adjust')),
          queue       VARCHAR(64) NOT NULL DEFAULT '',
          note        TEXT NOT NULL DEFAULT '',
          sell_price  NUMERIC(14, 2),
          actor_id    INTEGER,
          actor_name  VARCHAR(255) NOT NULL DEFAULT '',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS stock_moves_account_idx ON stock_moves (account_id, created_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS stock_moves_queue_idx ON stock_moves (queue) WHERE queue <> ''`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_move_lines (
          id          BIGSERIAL PRIMARY KEY,
          move_id     BIGINT NOT NULL REFERENCES stock_moves(id) ON DELETE CASCADE,
          item_id     INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
          qty         INTEGER NOT NULL CHECK (qty <> 0),
          unit_cost   NUMERIC(14, 2)
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS stock_move_lines_item_idx ON stock_move_lines (item_id)`);
      // Auto cut (src/server/stock-auto-cut.js): an account opts in, and only
      // orders made after auto_cut_since are cut. A cut the system made waits
      // as 'awaiting' (already off the balance) until a person confirms it.
      await client.query(`ALTER TABLE stock_accounts ADD COLUMN IF NOT EXISTS auto_cut BOOLEAN NOT NULL DEFAULT FALSE`);
      await client.query(`ALTER TABLE stock_accounts ADD COLUMN IF NOT EXISTS auto_cut_since TIMESTAMPTZ`);
      // Whether this account's empty packs go grey on the main site (off: the site is left alone).
      await client.query(`ALTER TABLE stock_accounts ADD COLUMN IF NOT EXISTS web_sold_out BOOLEAN NOT NULL DEFAULT FALSE`);
      // The store this account's stock is for, so an order for the other store is not cut from it.
      await client.query(`ALTER TABLE stock_accounts ADD COLUMN IF NOT EXISTS platform VARCHAR(16) NOT NULL DEFAULT ''`);
      // When a pack's low-stock alert went out (src/server/stock-low-alert.js); cleared once it is back up.
      await client.query(`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS low_alert_at TIMESTAMPTZ`);
      // The main site's packages this pack fills, picked by a person; ids, so a rename cannot break it.
      await client.query(`ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS web_package_ids INTEGER[] NOT NULL DEFAULT '{}'`);
      // The main switch over every account's main-site switch: no row means off.
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_web_sync (
          id          BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
          enabled     BOOLEAN NOT NULL DEFAULT FALSE,
          updated_by  VARCHAR(255) NOT NULL DEFAULT '',
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS confirm_state VARCHAR(16) NOT NULL DEFAULT 'confirmed'`);
      await client.query(`ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS order_pack VARCHAR(200) NOT NULL DEFAULT ''`);
      await client.query(`ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS confirmed_by VARCHAR(255) NOT NULL DEFAULT ''`);
      await client.query(`ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ`);
      await client.query(`CREATE INDEX IF NOT EXISTS stock_moves_awaiting_idx ON stock_moves (created_at) WHERE confirm_state = 'awaiting'`);
      // Which stock pack an order's pack text was cut from, learned from each
      // cut a person makes or confirms, so the next order with the same text is matched.
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_pack_aliases (
          account_id  INTEGER NOT NULL REFERENCES stock_accounts(id) ON DELETE CASCADE,
          pack_key    VARCHAR(200) NOT NULL,
          item_id     INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
          uses        INTEGER NOT NULL DEFAULT 1,
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (account_id, pack_key)
        )
      `);
    } finally {
      client.release();
    }
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });
  return schemaReady;
}

const number = (value) => (value == null ? null : Number(value));

function mapAccount(row) {
  return {
    id: row.id,
    code: row.code,
    gameId: row.game_id,
    gameName: row.game_name,
    dataMode: row.data_mode,
    platform: row.platform || "",
    status: row.status,
    note: row.note,
    autoCut: row.auto_cut === true,
    autoCutSince: row.auto_cut_since ?? null,
    webSoldOut: row.web_sold_out === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Each pack with its totals; avgCost is the THB cost per unit over the
// receipts that state one, which an out move takes as its cost.
const ITEM_COLUMNS = `
  i.id, i.account_id, i.label, i.unit_usd, i.low_at, i.pack_name, i.sort_order, i.low_alert_at, i.web_package_ids,
         COALESCE(SUM(l.qty) FILTER (WHERE m.kind = 'in'), 0) AS received,
         COALESCE(-SUM(l.qty) FILTER (WHERE m.kind = 'out'), 0) AS used,
         COALESCE(SUM(l.qty) FILTER (WHERE m.kind = 'adjust'), 0) AS adjusted,
         SUM(l.qty * l.unit_cost) FILTER (WHERE m.kind = 'in' AND l.unit_cost IS NOT NULL)
           / NULLIF(SUM(l.qty) FILTER (WHERE m.kind = 'in' AND l.unit_cost IS NOT NULL), 0) AS avg_cost`;
const ITEM_JOINS = `
    LEFT JOIN stock_move_lines l ON l.item_id = i.id
    LEFT JOIN stock_moves m ON m.id = l.move_id`;
const ITEMS_SQL = `SELECT ${ITEM_COLUMNS} FROM stock_items i ${ITEM_JOINS}`;

function mapItem(row) {
  const received = Number(row.received);
  const used = Number(row.used);
  const adjusted = Number(row.adjusted);
  const left = received - used + adjusted;
  return {
    id: row.id,
    accountId: row.account_id,
    label: row.label,
    unitUsd: number(row.unit_usd),
    lowAt: row.low_at,
    lowAlertAt: row.low_alert_at ?? null,
    packName: row.pack_name,
    webPackageIds: row.web_package_ids || [],
    sortOrder: row.sort_order,
    received,
    used,
    adjusted,
    left,
    avgCost: row.avg_cost == null ? null : Math.round(Number(row.avg_cost) * 100) / 100,
    tone: stockTone(left, row.low_at),
  };
}

function withTotals(account, items) {
  const valueUsd = items.reduce((sum, item) => sum + (item.unitUsd ?? 0) * Math.max(item.left, 0), 0);
  return {
    ...account,
    items,
    leftTotal: items.reduce((sum, item) => sum + Math.max(item.left, 0), 0),
    valueUsd: Math.round(valueUsd * 100) / 100,
    lowCount: items.filter((item) => item.tone === "low").length,
    emptyCount: items.filter((item) => item.tone === "empty").length,
  };
}

async function itemsFor(client, accountIds) {
  if (!accountIds.length) return new Map();
  const result = await client.query(
    `${ITEMS_SQL} WHERE i.account_id = ANY($1::int[]) GROUP BY i.id ORDER BY i.sort_order, i.id`,
    [accountIds]
  );
  const byAccount = new Map(accountIds.map((id) => [id, []]));
  for (const row of result.rows) byAccount.get(row.account_id)?.push(mapItem(row));
  return byAccount;
}

/** Every account with its packs and totals, open ones first. */
export async function listStockAccounts() {
  await ensureSchema();
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM stock_accounts ORDER BY (status = 'closed'), code`
  );
  const accounts = result.rows.map(mapAccount);
  const items = await itemsFor(pool, accounts.map((account) => account.id));
  return accounts.map((account) => withTotals(account, items.get(account.id) || []));
}

export async function getStockAccount(code) {
  await ensureSchema();
  const pool = getPool();
  const result = await pool.query(`SELECT * FROM stock_accounts WHERE code = $1`, [normalizeStockCode(code)]);
  if (!result.rows[0]) return null;
  const account = mapAccount(result.rows[0]);
  const items = await itemsFor(pool, [account.id]);
  return withTotals(account, items.get(account.id) || []);
}

function accountFields(input, { partial = false } = {}) {
  const fields = {};
  if (!partial || input.code !== undefined) {
    const code = normalizeStockCode(input.code);
    if (!code) throw createHttpError("ไอดีใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 2–32 ตัว", 400);
    fields.code = code;
  }
  if (input.gameId !== undefined) {
    const gameId = input.gameId === null || input.gameId === "" ? null : Number(input.gameId);
    if (gameId !== null && (!Number.isInteger(gameId) || gameId <= 0)) throw createHttpError("เกมไม่ถูกต้อง", 400);
    fields.game_id = gameId;
  }
  if (input.gameName !== undefined) fields.game_name = String(input.gameName || "").trim().slice(0, 255);
  if (input.dataMode !== undefined) fields.data_mode = input.dataMode === "idpass" ? "idpass" : "uid";
  if (input.platform !== undefined) {
    if (!Object.hasOwn(STOCK_ACCOUNT_PLATFORMS, input.platform)) throw createHttpError("แพลตฟอร์มไม่ถูกต้อง", 400);
    fields.platform = input.platform;
  }
  if (input.status !== undefined) {
    if (!STOCK_ACCOUNT_STATUSES.includes(input.status)) throw createHttpError("สถานะไม่ถูกต้อง", 400);
    fields.status = input.status;
  }
  if (input.note !== undefined) fields.note = String(input.note || "").trim().slice(0, 1000);
  if (input.autoCut !== undefined) fields.auto_cut = input.autoCut === true;
  if (input.webSoldOut !== undefined) fields.web_sold_out = input.webSoldOut === true;
  return fields;
}

export async function createStockAccount(input) {
  await ensureSchema();
  const fields = accountFields(input);
  const keys = Object.keys(fields);
  try {
    const result = await getPool().query(
      `INSERT INTO stock_accounts (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
      keys.map((key) => fields[key])
    );
    return withTotals(mapAccount(result.rows[0]), []);
  } catch (error) {
    if (error.code === "23505") throw createHttpError(`มีไอดี "${fields.code}" อยู่แล้ว`, 409);
    throw error;
  }
}

export async function updateStockAccount(id, input) {
  await ensureSchema();
  const fields = accountFields(input, { partial: true });
  const keys = Object.keys(fields);
  if (!keys.length) throw createHttpError("ไม่มีอะไรให้แก้", 400);
  try {
    // Turning auto cut on starts its clock now, so orders from before are never cut by it.
    const since = fields.auto_cut === true ? ", auto_cut_since = CASE WHEN auto_cut THEN auto_cut_since ELSE NOW() END" : "";
    const result = await getPool().query(
      `UPDATE stock_accounts SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(", ")}, updated_at = NOW()${since}
        WHERE id = $1 RETURNING code`,
      [Number(id), ...keys.map((key) => fields[key])]
    );
    if (!result.rows[0]) throw createHttpError("ไม่พบไอดีนี้", 404);
    return getStockAccount(result.rows[0].code);
  } catch (error) {
    if (error.code === "23505") throw createHttpError(`มีไอดี "${fields.code}" อยู่แล้ว`, 409);
    throw error;
  }
}

function itemFields(input, { partial = false } = {}) {
  const fields = {};
  if (!partial || input.label !== undefined) {
    const label = String(input.label ?? "").trim().slice(0, 120);
    if (!label) throw createHttpError("ใส่ชื่อแพ็ค", 400);
    fields.label = label;
  }
  if (input.unitUsd !== undefined) {
    const usd = normalizeStockMoney(input.unitUsd);
    fields.unit_usd = usd === "" ? null : Number(usd);
  }
  if (input.lowAt !== undefined) {
    const lowAt = Number(input.lowAt);
    if (!Number.isInteger(lowAt) || lowAt < 0 || lowAt > 100000) throw createHttpError("เกณฑ์แจ้งเตือนต้องเป็นจำนวนเต็ม 0 ขึ้นไป", 400);
    fields.low_at = lowAt;
  }
  if (input.packName !== undefined) fields.pack_name = String(input.packName || "").trim().slice(0, 255);
  if (input.webPackageIds !== undefined) {
    const ids = normalizeStockWebPackageIds(input.webPackageIds);
    if (ids.length > STOCK_WEB_PACKAGES_MAX) throw createHttpError(`ผูกแพ็คบนเว็บได้ไม่เกิน ${STOCK_WEB_PACKAGES_MAX} แพ็ค`, 400);
    fields.web_package_ids = ids;
  }
  if (input.sortOrder !== undefined) fields.sort_order = Number(input.sortOrder) || 0;
  return fields;
}

export async function addStockItem(accountId, input) {
  await ensureSchema();
  const fields = itemFields(input);
  if (fields.sort_order === undefined) {
    const max = await getPool().query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM stock_items WHERE account_id = $1`, [Number(accountId)]);
    fields.sort_order = Number(max.rows[0].next);
  }
  const keys = Object.keys(fields);
  try {
    const result = await getPool().query(
      `INSERT INTO stock_items (account_id, ${keys.join(", ")}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING id`,
      [Number(accountId), ...keys.map((key) => fields[key])]
    );
    return result.rows[0].id;
  } catch (error) {
    if (error.code === "23505") throw createHttpError(`มีแพ็ค "${fields.label}" ในไอดีนี้แล้ว`, 409);
    if (error.code === "23503") throw createHttpError("ไม่พบไอดีนี้", 404);
    throw error;
  }
}

export async function updateStockItem(itemId, input) {
  await ensureSchema();
  const fields = itemFields(input, { partial: true });
  const keys = Object.keys(fields);
  if (!keys.length) throw createHttpError("ไม่มีอะไรให้แก้", 400);
  try {
    const result = await getPool().query(
      `UPDATE stock_items SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING id`,
      [Number(itemId), ...keys.map((key) => fields[key])]
    );
    if (!result.rows[0]) throw createHttpError("ไม่พบแพ็คนี้", 404);
    return result.rows[0].id;
  } catch (error) {
    if (error.code === "23505") throw createHttpError(`มีแพ็ค "${fields.label}" ในไอดีนี้แล้ว`, 409);
    throw error;
  }
}

/** An account's moves, newest first, each with its lines and cost. */
export async function listStockMoves(accountId, { kind = null, limit = 200 } = {}) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT m.*,
            COALESCE(json_agg(json_build_object('itemId', l.item_id, 'label', i.label, 'qty', l.qty, 'unitCost', l.unit_cost)
                     ORDER BY i.sort_order, i.id) FILTER (WHERE l.id IS NOT NULL), '[]') AS lines
       FROM stock_moves m
       LEFT JOIN stock_move_lines l ON l.move_id = m.id
       LEFT JOIN stock_items i ON i.id = l.item_id
      WHERE m.account_id = $1 AND ($2::text IS NULL OR m.kind = $2)
      GROUP BY m.id
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $3`,
    [Number(accountId), kind, Math.min(Math.max(Number(limit) || 200, 1), 1000)]
  );
  return result.rows.map((row) => {
    const lines = row.lines.map((line) => ({ ...line, unitCost: number(line.unitCost) }));
    const costed = lines.every((line) => line.unitCost != null);
    const cost = costed ? Math.round(lines.reduce((sum, line) => sum + Math.abs(line.qty) * line.unitCost, 0) * 100) / 100 : null;
    const sellPrice = number(row.sell_price);
    const profit = row.kind === "out" && sellPrice != null && cost != null ? Math.round((sellPrice - cost) * 100) / 100 : null;
    return {
      id: Number(row.id),
      kind: row.kind,
      queue: row.queue,
      note: row.note,
      sellPrice,
      cost,
      profit,
      margin: stockMargin(profit, sellPrice),
      actorName: row.actor_name,
      createdAt: row.created_at,
      confirmState: row.confirm_state,
      confirmedBy: row.confirmed_by,
      lines,
    };
  });
}

/**
 * Records one move. The account row is locked while its balances are read
 * and the move written, so two people cutting the last unit cannot both
 * succeed. An out move whose queue number was already used is refused
 * unless `allowDuplicateQueue` (the person confirmed it is a second item).
 */
export async function recordStockMove(input, actor = null) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const moveId = await insertStockMove(client, input, actor);
    await client.query("COMMIT");
    return moveId;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * recordStockMove's work inside a transaction the caller already opened, so
 * another write (a purchase order receipt) can commit or roll back with it.
 */
export async function insertStockMove(client, { accountId, kind, queue, note, sellPrice, lines, allowDuplicateQueue = false, orderPack = "", awaiting = false }, actor = null) {
  await ensureSchema();
  const account = await client.query(`SELECT id, status FROM stock_accounts WHERE id = $1 FOR UPDATE`, [Number(accountId)]);
  if (!account.rows[0]) throw createHttpError("ไม่พบไอดีนี้", 404);
  if (account.rows[0].status === "closed") throw createHttpError("ไอดีนี้ปิดแล้ว", 400);
  const itemRows = await client.query(`${ITEMS_SQL} WHERE i.account_id = $1 GROUP BY i.id`, [Number(accountId)]);
  const items = new Map(itemRows.rows.map((row) => [row.id, mapItem(row)]));
  const labelled = (lines || []).map((line) => ({ ...line, label: items.get(Number(line.itemId))?.label }));
  if (labelled.some((line) => !line.label)) throw createHttpError("มีแพ็คที่ไม่อยู่ในไอดีนี้", 400);
  const balances = Object.fromEntries([...items.values()].map((item) => [item.id, item.left]));
  const checked = validateStockMove({ kind, queue, note, lines: labelled }, balances);
  if (checked.error) throw createHttpError(checked.error, 400);

  if (kind === "out" && !allowDuplicateQueue) {
    const used = await client.query(
      `SELECT a.code FROM stock_moves m JOIN stock_accounts a ON a.id = m.account_id
        WHERE m.kind = 'out' AND m.queue = $1 LIMIT 1`,
      [checked.queue]
    );
    if (used.rows[0]) {
      const error = createHttpError(`เลขคิว ${checked.queue} เคยตัด stock ไปแล้ว (${used.rows[0].code})`, 409);
      error.duplicateQueue = true;
      throw error;
    }
  }

  const price = normalizeStockMoney(sellPrice);
  const move = await client.query(
    `INSERT INTO stock_moves (account_id, kind, queue, note, sell_price, actor_id, actor_name, order_pack, confirm_state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [Number(accountId), kind, checked.queue, checked.note, kind === "out" && price !== "" ? Number(price) : null,
      actor?.id ?? null, String(actor?.name || "").slice(0, 255), kind === "out" ? String(orderPack || "").slice(0, 200) : "",
      kind === "out" && awaiting ? "awaiting" : "confirmed"]
  );
  for (const line of checked.lines) {
    // An out line keeps the pack's average cost at the time, so a later
    // receipt at another price does not rewrite an old sale's profit.
    const unitCost = kind === "in" ? line.unitCost : kind === "out" ? items.get(line.itemId).avgCost : null;
    await client.query(
      `INSERT INTO stock_move_lines (move_id, item_id, qty, unit_cost) VALUES ($1, $2, $3, $4)`,
      [move.rows[0].id, line.itemId, line.qty, unitCost === "" || unitCost == null ? null : Number(unitCost)]
    );
  }
  // A person's one-pack cut of an order teaches which pack that order text means.
  const packKey = stockOrderPackKey(orderPack);
  if (kind === "out" && !awaiting && packKey && checked.lines.length === 1) {
    await client.query(
      `INSERT INTO stock_pack_aliases (account_id, pack_key, item_id) VALUES ($1, $2, $3)
       ON CONFLICT (account_id, pack_key) DO UPDATE
         SET item_id = EXCLUDED.item_id,
             uses = CASE WHEN stock_pack_aliases.item_id = EXCLUDED.item_id THEN stock_pack_aliases.uses + 1 ELSE 1 END,
             updated_at = NOW()`,
      [Number(accountId), packKey, checked.lines[0].itemId]
    );
  }
  return Number(move.rows[0].id);
}

/**
 * One game's stock for its GameInfo page: the open accounts filed under it
 * ({ code, status, leftTotal }) and, by GameInfo pack name, what is left
 * across them ({ left, tone, codes }). A pack is matched by its exact name.
 */
export async function listStockForGame(gameId, dataMode = "uid") {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT a.code, a.status AS account_status, ${ITEM_COLUMNS}
       FROM stock_accounts a
       LEFT JOIN stock_items i ON i.account_id = a.id ${ITEM_JOINS}
      WHERE a.game_id = $1 AND a.data_mode = $2 AND a.status <> 'closed'
      GROUP BY a.id, i.id
      ORDER BY a.code, i.sort_order, i.id`,
    [Number(gameId), dataMode === "idpass" ? "idpass" : "uid"]
  );
  const accounts = new Map();
  const byPack = {};
  for (const row of result.rows) {
    const account = accounts.get(row.code) || { code: row.code, status: row.account_status, leftTotal: 0 };
    accounts.set(row.code, account);
    if (row.id == null) continue;
    const item = mapItem(row);
    account.leftTotal += Math.max(item.left, 0);
    // An item kept as "A / B" badges both packs A and B on the game page.
    for (const name of stockPackNameParts(item.packName)) {
      const current = byPack[name];
      const left = (current?.left ?? 0) + Math.max(item.left, 0);
      const lowAt = Math.max(current?.lowAt ?? 0, item.lowAt);
      byPack[name] = { left, lowAt, tone: stockTone(left, lowAt), codes: [...new Set([...(current?.codes || []), row.code])] };
    }
  }
  return { accounts: [...accounts.values()], byPack };
}

/** { "<accountId>|<packKey>": itemId } learned from earlier cuts. */
export async function listStockPackAliases() {
  await ensureSchema();
  const result = await getPool().query(`SELECT account_id, pack_key, item_id FROM stock_pack_aliases`);
  return new Map(result.rows.map((row) => [`${row.account_id}|${row.pack_key}`, row.item_id]));
}

/** The main switch: off, and no account touches the main site whatever its own switch says. */
export async function getStockWebSync() {
  await ensureSchema();
  const result = await getPool().query(`SELECT enabled FROM stock_web_sync`);
  return result.rows[0]?.enabled === true;
}

export async function setStockWebSync(enabled, actorName = "") {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO stock_web_sync (id, enabled, updated_by) VALUES (TRUE, $1, $2)
     ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [enabled === true, String(actorName || "").slice(0, 255)]
  );
  return enabled === true;
}

/** Remember which packs were alerted, and forget those that are back above their level. */
export async function markStockLowAlerts(sentIds, clearedIds) {
  await ensureSchema();
  if (sentIds.length) await getPool().query(`UPDATE stock_items SET low_alert_at = NOW() WHERE id = ANY($1::int[])`, [sentIds]);
  if (clearedIds.length) await getPool().query(`UPDATE stock_items SET low_alert_at = NULL WHERE id = ANY($1::int[])`, [clearedIds]);
}

/** How many system cuts wait for a person, for the รอตัด tab's badge. */
export async function countAwaitingStockMoves() {
  await ensureSchema();
  const result = await getPool().query(`SELECT COUNT(*)::int AS n FROM stock_moves WHERE confirm_state = 'awaiting'`);
  return result.rows[0].n;
}

/** Cuts the system made that wait for a person, oldest first. */
export async function listAwaitingStockMoves() {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT m.id, m.account_id, a.code, m.queue, m.note, m.order_pack, m.created_at,
            COALESCE(json_agg(json_build_object('itemId', l.item_id, 'label', i.label, 'qty', -l.qty)) FILTER (WHERE l.id IS NOT NULL), '[]') AS lines
       FROM stock_moves m
       JOIN stock_accounts a ON a.id = m.account_id
       LEFT JOIN stock_move_lines l ON l.move_id = m.id
       LEFT JOIN stock_items i ON i.id = l.item_id
      WHERE m.confirm_state = 'awaiting'
      GROUP BY m.id, a.code
      ORDER BY m.created_at, m.id`
  );
  return result.rows.map((row) => ({
    id: Number(row.id), accountId: row.account_id, code: row.code, queue: row.queue, note: row.note,
    orderPack: row.order_pack, createdAt: row.created_at, lines: row.lines,
  }));
}

/** A person agrees with a system cut: it becomes an ordinary cut, and its learned pack gains a use. */
export async function confirmStockMove(moveId, actor = null) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE stock_moves SET confirm_state = 'confirmed', confirmed_by = $2, confirmed_at = NOW()
        WHERE id = $1 AND confirm_state = 'awaiting' RETURNING account_id, order_pack`,
      [Number(moveId), String(actor?.name || "").slice(0, 255)]
    );
    if (!result.rows[0]) throw createHttpError("รายการนี้ยืนยันหรือยกเลิกไปแล้ว", 409);
    const packKey = stockOrderPackKey(result.rows[0].order_pack);
    if (packKey) {
      await client.query(
        `UPDATE stock_pack_aliases SET uses = uses + 1, updated_at = NOW() WHERE account_id = $1 AND pack_key = $2`,
        [result.rows[0].account_id, packKey]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * A person rejects a system cut: the move goes, so the balance comes back.
 * With `forget` (the pack was wrong) the learned pack that led to it is
 * forgotten too, so the order is not cut the same way again; without it (the
 * order just did not use stock) the learned pack stays.
 * Returns { queue, note, orderPack } for the caller.
 */
export async function cancelAwaitingStockMove(moveId, { forget = true } = {}) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `DELETE FROM stock_moves WHERE id = $1 AND confirm_state = 'awaiting' RETURNING account_id, queue, note, order_pack`,
      [Number(moveId)]
    );
    if (!result.rows[0]) throw createHttpError("รายการนี้ยืนยันหรือยกเลิกไปแล้ว", 409);
    const { account_id: accountId, queue, note, order_pack: orderPack } = result.rows[0];
    const packKey = stockOrderPackKey(orderPack);
    if (forget && packKey) await client.query(`DELETE FROM stock_pack_aliases WHERE account_id = $1 AND pack_key = $2`, [accountId, packKey]);
    await client.query("COMMIT");
    return { queue, note, orderPack };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
