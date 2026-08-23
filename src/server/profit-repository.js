// Postgres-backed replacement for the standalone Card Ops app's local
// server/data/db.json file. Everything else in this project persists to
// Postgres (see users-repository.js's ensureSchema() pattern, reused here),
// so manual cards/orders and the GoCash cost overrides/dust marks/pack-cost
// defaults live in their own tables instead of a file on disk.
import { getPool } from "@/lib/db";

let schemaReady;

async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const client = await getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_cards (
          id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          category_id       VARCHAR(32) NOT NULL,
          name              TEXT NOT NULL,
          note              TEXT NOT NULL DEFAULT '',
          status            VARCHAR(16) NOT NULL DEFAULT 'active',
          opening_balance   NUMERIC NOT NULL DEFAULT 0,
          deducted_override NUMERIC,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS profit_cards_category_id_idx ON profit_cards (category_id)
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_orders (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          card_id     UUID NOT NULL REFERENCES profit_cards (id) ON DELETE CASCADE,
          txid        TEXT NOT NULL,
          sale_amount NUMERIC NOT NULL DEFAULT 0,
          cost        NUMERIC NOT NULL DEFAULT 0,
          note        TEXT NOT NULL DEFAULT '',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS profit_orders_card_id_idx ON profit_orders (card_id)
      `);
      // Keyed by sky_gocash_history.id -- that table is read-only / owned by
      // the bot, so the sale amount (entered by hand) and any cost override
      // live here instead.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_gocash_overrides (
          history_id  BIGINT PRIMARY KEY,
          sale_amount NUMERIC NOT NULL DEFAULT 0,
          cost        NUMERIC
        )
      `);
      // Manual "someone cleared the leftover dust on this card" mark, keyed
      // by the same "gocash:<cardKey>" id the aggregate layer uses. Holds
      // only the current mark; cleared_by_* records who most recently made
      // it (user_id is nullable -- the account may since have been deleted).
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_gocash_dust_cleared (
          card_id         TEXT PRIMARY KEY,
          cleared_at      TIMESTAMPTZ NOT NULL,
          cleared_by_id   INTEGER,
          cleared_by_name TEXT
        )
      `);
      await client.query(`
        ALTER TABLE profit_gocash_dust_cleared ADD COLUMN IF NOT EXISTS cleared_by_id INTEGER
      `);
      await client.query(`
        ALTER TABLE profit_gocash_dust_cleared ADD COLUMN IF NOT EXISTS cleared_by_name TEXT
      `);
      // Append-only history of every "marked cleared" click on a card, so a
      // card that goes dusty again after new orders and gets cleared by a
      // different person keeps a full trail instead of only the latest name.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_gocash_dust_clear_log (
          id         SERIAL PRIMARY KEY,
          card_id    TEXT NOT NULL,
          user_id    INTEGER,
          user_name  TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS profit_gocash_dust_clear_log_card_id_idx
        ON profit_gocash_dust_clear_log (card_id)
      `);
      // Per-pack cost default, keyed "source:packName".
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_pack_costs (
          pack_key TEXT PRIMARY KEY,
          cost     NUMERIC NOT NULL
        )
      `);
      // Reference sale-price list, one row per (platform, pack). Platforms
      // (Kaleoz, USDT Russia, ...) aren't tracked anywhere else in the data
      // -- this table is the only source of truth for which platforms exist,
      // so the first price entered for a new platform name is what creates it.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_platform_pack_prices (
          platform TEXT NOT NULL,
          pack_key TEXT NOT NULL,
          price    NUMERIC NOT NULL,
          PRIMARY KEY (platform, pack_key)
        )
      `);

      // One-time seed from the standalone app's server/data/db.json, so the
      // handful of values the team had already entered there aren't lost.
      await client.query(`
        INSERT INTO profit_gocash_overrides (history_id, sale_amount, cost)
        VALUES (2042, 0, 0)
        ON CONFLICT (history_id) DO NOTHING
      `);
      await client.query(`
        INSERT INTO profit_gocash_dust_cleared (card_id, cleared_at)
        VALUES ('gocash:338446284617285', '2026-08-20T13:35:12.142Z')
        ON CONFLICT (card_id) DO NOTHING
      `);
      await client.query(`
        INSERT INTO profit_pack_costs (pack_key, cost)
        VALUES ('gocash:Sunlight Sporty Sunglasses', 99)
        ON CONFLICT (pack_key) DO NOTHING
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

function mapCard(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    note: row.note,
    status: row.status,
    openingBalance: Number(row.opening_balance),
    deductedOverride: row.deducted_override == null ? null : Number(row.deducted_override),
    createdAt: row.created_at,
  };
}

function mapOrder(row) {
  return {
    id: row.id,
    cardId: row.card_id,
    txid: row.txid,
    saleAmount: Number(row.sale_amount),
    cost: Number(row.cost),
    note: row.note,
    createdAt: row.created_at,
  };
}

// ── Cards (local categories only) ──────────────────────────────────────
export async function listCards(categoryId) {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT * FROM profit_cards WHERE category_id = $1 ORDER BY created_at ASC`,
    [categoryId]
  );
  return rows.map(mapCard);
}

export async function getCard(cardId) {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT * FROM profit_cards WHERE id = $1`, [cardId]);
  return rows[0] ? mapCard(rows[0]) : null;
}

export async function createCard({ categoryId, name, note, openingBalance }) {
  await ensureSchema();
  const { rows: countRows } = await getPool().query(
    `SELECT COUNT(*)::int AS count FROM profit_cards WHERE category_id = $1`,
    [categoryId]
  );
  const fallbackName = `บัตรใหม่ ${(countRows[0]?.count || 0) + 1}`;
  const { rows } = await getPool().query(
    `INSERT INTO profit_cards (category_id, name, note, opening_balance)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [categoryId, name?.trim() || fallbackName, note || "", Number(openingBalance) || 0]
  );
  return mapCard(rows[0]);
}

const CARD_PATCH_COLUMNS = {
  name: "name",
  note: "note",
  status: "status",
  openingBalance: "opening_balance",
  deductedOverride: "deducted_override",
};

export async function updateCard(cardId, patch) {
  await ensureSchema();
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(CARD_PATCH_COLUMNS)) {
    if (key in patch) {
      values.push(patch[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (!sets.length) return getCard(cardId);
  values.push(cardId);
  const { rows } = await getPool().query(
    `UPDATE profit_cards SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return rows[0] ? mapCard(rows[0]) : null;
}

export async function deleteCard(cardId) {
  await ensureSchema();
  await getPool().query(`DELETE FROM profit_cards WHERE id = $1`, [cardId]);
}

// ── Orders (local categories only) ──────────────────────────────────────
export async function listOrders(cardId) {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT * FROM profit_orders WHERE card_id = $1 ORDER BY created_at ASC`,
    [cardId]
  );
  return rows.map(mapOrder);
}

export async function createOrder({ cardId, txid, saleAmount, cost, note }) {
  await ensureSchema();
  const { rows: countRows } = await getPool().query(
    `SELECT COUNT(*)::int AS count FROM profit_orders WHERE card_id = $1`,
    [cardId]
  );
  const fallbackTxid = `TX-${(countRows[0]?.count || 0) + 1}`;
  const { rows } = await getPool().query(
    `INSERT INTO profit_orders (card_id, txid, sale_amount, cost, note)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [cardId, txid?.trim() || fallbackTxid, Number(saleAmount) || 0, Number(cost) || 0, note || ""]
  );
  return mapOrder(rows[0]);
}

const ORDER_PATCH_COLUMNS = { txid: "txid", saleAmount: "sale_amount", cost: "cost", note: "note" };

export async function updateOrder(orderId, patch) {
  await ensureSchema();
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(ORDER_PATCH_COLUMNS)) {
    if (key in patch) {
      const value = key === "saleAmount" || key === "cost" ? Number(patch[key]) || 0 : patch[key];
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (!sets.length) {
    const { rows } = await getPool().query(`SELECT * FROM profit_orders WHERE id = $1`, [orderId]);
    return rows[0] ? mapOrder(rows[0]) : null;
  }
  values.push(orderId);
  const { rows } = await getPool().query(
    `UPDATE profit_orders SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function deleteOrder(orderId) {
  await ensureSchema();
  await getPool().query(`DELETE FROM profit_orders WHERE id = $1`, [orderId]);
}

// ── GoCash cost overrides ────────────────────────────────────────────────
// Fetched in bulk (not per history-row) so the aggregate layer doesn't pay
// for one round trip per GoCash row when it renders a card or the full feed.
export async function listGocashOverrides() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT history_id, sale_amount, cost FROM profit_gocash_overrides`);
  const byId = {};
  for (const row of rows) {
    byId[row.history_id] = {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
    };
  }
  return byId;
}

export async function setGocashOverride(historyId, { saleAmount, cost }) {
  await ensureSchema();
  const { rows } = await getPool().query(
    `INSERT INTO profit_gocash_overrides (history_id, sale_amount, cost)
     VALUES ($1, $2, $3)
     ON CONFLICT (history_id) DO UPDATE SET
       sale_amount = CASE WHEN $4 THEN EXCLUDED.sale_amount ELSE profit_gocash_overrides.sale_amount END,
       cost = CASE WHEN $5 THEN EXCLUDED.cost ELSE profit_gocash_overrides.cost END
     RETURNING sale_amount, cost`,
    [
      historyId,
      saleAmount !== undefined ? Number(saleAmount) || 0 : 0,
      cost !== undefined ? Number(cost) || 0 : null,
      saleAmount !== undefined,
      cost !== undefined,
    ]
  );
  const row = rows[0];
  return { saleAmount: Number(row.sale_amount), cost: row.cost == null ? null : Number(row.cost) };
}

// ── GoCash dust-cleared marks ─────────────────────────────────────────────
export async function listDustCleared() {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT card_id, cleared_at, cleared_by_id, cleared_by_name FROM profit_gocash_dust_cleared`
  );
  const byId = {};
  for (const row of rows) {
    byId[row.card_id] = {
      clearedAt: row.cleared_at,
      clearedById: row.cleared_by_id,
      clearedByName: row.cleared_by_name,
    };
  }
  return byId;
}

// actor: the account marking/unmarking the card, from the session (see
// requireProfitEditor) -- { id, displayName, username }. Marking cleared
// both stamps the current mark with who did it and appends to the
// append-only log so a card cleared by different people over time keeps
// every name, not just the latest.
export async function setDustCleared(cardId, cleared, actor) {
  await ensureSchema();
  if (cleared) {
    const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO profit_gocash_dust_cleared (card_id, cleared_at, cleared_by_id, cleared_by_name)
         VALUES ($1, NOW(), $2, $3)
         ON CONFLICT (card_id) DO UPDATE SET
           cleared_at = EXCLUDED.cleared_at,
           cleared_by_id = EXCLUDED.cleared_by_id,
           cleared_by_name = EXCLUDED.cleared_by_name
         RETURNING cleared_at, cleared_by_id, cleared_by_name`,
        [cardId, actor?.id ?? null, actorName]
      );
      await client.query(
        `INSERT INTO profit_gocash_dust_clear_log (card_id, user_id, user_name) VALUES ($1, $2, $3)`,
        [cardId, actor?.id ?? null, actorName]
      );
      await client.query("COMMIT");
      const row = rows[0];
      return { clearedAt: row.cleared_at, clearedById: row.cleared_by_id, clearedByName: row.cleared_by_name };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  await getPool().query(`DELETE FROM profit_gocash_dust_cleared WHERE card_id = $1`, [cardId]);
  return null;
}

// Newest-first list of everyone who has ever marked this card's dust
// cleared -- shown on the card detail page alongside the current mark.
export async function listDustClearLog(cardId) {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT user_id, user_name, created_at FROM profit_gocash_dust_clear_log
     WHERE card_id = $1 ORDER BY created_at DESC`,
    [cardId]
  );
  return rows.map((row) => ({ userId: row.user_id, userName: row.user_name, clearedAt: row.created_at }));
}

// ── Pack cost defaults ────────────────────────────────────────────────────
export async function getPackCosts() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT pack_key, cost FROM profit_pack_costs`);
  const byKey = {};
  for (const row of rows) byKey[row.pack_key] = Number(row.cost);
  return byKey;
}

export async function setPackCost(source, packName, cost) {
  await ensureSchema();
  const src = String(source || "").trim();
  const name = String(packName || "").trim();
  if (!src || !name) throw new Error("source and packName required");
  const n = Number(cost);
  if (!Number.isFinite(n)) throw new Error("invalid cost");
  const key = `${src}:${name}`;
  await getPool().query(
    `INSERT INTO profit_pack_costs (pack_key, cost) VALUES ($1, $2)
     ON CONFLICT (pack_key) DO UPDATE SET cost = EXCLUDED.cost`,
    [key, n]
  );
  return n;
}

// ── Per-platform sale-price reference list ─────────────────────────────────
// How many packs each platform has a price set for -- feeds the platform
// overview cards on the sale-prices page so the team can see at a glance
// which platform still needs filling in.
export async function getPlatformPriceCounts() {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT platform, COUNT(*)::int AS priced_count FROM profit_platform_pack_prices GROUP BY platform ORDER BY platform`
  );
  return rows.map((row) => ({ platform: row.platform, pricedCount: row.priced_count }));
}

export async function getPlatformPrices(platform) {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT pack_key, price FROM profit_platform_pack_prices WHERE platform = $1`,
    [platform]
  );
  const byKey = {};
  for (const row of rows) byKey[row.pack_key] = Number(row.price);
  return byKey;
}

export async function setPlatformPrice(platform, source, packName, price) {
  await ensureSchema();
  const plat = String(platform || "").trim();
  const src = String(source || "").trim();
  const name = String(packName || "").trim();
  if (!plat || !src || !name) throw new Error("platform, source and packName required");
  const n = Number(price);
  if (!Number.isFinite(n)) throw new Error("invalid price");
  const key = `${src}:${name}`;
  await getPool().query(
    `INSERT INTO profit_platform_pack_prices (platform, pack_key, price) VALUES ($1, $2, $3)
     ON CONFLICT (platform, pack_key) DO UPDATE SET price = EXCLUDED.price`,
    [plat, key, n]
  );
  return n;
}

// Wipe every cost value everywhere (local orders + gocash overrides + pack
// defaults). Sale amounts are left untouched -- matches the "clear all cost
// values" action.
export async function resetAllCosts() {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE profit_orders SET cost = 0`);
    await client.query(`UPDATE profit_gocash_overrides SET cost = 0`);
    await client.query(`UPDATE profit_cards SET deducted_override = NULL`);
    await client.query(`DELETE FROM profit_pack_costs`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
