// Postgres-backed replacement for the standalone Card Ops app's local
// server/data/db.json file. Everything else in this project persists to
// Postgres (see users-repository.js's ensureSchema() pattern, reused here),
// so manual cards/orders and the GoCash cost overrides/dust marks/pack-cost
// defaults live in their own tables instead of a file on disk.
import { getPool } from "@/lib/db";
import { normalizeSalePlatform } from "@/server/profit-platform-normalize";

function platformStorageKey(platform) {
  const raw = String(platform || "").trim();
  return normalizeSalePlatform(raw) || raw;
}

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
      // A channel (category id -- 'gocash', 'codashop', 'unipin', ...) can
      // top up more than one game; staff add game names here as needed
      // instead of that list being fixed in code. Manual channels' cards get
      // tagged with one (see profit_cards.game_id below) so the card list can
      // actually be filtered by it; GoCash cards get tagged per-card too (see
      // profit_gocash_card_games / resolveGocashGame). Oxide (Multi Game
      // Card) doesn't use this table at all -- its games come straight from
      // codashop_orders.game_name, real per-order data with nothing to
      // hand-tag (see profit-oxide.js's listGameNames).
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
      // Who most recently wrote this override -- surfaced in the 409
      // conflict message (assertOverrideUnchanged) so "someone else already
      // changed this" can name them instead of staying anonymous.
      await client.query(`
        ALTER TABLE profit_gocash_overrides ADD COLUMN IF NOT EXISTS updated_by_id INTEGER
      `);
      await client.query(`
        ALTER TABLE profit_gocash_overrides ADD COLUMN IF NOT EXISTS updated_by_name TEXT
      `);
      // Same idea as profit_gocash_overrides, but keyed by codashop_orders.id
      // directly (Multi Game Card / oxide has no separate history-row id --
      // the order row itself is the only record). No rate-based cost fallback
      // exists for this source (no balance ledger -- see profit-oxide.js), so
      // cost only ever comes from here or the per-pack default.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_oxide_overrides (
          order_id    BIGINT PRIMARY KEY,
          sale_amount NUMERIC NOT NULL DEFAULT 0,
          cost        NUMERIC,
          platform    TEXT
        )
      `);
      // Same "who wrote this" trail as profit_gocash_overrides above.
      await client.query(`
        ALTER TABLE profit_oxide_overrides ADD COLUMN IF NOT EXISTS updated_by_id INTEGER
      `);
      await client.query(`
        ALTER TABLE profit_oxide_overrides ADD COLUMN IF NOT EXISTS updated_by_name TEXT
      `);
      // Same shape/purpose as profit_oxide_overrides above, keyed by
      // codashop_orders.id too (WavePay orders live in the same table, just
      // tagged payment_method = 'WavePay' -- see profit-wavepay.js). No
      // rate-based cost fallback here either -- WavePay's own balance
      // ledger is in Kyat, not THB, so there's no reliable conversion to
      // fall back on; cost only ever comes from here or the per-pack
      // default.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_wavepay_overrides (
          order_id      BIGINT PRIMARY KEY,
          sale_amount   NUMERIC NOT NULL DEFAULT 0,
          cost          NUMERIC,
          platform      TEXT,
          updated_by_id INTEGER,
          updated_by_name TEXT
        )
      `);
      // Same shape as WavePay/Oxide overrides, keyed by codashop_orders.id
      // for DonShopIDR API rows (see profit-donshop.js).
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_donshop_overrides (
          order_id      BIGINT PRIMARY KEY,
          sale_amount   NUMERIC NOT NULL DEFAULT 0,
          cost          NUMERIC,
          platform      TEXT,
          updated_by_id INTEGER,
          updated_by_name TEXT
        )
      `);
      // U9 (Ooredoo) telco airtime — same override shape as WavePay, keyed
      // by codashop_orders.id (payment_method = 'U9' / legacy 'Ooredoo').
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_u9_overrides (
          order_id      BIGINT PRIMARY KEY,
          sale_amount   NUMERIC NOT NULL DEFAULT 0,
          cost          NUMERIC,
          platform      TEXT,
          updated_by_id INTEGER,
          updated_by_name TEXT
        )
      `);
      // Game Point Club (MYR) — same override shape, keyed by codashop_orders.id
      // (payment_method = 'GamePointClub'; see profit-gamepoint.js).
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_gamepoint_overrides (
          order_id      BIGINT PRIMARY KEY,
          sale_amount   NUMERIC NOT NULL DEFAULT 0,
          cost          NUMERIC,
          platform      TEXT,
          updated_by_id INTEGER,
          updated_by_name TEXT
        )
      `);
      // Agen H2H IDR — same override shape, keyed by codashop_orders.id
      // (payment_method = 'AgenH2HIDR'; see profit-agenh2h.js).
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_agenh2h_overrides (
          order_id      BIGINT PRIMARY KEY,
          sale_amount   NUMERIC NOT NULL DEFAULT 0,
          cost          NUMERIC,
          platform      TEXT,
          updated_by_id INTEGER,
          updated_by_name TEXT
        )
      `);
      // Codashop Reseller USD — same override shape, keyed by codashop_orders.id
      // (payment_method = 'CodashopUSD'; see profit-codareseller.js).
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_codareseller_overrides (
          order_id      BIGINT PRIMARY KEY,
          sale_amount   NUMERIC NOT NULL DEFAULT 0,
          cost          NUMERIC,
          platform      TEXT,
          updated_by_id INTEGER,
          updated_by_name TEXT
        )
      `);
      // Netease bot — keyed by netease_purchase_history.id (see profit-netease.js).
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_netease_overrides (
          order_id      BIGINT PRIMARY KEY,
          sale_amount   NUMERIC NOT NULL DEFAULT 0,
          cost          NUMERIC,
          platform      TEXT,
          updated_by_id INTEGER,
          updated_by_name TEXT
        )
      `);
      // TrueMoney / ATOM / Smart-Sun — codashop_auto_api airtime/wallet fills
      // (payment_method TrueMoney | ATOM | Smart/Sun). Keyed by codashop_orders.id.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_truemoney_overrides (
          order_id      BIGINT PRIMARY KEY,
          sale_amount   NUMERIC NOT NULL DEFAULT 0,
          cost          NUMERIC,
          platform      TEXT,
          updated_by_id INTEGER,
          updated_by_name TEXT
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_atom_overrides (
          order_id      BIGINT PRIMARY KEY,
          sale_amount   NUMERIC NOT NULL DEFAULT 0,
          cost          NUMERIC,
          platform      TEXT,
          updated_by_id INTEGER,
          updated_by_name TEXT
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_smartsun_overrides (
          order_id      BIGINT PRIMARY KEY,
          sale_amount   NUMERIC NOT NULL DEFAULT 0,
          cost          NUMERIC,
          platform      TEXT,
          updated_by_id INTEGER,
          updated_by_name TEXT
        )
      `);
      // Manual "someone consolidated this idle Multi Game Card's leftover
      // points onto another card" mark -- same shape/purpose as the GoCash
      // dust-cleared mark below, just for the "ต้องรวมบัตร" worklist (cards
      // with a balance that haven't taken an order in 12h+, see isIdle in
      // profit-aggregate.js). Keyed by the same "oxide:<index>" id
      // cardsForCategory uses.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_oxide_merge_cleared (
          card_id         TEXT PRIMARY KEY,
          cleared_at      TIMESTAMPTZ NOT NULL,
          cleared_by_id   INTEGER,
          cleared_by_name TEXT
        )
      `);
      // Append-only history of every "marked merged" / "unmarked" click,
      // same purpose as profit_gocash_dust_clear_log below.
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_oxide_merge_clear_log (
          id         SERIAL PRIMARY KEY,
          card_id    TEXT NOT NULL,
          user_id    INTEGER,
          user_name  TEXT NOT NULL,
          action     TEXT NOT NULL DEFAULT 'cleared',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS profit_oxide_merge_clear_log_card_id_idx
        ON profit_oxide_merge_clear_log (card_id)
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
      // Who most recently set this pack's cost -- surfaced in the 409
      // conflict message (assertScalarUnchanged) so "someone else already
      // changed this" can name them instead of staying anonymous.
      await client.query(`
        ALTER TABLE profit_pack_costs ADD COLUMN IF NOT EXISTS updated_by_id INTEGER
      `);
      await client.query(`
        ALTER TABLE profit_pack_costs ADD COLUMN IF NOT EXISTS updated_by_name TEXT
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
      // Same "who wrote this" trail as profit_pack_costs above.
      await client.query(`
        ALTER TABLE profit_platform_pack_prices ADD COLUMN IF NOT EXISTS updated_by_id INTEGER
      `);
      await client.query(`
        ALTER TABLE profit_platform_pack_prices ADD COLUMN IF NOT EXISTS updated_by_name TEXT
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

// ── Optimistic conflict guard for order overrides ────────────────────────
// Same idea as gamedb-cell-writer.js's updateCell: before writing, lock the
// row (or its absence -- see the advisory lock below) and compare what's
// actually stored right now against the value the client had on screen when
// it started editing. Mismatch -> reject (409) instead of silently
// overwriting someone else's more recent edit; the client then offers
// "reload" or "save over it anyway" (retry with expected omitted), the same
// UX query-panel.js uses for cell edits.
//
// A plain `SELECT ... FOR UPDATE` can't catch two people racing to set the
// *first ever* override on the same order (there's no row yet to lock), so
// this also takes a session-scoped advisory lock keyed by (table, row id) --
// same idiom itune-entries-repository.js uses for claim acquisition.
const GOCASH_OVERRIDE_LOCK_NS = 90001;
const OXIDE_OVERRIDE_LOCK_NS = 90002;
const PACK_COST_LOCK_NS = 90003;
const PLATFORM_PRICE_LOCK_NS = 90004;
const WAVEPAY_OVERRIDE_LOCK_NS = 90005;
const DONSHOP_OVERRIDE_LOCK_NS = 90006;
const U9_OVERRIDE_LOCK_NS = 90007;
const GAMEPOINT_OVERRIDE_LOCK_NS = 90008;
const AGENH2H_OVERRIDE_LOCK_NS = 90009;
const CODARESELLER_OVERRIDE_LOCK_NS = 90010;
const NETEASE_OVERRIDE_LOCK_NS = 90011;
const TRUEMONEY_OVERRIDE_LOCK_NS = 90012;
const ATOM_OVERRIDE_LOCK_NS = 90013;
const SMARTSUN_OVERRIDE_LOCK_NS = 90014;

function assertOverrideUnchanged(before, expected, updatedByName) {
  if (!expected) return; // no baseline sent -- caller is forcing an overwrite
  const b = before || { saleAmount: null, cost: null, platform: null };
  const changed =
    (expected.saleAmount !== undefined && String(b.saleAmount ?? "") !== String(expected.saleAmount ?? "")) ||
    (expected.cost !== undefined && String(b.cost ?? "") !== String(expected.cost ?? "")) ||
    (expected.platform !== undefined && String(b.platform ?? "") !== String(expected.platform ?? ""));
  if (changed) {
    const who = updatedByName ? `โดย ${updatedByName}` : "โดยคนอื่น";
    const error = new Error(`ค่านี้ถูกแก้ไขไปแล้ว${who}หลังจากที่คุณเปิดดู — โหลดข้อมูลใหม่แล้วลองอีกครั้ง หรือจะบันทึกทับก็ได้`);
    error.status = 409;
    throw error;
  }
}

// Single-value variant of the same guard, for the shared pack-cost /
// platform-price tables -- their "current value" shown on screen already
// *is* the raw stored number (packCostSummary/platformPackPrices return it
// straight from profit_pack_costs/profit_platform_pack_prices with no
// blending), so there's just one field to compare instead of a
// {saleAmount, cost, platform} triple.
function assertScalarUnchanged(before, expected, label, updatedByName) {
  if (expected === undefined) return; // no baseline sent -- caller is forcing an overwrite
  if (String(before ?? "") === String(expected ?? "")) return;
  const who = updatedByName ? `โดย ${updatedByName}` : "โดยคนอื่น";
  const error = new Error(
    `${label}ของแพ็กนี้ถูกแก้ไขไปแล้ว${who} (ค่าปัจจุบัน: ${before ?? "ยังไม่ได้ตั้ง"}) — โหลดข้อมูลใหม่แล้วลองอีกครั้ง หรือจะบันทึกทับก็ได้`
  );
  error.status = 409;
  throw error;
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

export async function setGocashOverride(historyId, { saleAmount, cost, platform, expected }, actor) {
  await ensureSchema();
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 8000");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [GOCASH_OVERRIDE_LOCK_NS, Number(historyId)]);

    const { rows: beforeRows } = await client.query(
      `SELECT sale_amount, cost, platform, updated_by_name FROM profit_gocash_overrides WHERE history_id = $1`,
      [historyId]
    );
    const before = beforeRows[0]
      ? {
          saleAmount: Number(beforeRows[0].sale_amount),
          cost: beforeRows[0].cost == null ? null : Number(beforeRows[0].cost),
          platform: beforeRows[0].platform,
        }
      : null;
    assertOverrideUnchanged(before, expected, beforeRows[0]?.updated_by_name);

    const { rows } = await client.query(
      `INSERT INTO profit_gocash_overrides (history_id, sale_amount, cost, platform, updated_by_id, updated_by_name)
       VALUES ($1, $2, $3, $4, $8, $9)
       ON CONFLICT (history_id) DO UPDATE SET
         sale_amount = CASE WHEN $5 THEN EXCLUDED.sale_amount ELSE profit_gocash_overrides.sale_amount END,
         cost = CASE WHEN $6 THEN EXCLUDED.cost ELSE profit_gocash_overrides.cost END,
         platform = CASE WHEN $7 THEN EXCLUDED.platform ELSE profit_gocash_overrides.platform END,
         updated_by_id = $8,
         updated_by_name = $9
       RETURNING sale_amount, cost, platform`,
      [
        historyId,
        saleAmount !== undefined ? Number(saleAmount) || 0 : 0,
        cost !== undefined ? Number(cost) || 0 : null,
        platform !== undefined ? String(platform || "").trim() || null : null,
        saleAmount !== undefined,
        cost !== undefined,
        platform !== undefined,
        actor?.id ?? null,
        actorName,
      ]
    );
    await client.query("COMMIT");
    const row = rows[0];
    return {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ── Multi Game Card (oxide) cost/sale overrides ──────────────────────────
// Same shape/purpose as the GoCash overrides above, keyed by
// codashop_orders.id instead of a history-row id.
export async function listOxideOverrides() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT order_id, sale_amount, cost, platform FROM profit_oxide_overrides`);
  const byId = {};
  for (const row of rows) {
    byId[row.order_id] = {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  }
  return byId;
}

export async function setOxideOverride(orderId, { saleAmount, cost, platform, expected }, actor) {
  await ensureSchema();
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 8000");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [OXIDE_OVERRIDE_LOCK_NS, Number(orderId)]);

    const { rows: beforeRows } = await client.query(
      `SELECT sale_amount, cost, platform, updated_by_name FROM profit_oxide_overrides WHERE order_id = $1`,
      [orderId]
    );
    const before = beforeRows[0]
      ? {
          saleAmount: Number(beforeRows[0].sale_amount),
          cost: beforeRows[0].cost == null ? null : Number(beforeRows[0].cost),
          platform: beforeRows[0].platform,
        }
      : null;
    assertOverrideUnchanged(before, expected, beforeRows[0]?.updated_by_name);

    const { rows } = await client.query(
      `INSERT INTO profit_oxide_overrides (order_id, sale_amount, cost, platform, updated_by_id, updated_by_name)
       VALUES ($1, $2, $3, $4, $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET
         sale_amount = CASE WHEN $5 THEN EXCLUDED.sale_amount ELSE profit_oxide_overrides.sale_amount END,
         cost = CASE WHEN $6 THEN EXCLUDED.cost ELSE profit_oxide_overrides.cost END,
         platform = CASE WHEN $7 THEN EXCLUDED.platform ELSE profit_oxide_overrides.platform END,
         updated_by_id = $8,
         updated_by_name = $9
       RETURNING sale_amount, cost, platform`,
      [
        orderId,
        saleAmount !== undefined ? Number(saleAmount) || 0 : 0,
        cost !== undefined ? Number(cost) || 0 : null,
        platform !== undefined ? String(platform || "").trim() || null : null,
        saleAmount !== undefined,
        cost !== undefined,
        platform !== undefined,
        actor?.id ?? null,
        actorName,
      ]
    );
    await client.query("COMMIT");
    const row = rows[0];
    return {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ── WavePay cost/sale overrides ──────────────────────────────────────────
// Same shape/purpose as the Multi Game Card (oxide) overrides above, keyed
// by codashop_orders.id too.
export async function listWavepayOverrides() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT order_id, sale_amount, cost, platform FROM profit_wavepay_overrides`);
  const byId = {};
  for (const row of rows) {
    byId[row.order_id] = {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  }
  return byId;
}

export async function setWavepayOverride(orderId, { saleAmount, cost, platform, expected }, actor) {
  await ensureSchema();
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 8000");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [WAVEPAY_OVERRIDE_LOCK_NS, Number(orderId)]);

    const { rows: beforeRows } = await client.query(
      `SELECT sale_amount, cost, platform, updated_by_name FROM profit_wavepay_overrides WHERE order_id = $1`,
      [orderId]
    );
    const before = beforeRows[0]
      ? {
          saleAmount: Number(beforeRows[0].sale_amount),
          cost: beforeRows[0].cost == null ? null : Number(beforeRows[0].cost),
          platform: beforeRows[0].platform,
        }
      : null;
    assertOverrideUnchanged(before, expected, beforeRows[0]?.updated_by_name);

    const { rows } = await client.query(
      `INSERT INTO profit_wavepay_overrides (order_id, sale_amount, cost, platform, updated_by_id, updated_by_name)
       VALUES ($1, $2, $3, $4, $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET
         sale_amount = CASE WHEN $5 THEN EXCLUDED.sale_amount ELSE profit_wavepay_overrides.sale_amount END,
         cost = CASE WHEN $6 THEN EXCLUDED.cost ELSE profit_wavepay_overrides.cost END,
         platform = CASE WHEN $7 THEN EXCLUDED.platform ELSE profit_wavepay_overrides.platform END,
         updated_by_id = $8,
         updated_by_name = $9
       RETURNING sale_amount, cost, platform`,
      [
        orderId,
        saleAmount !== undefined ? Number(saleAmount) || 0 : 0,
        cost !== undefined ? Number(cost) || 0 : null,
        platform !== undefined ? String(platform || "").trim() || null : null,
        saleAmount !== undefined,
        cost !== undefined,
        platform !== undefined,
        actor?.id ?? null,
        actorName,
      ]
    );
    await client.query("COMMIT");
    const row = rows[0];
    return {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ── DonShop cost/sale overrides ──────────────────────────────────────────
export async function listDonshopOverrides() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT order_id, sale_amount, cost, platform FROM profit_donshop_overrides`);
  const byId = {};
  for (const row of rows) {
    byId[row.order_id] = {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  }
  return byId;
}

export async function setDonshopOverride(orderId, { saleAmount, cost, platform, expected }, actor) {
  await ensureSchema();
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 8000");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [DONSHOP_OVERRIDE_LOCK_NS, Number(orderId)]);

    const { rows: beforeRows } = await client.query(
      `SELECT sale_amount, cost, platform, updated_by_name FROM profit_donshop_overrides WHERE order_id = $1`,
      [orderId]
    );
    const before = beforeRows[0]
      ? {
          saleAmount: Number(beforeRows[0].sale_amount),
          cost: beforeRows[0].cost == null ? null : Number(beforeRows[0].cost),
          platform: beforeRows[0].platform,
        }
      : null;
    assertOverrideUnchanged(before, expected, beforeRows[0]?.updated_by_name);

    const { rows } = await client.query(
      `INSERT INTO profit_donshop_overrides (order_id, sale_amount, cost, platform, updated_by_id, updated_by_name)
       VALUES ($1, $2, $3, $4, $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET
         sale_amount = CASE WHEN $5 THEN EXCLUDED.sale_amount ELSE profit_donshop_overrides.sale_amount END,
         cost = CASE WHEN $6 THEN EXCLUDED.cost ELSE profit_donshop_overrides.cost END,
         platform = CASE WHEN $7 THEN EXCLUDED.platform ELSE profit_donshop_overrides.platform END,
         updated_by_id = $8,
         updated_by_name = $9
       RETURNING sale_amount, cost, platform`,
      [
        orderId,
        saleAmount !== undefined ? Number(saleAmount) || 0 : 0,
        cost !== undefined ? Number(cost) || 0 : null,
        platform !== undefined ? String(platform || "").trim() || null : null,
        saleAmount !== undefined,
        cost !== undefined,
        platform !== undefined,
        actor?.id ?? null,
        actorName,
      ]
    );
    await client.query("COMMIT");
    const row = rows[0];
    return {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ── U9 (Ooredoo) cost/sale overrides ─────────────────────────────────────
export async function listU9Overrides() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT order_id, sale_amount, cost, platform FROM profit_u9_overrides`);
  const byId = {};
  for (const row of rows) {
    byId[row.order_id] = {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  }
  return byId;
}

export async function setU9Override(orderId, { saleAmount, cost, platform, expected }, actor) {
  await ensureSchema();
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 8000");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [U9_OVERRIDE_LOCK_NS, Number(orderId)]);

    const { rows: beforeRows } = await client.query(
      `SELECT sale_amount, cost, platform, updated_by_name FROM profit_u9_overrides WHERE order_id = $1`,
      [orderId]
    );
    const before = beforeRows[0]
      ? {
          saleAmount: Number(beforeRows[0].sale_amount),
          cost: beforeRows[0].cost == null ? null : Number(beforeRows[0].cost),
          platform: beforeRows[0].platform,
        }
      : null;
    assertOverrideUnchanged(before, expected, beforeRows[0]?.updated_by_name);

    const { rows } = await client.query(
      `INSERT INTO profit_u9_overrides (order_id, sale_amount, cost, platform, updated_by_id, updated_by_name)
       VALUES ($1, $2, $3, $4, $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET
         sale_amount = CASE WHEN $5 THEN EXCLUDED.sale_amount ELSE profit_u9_overrides.sale_amount END,
         cost = CASE WHEN $6 THEN EXCLUDED.cost ELSE profit_u9_overrides.cost END,
         platform = CASE WHEN $7 THEN EXCLUDED.platform ELSE profit_u9_overrides.platform END,
         updated_by_id = $8,
         updated_by_name = $9
       RETURNING sale_amount, cost, platform`,
      [
        orderId,
        saleAmount !== undefined ? Number(saleAmount) || 0 : 0,
        cost !== undefined ? Number(cost) || 0 : null,
        platform !== undefined ? String(platform || "").trim() || null : null,
        saleAmount !== undefined,
        cost !== undefined,
        platform !== undefined,
        actor?.id ?? null,
        actorName,
      ]
    );
    await client.query("COMMIT");
    const row = rows[0];
    return {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ── Game Point Club cost/sale overrides ──────────────────────────────────
export async function listGamepointOverrides() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT order_id, sale_amount, cost, platform FROM profit_gamepoint_overrides`);
  const byId = {};
  for (const row of rows) {
    byId[row.order_id] = {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  }
  return byId;
}

export async function setGamepointOverride(orderId, { saleAmount, cost, platform, expected }, actor) {
  await ensureSchema();
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 8000");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [GAMEPOINT_OVERRIDE_LOCK_NS, Number(orderId)]);

    const { rows: beforeRows } = await client.query(
      `SELECT sale_amount, cost, platform, updated_by_name FROM profit_gamepoint_overrides WHERE order_id = $1`,
      [orderId]
    );
    const before = beforeRows[0]
      ? {
          saleAmount: Number(beforeRows[0].sale_amount),
          cost: beforeRows[0].cost == null ? null : Number(beforeRows[0].cost),
          platform: beforeRows[0].platform,
        }
      : null;
    assertOverrideUnchanged(before, expected, beforeRows[0]?.updated_by_name);

    const { rows } = await client.query(
      `INSERT INTO profit_gamepoint_overrides (order_id, sale_amount, cost, platform, updated_by_id, updated_by_name)
       VALUES ($1, $2, $3, $4, $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET
         sale_amount = CASE WHEN $5 THEN EXCLUDED.sale_amount ELSE profit_gamepoint_overrides.sale_amount END,
         cost = CASE WHEN $6 THEN EXCLUDED.cost ELSE profit_gamepoint_overrides.cost END,
         platform = CASE WHEN $7 THEN EXCLUDED.platform ELSE profit_gamepoint_overrides.platform END,
         updated_by_id = $8,
         updated_by_name = $9
       RETURNING sale_amount, cost, platform`,
      [
        orderId,
        saleAmount !== undefined ? Number(saleAmount) || 0 : 0,
        cost !== undefined ? Number(cost) || 0 : null,
        platform !== undefined ? String(platform || "").trim() || null : null,
        saleAmount !== undefined,
        cost !== undefined,
        platform !== undefined,
        actor?.id ?? null,
        actorName,
      ]
    );
    await client.query("COMMIT");
    const row = rows[0];
    return {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ── Agen H2H cost/sale overrides ─────────────────────────────────────────
export async function listAgenh2hOverrides() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT order_id, sale_amount, cost, platform FROM profit_agenh2h_overrides`);
  const byId = {};
  for (const row of rows) {
    byId[row.order_id] = {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  }
  return byId;
}

export async function setAgenh2hOverride(orderId, { saleAmount, cost, platform, expected }, actor) {
  await ensureSchema();
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 8000");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [AGENH2H_OVERRIDE_LOCK_NS, Number(orderId)]);

    const { rows: beforeRows } = await client.query(
      `SELECT sale_amount, cost, platform, updated_by_name FROM profit_agenh2h_overrides WHERE order_id = $1`,
      [orderId]
    );
    const before = beforeRows[0]
      ? {
          saleAmount: Number(beforeRows[0].sale_amount),
          cost: beforeRows[0].cost == null ? null : Number(beforeRows[0].cost),
          platform: beforeRows[0].platform,
        }
      : null;
    assertOverrideUnchanged(before, expected, beforeRows[0]?.updated_by_name);

    const { rows } = await client.query(
      `INSERT INTO profit_agenh2h_overrides (order_id, sale_amount, cost, platform, updated_by_id, updated_by_name)
       VALUES ($1, $2, $3, $4, $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET
         sale_amount = CASE WHEN $5 THEN EXCLUDED.sale_amount ELSE profit_agenh2h_overrides.sale_amount END,
         cost = CASE WHEN $6 THEN EXCLUDED.cost ELSE profit_agenh2h_overrides.cost END,
         platform = CASE WHEN $7 THEN EXCLUDED.platform ELSE profit_agenh2h_overrides.platform END,
         updated_by_id = $8,
         updated_by_name = $9
       RETURNING sale_amount, cost, platform`,
      [
        orderId,
        saleAmount !== undefined ? Number(saleAmount) || 0 : 0,
        cost !== undefined ? Number(cost) || 0 : null,
        platform !== undefined ? String(platform || "").trim() || null : null,
        saleAmount !== undefined,
        cost !== undefined,
        platform !== undefined,
        actor?.id ?? null,
        actorName,
      ]
    );
    await client.query("COMMIT");
    const row = rows[0];
    return {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ── Codareseller (CodashopUSD) cost/sale overrides ───────────────────────
export async function listCodaresellerOverrides() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT order_id, sale_amount, cost, platform FROM profit_codareseller_overrides`);
  const byId = {};
  for (const row of rows) {
    byId[row.order_id] = {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  }
  return byId;
}

export async function setCodaresellerOverride(orderId, { saleAmount, cost, platform, expected }, actor) {
  await ensureSchema();
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 8000");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [CODARESELLER_OVERRIDE_LOCK_NS, Number(orderId)]);

    const { rows: beforeRows } = await client.query(
      `SELECT sale_amount, cost, platform, updated_by_name FROM profit_codareseller_overrides WHERE order_id = $1`,
      [orderId]
    );
    const before = beforeRows[0]
      ? {
          saleAmount: Number(beforeRows[0].sale_amount),
          cost: beforeRows[0].cost == null ? null : Number(beforeRows[0].cost),
          platform: beforeRows[0].platform,
        }
      : null;
    assertOverrideUnchanged(before, expected, beforeRows[0]?.updated_by_name);

    const { rows } = await client.query(
      `INSERT INTO profit_codareseller_overrides (order_id, sale_amount, cost, platform, updated_by_id, updated_by_name)
       VALUES ($1, $2, $3, $4, $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET
         sale_amount = CASE WHEN $5 THEN EXCLUDED.sale_amount ELSE profit_codareseller_overrides.sale_amount END,
         cost = CASE WHEN $6 THEN EXCLUDED.cost ELSE profit_codareseller_overrides.cost END,
         platform = CASE WHEN $7 THEN EXCLUDED.platform ELSE profit_codareseller_overrides.platform END,
         updated_by_id = $8,
         updated_by_name = $9
       RETURNING sale_amount, cost, platform`,
      [
        orderId,
        saleAmount !== undefined ? Number(saleAmount) || 0 : 0,
        cost !== undefined ? Number(cost) || 0 : null,
        platform !== undefined ? String(platform || "").trim() || null : null,
        saleAmount !== undefined,
        cost !== undefined,
        platform !== undefined,
        actor?.id ?? null,
        actorName,
      ]
    );
    await client.query("COMMIT");
    const row = rows[0];
    return {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ── Netease (netease_purchase_history) cost/sale overrides ────────────────
export async function listNeteaseOverrides() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT order_id, sale_amount, cost, platform FROM profit_netease_overrides`);
  const byId = {};
  for (const row of rows) {
    byId[row.order_id] = {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  }
  return byId;
}

export async function setNeteaseOverride(orderId, { saleAmount, cost, platform, expected }, actor) {
  await ensureSchema();
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 8000");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [NETEASE_OVERRIDE_LOCK_NS, Number(orderId)]);

    const { rows: beforeRows } = await client.query(
      `SELECT sale_amount, cost, platform, updated_by_name FROM profit_netease_overrides WHERE order_id = $1`,
      [orderId]
    );
    const before = beforeRows[0]
      ? {
          saleAmount: Number(beforeRows[0].sale_amount),
          cost: beforeRows[0].cost == null ? null : Number(beforeRows[0].cost),
          platform: beforeRows[0].platform,
        }
      : null;
    assertOverrideUnchanged(before, expected, beforeRows[0]?.updated_by_name);

    const { rows } = await client.query(
      `INSERT INTO profit_netease_overrides (order_id, sale_amount, cost, platform, updated_by_id, updated_by_name)
       VALUES ($1, $2, $3, $4, $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET
         sale_amount = CASE WHEN $5 THEN EXCLUDED.sale_amount ELSE profit_netease_overrides.sale_amount END,
         cost = CASE WHEN $6 THEN EXCLUDED.cost ELSE profit_netease_overrides.cost END,
         platform = CASE WHEN $7 THEN EXCLUDED.platform ELSE profit_netease_overrides.platform END,
         updated_by_id = $8,
         updated_by_name = $9
       RETURNING sale_amount, cost, platform`,
      [
        orderId,
        saleAmount !== undefined ? Number(saleAmount) || 0 : 0,
        cost !== undefined ? Number(cost) || 0 : null,
        platform !== undefined ? String(platform || "").trim() || null : null,
        saleAmount !== undefined,
        cost !== undefined,
        platform !== undefined,
        actor?.id ?? null,
        actorName,
      ]
    );
    await client.query("COMMIT");
    const row = rows[0];
    return {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listPhoneChannelOverrides(table) {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT order_id, sale_amount, cost, platform FROM ${table}`);
  const byId = {};
  for (const row of rows) {
    byId[row.order_id] = {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  }
  return byId;
}

async function setPhoneChannelOverride(table, lockNs, orderId, { saleAmount, cost, platform, expected }, actor) {
  await ensureSchema();
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 8000");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [lockNs, Number(orderId)]);

    const { rows: beforeRows } = await client.query(
      `SELECT sale_amount, cost, platform, updated_by_name FROM ${table} WHERE order_id = $1`,
      [orderId]
    );
    const before = beforeRows[0]
      ? {
          saleAmount: Number(beforeRows[0].sale_amount),
          cost: beforeRows[0].cost == null ? null : Number(beforeRows[0].cost),
          platform: beforeRows[0].platform,
        }
      : null;
    assertOverrideUnchanged(before, expected, beforeRows[0]?.updated_by_name);

    const { rows } = await client.query(
      `INSERT INTO ${table} (order_id, sale_amount, cost, platform, updated_by_id, updated_by_name)
       VALUES ($1, $2, $3, $4, $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET
         sale_amount = CASE WHEN $5 THEN EXCLUDED.sale_amount ELSE ${table}.sale_amount END,
         cost = CASE WHEN $6 THEN EXCLUDED.cost ELSE ${table}.cost END,
         platform = CASE WHEN $7 THEN EXCLUDED.platform ELSE ${table}.platform END,
         updated_by_id = $8,
         updated_by_name = $9
       RETURNING sale_amount, cost, platform`,
      [
        orderId,
        saleAmount !== undefined ? Number(saleAmount) || 0 : 0,
        cost !== undefined ? Number(cost) || 0 : null,
        platform !== undefined ? String(platform || "").trim() || null : null,
        saleAmount !== undefined,
        cost !== undefined,
        platform !== undefined,
        actor?.id ?? null,
        actorName,
      ]
    );
    await client.query("COMMIT");
    const row = rows[0];
    return {
      saleAmount: Number(row.sale_amount),
      cost: row.cost == null ? null : Number(row.cost),
      platform: row.platform || null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ── TrueMoney / ATOM / Smart-Sun (codashop_auto_api) overrides ────────────
export async function listTruemoneyOverrides() {
  return listPhoneChannelOverrides("profit_truemoney_overrides");
}
export async function setTruemoneyOverride(orderId, body, actor) {
  return setPhoneChannelOverride("profit_truemoney_overrides", TRUEMONEY_OVERRIDE_LOCK_NS, orderId, body, actor);
}
export async function listAtomOverrides() {
  return listPhoneChannelOverrides("profit_atom_overrides");
}
export async function setAtomOverride(orderId, body, actor) {
  return setPhoneChannelOverride("profit_atom_overrides", ATOM_OVERRIDE_LOCK_NS, orderId, body, actor);
}
export async function listSmartsunOverrides() {
  return listPhoneChannelOverrides("profit_smartsun_overrides");
}
export async function setSmartsunOverride(orderId, body, actor) {
  return setPhoneChannelOverride("profit_smartsun_overrides", SMARTSUN_OVERRIDE_LOCK_NS, orderId, body, actor);
}

// ── Multi Game Card (oxide) merge-cleared marks ──────────────────────────
// Same shape/purpose as the GoCash dust-cleared marks below, for the
// "ต้องรวมบัตร" worklist (idle cards -- see isIdle in profit-aggregate.js).
export async function listOxideMergeCleared() {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT card_id, cleared_at, cleared_by_id, cleared_by_name FROM profit_oxide_merge_cleared`
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

export async function setOxideMergeCleared(cardId, cleared, actor) {
  await ensureSchema();
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  if (cleared) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO profit_oxide_merge_cleared (card_id, cleared_at, cleared_by_id, cleared_by_name)
         VALUES ($1, NOW(), $2, $3)
         ON CONFLICT (card_id) DO UPDATE SET
           cleared_at = EXCLUDED.cleared_at,
           cleared_by_id = EXCLUDED.cleared_by_id,
           cleared_by_name = EXCLUDED.cleared_by_name
         RETURNING cleared_at, cleared_by_id, cleared_by_name`,
        [cardId, actor?.id ?? null, actorName]
      );
      await client.query(
        `INSERT INTO profit_oxide_merge_clear_log (card_id, user_id, user_name, action) VALUES ($1, $2, $3, 'cleared')`,
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
    await client.query(`DELETE FROM profit_oxide_merge_cleared WHERE card_id = $1`, [cardId]);
    await client.query(
      `INSERT INTO profit_oxide_merge_clear_log (card_id, user_id, user_name, action) VALUES ($1, $2, $3, 'uncleared')`,
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

export async function listOxideMergeClearLog(cardId) {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT user_id, user_name, action, created_at FROM profit_oxide_merge_clear_log
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

export async function setPackCost(source, packName, cost, expected, actor) {
  await ensureSchema();
  const src = String(source || "").trim();
  const name = String(packName || "").trim();
  if (!src || !name) throw new Error("source and packName required");
  const n = Number(cost);
  if (!Number.isFinite(n)) throw new Error("invalid cost");
  const key = `${src}:${name}`;
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 8000");
    await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [PACK_COST_LOCK_NS, key]);

    const { rows } = await client.query(`SELECT cost, updated_by_name FROM profit_pack_costs WHERE pack_key = $1`, [key]);
    const before = rows[0] ? Number(rows[0].cost) : null;
    assertScalarUnchanged(before, expected, "ต้นทุน", rows[0]?.updated_by_name);

    await client.query(
      `INSERT INTO profit_pack_costs (pack_key, cost, updated_by_id, updated_by_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (pack_key) DO UPDATE SET cost = EXCLUDED.cost, updated_by_id = EXCLUDED.updated_by_id, updated_by_name = EXCLUDED.updated_by_name`,
      [key, n, actor?.id ?? null, actorName]
    );
    await client.query("COMMIT");
    return n;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
  const plat = platformStorageKey(platform);
  const { rows } = await getPool().query(
    `SELECT pack_key, price FROM profit_platform_pack_prices WHERE platform = $1`,
    [plat]
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
    const plat = platformStorageKey(row.platform);
    if (!byPlatform[plat]) byPlatform[plat] = {};
    byPlatform[plat][row.pack_key] = Number(row.price);
  }
  return byPlatform;
}

export async function setPlatformPrice(platform, source, packName, price, expected, actor) {
  await ensureSchema();
  const plat = platformStorageKey(platform);
  const src = String(source || "").trim();
  const name = String(packName || "").trim();
  if (!plat || !src || !name) throw new Error("platform, source and packName required");
  const n = Number(price);
  if (!Number.isFinite(n)) throw new Error("invalid price");
  const key = `${src}:${name}`;
  const actorName = actor?.displayName || actor?.username || "ไม่ทราบชื่อ";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 8000");
    await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [PLATFORM_PRICE_LOCK_NS, `${plat}:${key}`]);

    const { rows } = await client.query(
      `SELECT price, updated_by_name FROM profit_platform_pack_prices WHERE platform = $1 AND pack_key = $2`,
      [plat, key]
    );
    const before = rows[0] ? Number(rows[0].price) : null;
    assertScalarUnchanged(before, expected, "ราคาขาย", rows[0]?.updated_by_name);

    await client.query(
      `INSERT INTO profit_platform_pack_prices (platform, pack_key, price, updated_by_id, updated_by_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (platform, pack_key) DO UPDATE SET price = EXCLUDED.price, updated_by_id = EXCLUDED.updated_by_id, updated_by_name = EXCLUDED.updated_by_name`,
      [plat, key, n, actor?.id ?? null, actorName]
    );
    await client.query("COMMIT");
    return n;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Clears every price entry for one platform -- back to "ยังไม่ได้ตั้ง" for
// every pack, not zeroed (a 0 price would still count as "priced" and would
// wrongly zero out sale/profit for any order pulling from it).
export async function resetPlatformPrices(platform) {
  await ensureSchema();
  const plat = platformStorageKey(platform);
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
