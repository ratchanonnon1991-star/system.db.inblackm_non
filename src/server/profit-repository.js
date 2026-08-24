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
      // A channel (category id -- 'gocash', 'oxide', 'codashop', 'unipin',
      // ...) can top up more than one game; staff add game names here as
      // needed instead of that list being fixed in code. Manual channels'
      // cards get tagged with one (see profit_cards.game_id below) so the
      // card list can actually be filtered by it; bot channels (GoCash/
      // Oxide) only get a reference list here for now -- their card data is
      // read live from an external DB that doesn't carry a per-order game
      // field yet, so there's nothing to tag/filter on there.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_channel_games (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          channel_id VARCHAR(32) NOT NULL,
          name       TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (channel_id, name)
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS profit_channel_games_channel_id_idx ON profit_channel_games (channel_id)
      `);
      await client.query(`
        ALTER TABLE profit_cards ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES profit_channel_games (id) ON DELETE SET NULL
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
          cost        NUMERIC,
          platform    TEXT
        )
      `);
      // Which resale platform (Kaleoz, USDT Russia, ...) this order actually
      // sold through -- lets sale_amount be auto-filled from that platform's
      // reference price (profit_platform_pack_prices) instead of always
      // typed in by hand. Null means "not tagged yet".
      await client.query(`
        ALTER TABLE profit_gocash_overrides ADD COLUMN IF NOT EXISTS platform TEXT
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
      // Append-only history of every "marked cleared" / "unmarked" click on a
      // card, so a card that goes dusty again after new orders and gets
      // cleared by a different person keeps a full trail instead of only the
      // latest name -- and so unmarking is attributed too, not just clearing.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_gocash_dust_clear_log (
          id         SERIAL PRIMARY KEY,
          card_id    TEXT NOT NULL,
          user_id    INTEGER,
          user_name  TEXT NOT NULL,
          action     TEXT NOT NULL DEFAULT 'cleared',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        ALTER TABLE profit_gocash_dust_clear_log ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'cleared'
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS profit_gocash_dust_clear_log_card_id_idx
        ON profit_gocash_dust_clear_log (card_id)
      `);
      // Manual "someone reviewed the duplicate-order flag(s) on this card and
      // confirmed it's fine" mark -- lets staff dismiss a card from the
      // "บัตรที่พบยอดซ้ำ" count/filter once they've checked it, instead of it
      // sitting there forever. Same "counts only until new activity" rule as
      // dust-cleared: a fresh order after the mark means it needs a re-look.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_gocash_duplicate_reviewed (
          card_id           TEXT PRIMARY KEY,
          reviewed_at       TIMESTAMPTZ NOT NULL,
          reviewed_by_id    INTEGER,
          reviewed_by_name  TEXT
        )
      `);
      // Append-only history of every "marked reviewed" / "unmarked" click on a
      // card, same shape/purpose as profit_gocash_dust_clear_log -- shown on
      // the card detail page so staff can see who reviewed it and when, even
      // after a later duplicate resets the current mark.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_gocash_duplicate_review_log (
          id         SERIAL PRIMARY KEY,
          card_id    TEXT NOT NULL,
          user_id    INTEGER,
          user_name  TEXT NOT NULL,
          action     TEXT NOT NULL DEFAULT 'reviewed',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS profit_gocash_duplicate_review_log_card_id_idx
        ON profit_gocash_duplicate_review_log (card_id)
      `);
      // Explicit per-card game tag for GoCash cards (same "gocash:<cardKey>"
      // id as above). Most cards never need a row here -- the channel has
      // exactly one game today ("sky"), so every untagged card defaults to it
      // automatically (see resolveGocashGame in profit-aggregate.js). This
      // only matters once a second game exists and an untagged card can no
      // longer be defaulted safely.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_gocash_card_games (
          card_id TEXT PRIMARY KEY,
          game_id UUID NOT NULL REFERENCES profit_channel_games (id) ON DELETE CASCADE
        )
      `);
      // Per-pack cost default, keyed "source:packName".
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_pack_costs (
          pack_key TEXT PRIMARY KEY,
          cost     NUMERIC NOT NULL
        )
      `);
      // Single manually-entered value: baht per 1 USD of GoCash deduction.
      // GoCash's cost is `deducted (USD) * rate` (see gocashOrderView in
      // profit-aggregate.js) instead of the per-pack cost table other
      // sources use -- a plain key/value table since this is the only
      // setting so far, but shaped to hold more later.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
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

      // Marketplace commission some platforms take off the listed sale price
      // before the money actually lands (e.g. Kaleoz keeps 5%) -- GoCash's
      // profit calc nets this out first (see gocashOrderView in
      // profit-aggregate.js) instead of overstating what was really made.
      // Missing row = 0% (no fee known yet).
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_platform_fees (
          platform TEXT PRIMARY KEY,
          fee_pct  NUMERIC NOT NULL DEFAULT 0
        )
      `);
      await client.query(`
        INSERT INTO profit_platform_fees (platform, fee_pct) VALUES ('kaleoz', 5)
        ON CONFLICT (platform) DO NOTHING
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
    gameId: row.game_id,
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

export async function createCard({ categoryId, name, note, openingBalance, gameId }) {
  await ensureSchema();
  const { rows: countRows } = await getPool().query(
    `SELECT COUNT(*)::int AS count FROM profit_cards WHERE category_id = $1`,
    [categoryId]
  );
  const fallbackName = `บัตรใหม่ ${(countRows[0]?.count || 0) + 1}`;
  const { rows } = await getPool().query(
    `INSERT INTO profit_cards (category_id, name, note, opening_balance, game_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [categoryId, name?.trim() || fallbackName, note || "", Number(openingBalance) || 0, gameId || null]
  );
  return mapCard(rows[0]);
}

const CARD_PATCH_COLUMNS = {
  name: "name",
  note: "note",
  status: "status",
  openingBalance: "opening_balance",
  deductedOverride: "deducted_override",
  gameId: "game_id",
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

// ── Channel games (a channel/category can top up more than one game) ────
export async function listChannelGames(channelId) {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, created_at FROM profit_channel_games WHERE channel_id = $1 ORDER BY name ASC`,
    [channelId]
  );
  return rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
}

export async function addChannelGame(channelId, name) {
  await ensureSchema();
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("ต้องระบุชื่อเกม");
  const { rows } = await getPool().query(
    `INSERT INTO profit_channel_games (channel_id, name) VALUES ($1, $2)
     ON CONFLICT (channel_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name, created_at`,
    [channelId, trimmed]
  );
  const row = rows[0];
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

// Any manual cards tagged with this game fall back to "ไม่ระบุเกม" (game_id
// ON DELETE SET NULL) rather than being deleted -- removing a game is just
// removing the grouping, not the cards/orders under it.
export async function removeChannelGame(channelId, gameId) {
  await ensureSchema();
  await getPool().query(`DELETE FROM profit_channel_games WHERE id = $1 AND channel_id = $2`, [gameId, channelId]);
}

// ── GoCash per-card game tags ─────────────────────────────────────────────
export async function listGocashCardGames() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT card_id, game_id FROM profit_gocash_card_games`);
  const byId = {};
  for (const row of rows) byId[row.card_id] = row.game_id;
  return byId;
}

export async function setGocashCardGame(cardId, gameId) {
  await ensureSchema();
  if (!gameId) {
    await getPool().query(`DELETE FROM profit_gocash_card_games WHERE card_id = $1`, [cardId]);
    return null;
  }
  await getPool().query(
    `INSERT INTO profit_gocash_card_games (card_id, game_id) VALUES ($1, $2)
     ON CONFLICT (card_id) DO UPDATE SET game_id = EXCLUDED.game_id`,
    [cardId, gameId]
  );
  return gameId;
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
  const { rows } = await getPool().query(`SELECT history_id, sale_amount, cost, platform FROM profit_gocash_overrides`);
  const byId = {};
  for (const row of rows) {
    byId[row.history_id] = {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  }
  return byId;
}

export async function setGocashOverride(historyId, { saleAmount, cost, platform }) {
  await ensureSchema();
  const { rows } = await getPool().query(
    `INSERT INTO profit_gocash_overrides (history_id, sale_amount, cost, platform)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (history_id) DO UPDATE SET
       sale_amount = CASE WHEN $5 THEN EXCLUDED.sale_amount ELSE profit_gocash_overrides.sale_amount END,
       cost = CASE WHEN $6 THEN EXCLUDED.cost ELSE profit_gocash_overrides.cost END,
       platform = CASE WHEN $7 THEN EXCLUDED.platform ELSE profit_gocash_overrides.platform END
     RETURNING sale_amount, cost, platform`,
    [
      historyId,
      saleAmount !== undefined ? Number(saleAmount) || 0 : 0,
      cost !== undefined ? Number(cost) || 0 : null,
      platform !== undefined ? String(platform || "").trim() || null : null,
      saleAmount !== undefined,
      cost !== undefined,
      platform !== undefined,
    ]
  );
  const row = rows[0];
  return {
    saleAmount: Number(row.sale_amount),
    cost: row.cost == null ? null : Number(row.cost),
    platform: row.platform || null,
  };
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
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  if (cleared) {
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
        `INSERT INTO profit_gocash_dust_clear_log (card_id, user_id, user_name, action) VALUES ($1, $2, $3, 'cleared')`,
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
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM profit_gocash_dust_cleared WHERE card_id = $1`, [cardId]);
    await client.query(
      `INSERT INTO profit_gocash_dust_clear_log (card_id, user_id, user_name, action) VALUES ($1, $2, $3, 'uncleared')`,
      [cardId, actor?.id ?? null, actorName]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return null;
}

// Newest-first list of everyone who has ever marked or unmarked this card's
// dust cleared -- shown on the card detail page alongside the current mark.
export async function listDustClearLog(cardId) {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT user_id, user_name, action, created_at FROM profit_gocash_dust_clear_log
     WHERE card_id = $1 ORDER BY created_at DESC`,
    [cardId]
  );
  return rows.map((row) => ({
    userId: row.user_id,
    userName: row.user_name,
    action: row.action,
    clearedAt: row.created_at,
  }));
}

// ── GoCash duplicate-order review marks ──────────────────────────────────
export async function listDuplicateReviewed() {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT card_id, reviewed_at, reviewed_by_id, reviewed_by_name FROM profit_gocash_duplicate_reviewed`
  );
  const byId = {};
  for (const row of rows) {
    byId[row.card_id] = {
      reviewedAt: row.reviewed_at,
      reviewedById: row.reviewed_by_id,
      reviewedByName: row.reviewed_by_name,
    };
  }
  return byId;
}

export async function setDuplicateReviewed(cardId, reviewed, actor) {
  await ensureSchema();
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  if (reviewed) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO profit_gocash_duplicate_reviewed (card_id, reviewed_at, reviewed_by_id, reviewed_by_name)
         VALUES ($1, NOW(), $2, $3)
         ON CONFLICT (card_id) DO UPDATE SET
           reviewed_at = EXCLUDED.reviewed_at,
           reviewed_by_id = EXCLUDED.reviewed_by_id,
           reviewed_by_name = EXCLUDED.reviewed_by_name
         RETURNING reviewed_at, reviewed_by_id, reviewed_by_name`,
        [cardId, actor?.id ?? null, actorName]
      );
      await client.query(
        `INSERT INTO profit_gocash_duplicate_review_log (card_id, user_id, user_name, action) VALUES ($1, $2, $3, 'reviewed')`,
        [cardId, actor?.id ?? null, actorName]
      );
      await client.query("COMMIT");
      const row = rows[0];
      return { reviewedAt: row.reviewed_at, reviewedById: row.reviewed_by_id, reviewedByName: row.reviewed_by_name };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM profit_gocash_duplicate_reviewed WHERE card_id = $1`, [cardId]);
    await client.query(
      `INSERT INTO profit_gocash_duplicate_review_log (card_id, user_id, user_name, action) VALUES ($1, $2, $3, 'unreviewed')`,
      [cardId, actor?.id ?? null, actorName]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return null;
}

// Newest-first list of everyone who has ever marked or unmarked this card's
// duplicate-order review -- shown on the card detail page alongside the
// current mark, same "who/when" trail as listDustClearLog.
export async function listDuplicateReviewLog(cardId) {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT user_id, user_name, action, created_at FROM profit_gocash_duplicate_review_log
     WHERE card_id = $1 ORDER BY created_at DESC`,
    [cardId]
  );
  return rows.map((row) => ({
    userId: row.user_id,
    userName: row.user_name,
    action: row.action,
    reviewedAt: row.created_at,
  }));
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

// ── GoCash cost conversion (baht per 1 USD deducted) ──────────────────────
// Two multiplied-together numbers, matching the team's own cost sheet:
//   cost (THB) = deducted(USD) * usdThbRate * gocashRate
// usdThbRate is the plain fiat USD->THB spot rate, defaulted from
// exchangerate-api.com and auto-refreshed (see ensureUsdThbRate in
// profit-aggregate.js). gocashRate is the deal-specific rate support actually
// bought GoCash credit at (their sheet breaks it into "Discount"/"Fee"
// columns, but this project only tracks the combined number for now) --
// always manual until it can be pulled from gameinfo instead.

// USD -> THB spot rate.
const USD_THB_RATE_KEY = "usd_thb_rate";
const USD_THB_RATE_UPDATED_AT_KEY = "usd_thb_rate_updated_at";
const USD_THB_RATE_SOURCE_KEY = "usd_thb_rate_source";
const USD_THB_RATE_SETTING_KEYS = [USD_THB_RATE_KEY, USD_THB_RATE_UPDATED_AT_KEY, USD_THB_RATE_SOURCE_KEY];

export async function getUsdThbRateInfo() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT key, value FROM profit_settings WHERE key = ANY($1)`, [
    USD_THB_RATE_SETTING_KEYS,
  ]);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    rate: byKey[USD_THB_RATE_KEY] != null ? Number(byKey[USD_THB_RATE_KEY]) : 0,
    updatedAt: byKey[USD_THB_RATE_UPDATED_AT_KEY] || null,
    source: byKey[USD_THB_RATE_SOURCE_KEY] || null,
  };
}

export async function getUsdThbRate() {
  return (await getUsdThbRateInfo()).rate;
}

async function saveUsdThbRate(rate, source) {
  await ensureSchema();
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0) throw new Error("invalid rate");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const [key, value] of [
      [USD_THB_RATE_KEY, String(n)],
      [USD_THB_RATE_UPDATED_AT_KEY, new Date().toISOString()],
      [USD_THB_RATE_SOURCE_KEY, source],
    ]) {
      await client.query(
        `INSERT INTO profit_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return n;
}

export async function setUsdThbRate(rate) {
  return saveUsdThbRate(rate, "manual");
}

export async function setUsdThbRateFromApi(rate) {
  return saveUsdThbRate(rate, "api");
}

// GoCash's own deal rate -- plain manual entry, no live source yet.
const GOCASH_RATE_KEY = "gocash_rate";
const GOCASH_RATE_SETTING_KEYS = [GOCASH_RATE_KEY];

export async function getGocashRate() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT value FROM profit_settings WHERE key = $1`, [GOCASH_RATE_KEY]);
  return rows[0] ? Number(rows[0].value) : 0;
}

export async function setGocashRate(rate) {
  await ensureSchema();
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0) throw new Error("invalid rate");
  await getPool().query(
    `INSERT INTO profit_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [GOCASH_RATE_KEY, String(n)]
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

// Every platform's prices in one query, keyed by platform then pack_key --
// used where orders can carry a different platform each (see
// gocashOrderView), so looking one up per distinct platform per request
// would cost one round trip per platform instead of one for the whole batch.
export async function getAllPlatformPrices() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT platform, pack_key, price FROM profit_platform_pack_prices`);
  const byPlatform = {};
  for (const row of rows) {
    if (!byPlatform[row.platform]) byPlatform[row.platform] = {};
    byPlatform[row.platform][row.pack_key] = Number(row.price);
  }
  return byPlatform;
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

// Clears every price entry for one platform -- back to "ยังไม่ได้ตั้ง" for
// every pack, not zeroed (a 0 price would still count as "priced" and would
// wrongly zero out sale/profit for any order pulling from it).
export async function resetPlatformPrices(platform) {
  await ensureSchema();
  const plat = String(platform || "").trim();
  if (!plat) throw new Error("platform required");
  await getPool().query(`DELETE FROM profit_platform_pack_prices WHERE platform = $1`, [plat]);
}

// ── Per-platform marketplace fee (% taken off the listed sale price) ─────
// Kaleoz's cut is a fixed, contractual 5% rather than something staff
// discover/adjust themselves -- locked here so it can't drift from that
// regardless of what the fee-setting UI does, and re-asserted on every read
// so it stays correct even if the DB row itself is ever mistakenly edited.
const LOCKED_PLATFORM_FEES = { kaleoz: 5 };

export function isPlatformFeeLocked(platform) {
  return Object.prototype.hasOwnProperty.call(LOCKED_PLATFORM_FEES, platform);
}

export async function getAllPlatformFees() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT platform, fee_pct FROM profit_platform_fees`);
  const byPlatform = {};
  for (const row of rows) byPlatform[row.platform] = Number(row.fee_pct);
  Object.assign(byPlatform, LOCKED_PLATFORM_FEES);
  return byPlatform;
}

export async function setPlatformFee(platform, feePct) {
  await ensureSchema();
  const plat = String(platform || "").trim();
  if (!plat) throw new Error("platform required");
  if (isPlatformFeeLocked(plat)) {
    const error = new Error(`ค่าธรรมเนียมของ ${plat} เป็นค่าคงที่ แก้ไขไม่ได้`);
    error.status = 400;
    throw error;
  }
  const n = Number(feePct);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("invalid fee");
  await getPool().query(
    `INSERT INTO profit_platform_fees (platform, fee_pct) VALUES ($1, $2)
     ON CONFLICT (platform) DO UPDATE SET fee_pct = EXCLUDED.fee_pct`,
    [plat, n]
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
    await client.query(`DELETE FROM profit_settings WHERE key = ANY($1)`, [
      [...USD_THB_RATE_SETTING_KEYS, ...GOCASH_RATE_SETTING_KEYS],
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
