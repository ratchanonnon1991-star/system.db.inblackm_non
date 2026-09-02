import { getPoolForConnection } from "@/lib/db";
import {
  GAMEINFO_COMPARE_PAGE_SIZE,
  GAMEINFO_MARKETS,
  calculateGameinfoPriceDifference,
  gameinfoMappingViewModes,
  normalizeGameinfoMappingViewMode,
  normalizeGameinfoMarket,
  normalizeMarketIdentityPart,
  reconcileGameinfoPackMappingTargets,
  selectGameinfoCompareSellerKeys,
} from "@/lib/gameinfo-market-system";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";
import { fetchNormalizedGameinfoMarketCatalog, listGameinfoMarketGames } from "@/server/gameinfo-market-providers";
import { getGamelistPacks } from "@/server/gameinfo-gamelist-packs";
import { getGameinfoModeData } from "@/server/gameinfo-mode-data";
import { getGameListRow, listGameListRows } from "@/server/gameinfo-gamelist";
import { getGameinfoFormulaVariables } from "@/server/gameinfo-formula-variables";
import { getGameinfoExchangeRates } from "@/server/gameinfo-exchange-rates";
import { buildGameinfoMarketPackPriceMap, findGameinfoMarketPriceColumn } from "@/lib/gameinfo-market-prices";

const CONNECTION_NAME = "gameinfo";
const runners = globalThis.__gameinfoMarketRunners || new Map();
globalThis.__gameinfoMarketRunners = runners;
let schemaReady = null;

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function getConnection() {
  const connections = await listConnections();
  const match = connections.find((connection) => connection.name.trim().toLowerCase() === CONNECTION_NAME);
  return match ? findConnectionWithSecret(match.id) : null;
}

async function ensureSchema(pool) {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS gameinfo_game_markets (
        game_id INTEGER NOT NULL,
        data_mode VARCHAR(16) NOT NULL CHECK (data_mode IN ('uid', 'idpass')),
        market VARCHAR(16) NOT NULL CHECK (market IN ('kaleoz', 'itemku', 'playerok', 'g2g')),
        external_game_key TEXT NOT NULL DEFAULT '',
        external_game_label TEXT NOT NULL DEFAULT '',
        product_type TEXT NOT NULL DEFAULT '',
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        version BIGINT NOT NULL DEFAULT 1,
        updated_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (game_id, data_mode, market)
      );
      CREATE INDEX IF NOT EXISTS gameinfo_game_markets_enabled_idx
        ON gameinfo_game_markets (market, enabled, game_id);
      -- Which pack column holds this market's price. Turning a market on used
      -- to append a market_<market> column that could never be deleted; now a
      -- game points at a column it already has. Empty means the old behaviour,
      -- so mappings made before this still resolve.
      ALTER TABLE gameinfo_game_markets
        ADD COLUMN IF NOT EXISTS price_column_key VARCHAR(64) NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS gameinfo_market_catalog_packs (
        market VARCHAR(16) NOT NULL CHECK (market IN ('kaleoz', 'itemku', 'playerok', 'g2g')),
        external_game_key TEXT NOT NULL,
        external_pack_key TEXT NOT NULL,
        identity_signature TEXT NOT NULL,
        listing_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        amount TEXT NOT NULL DEFAULT '',
        product_type TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (market, external_game_key, external_pack_key)
      );
      CREATE INDEX IF NOT EXISTS gameinfo_market_catalog_search_idx
        ON gameinfo_market_catalog_packs (market, external_game_key, active, sort_order);
      ALTER TABLE gameinfo_market_catalog_packs ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS gameinfo_market_offers (
        market VARCHAR(16) NOT NULL,
        external_game_key TEXT NOT NULL,
        external_pack_key TEXT NOT NULL,
        seller_key TEXT NOT NULL,
        seller_name TEXT NOT NULL,
        listing_id TEXT NOT NULL DEFAULT '',
        price NUMERIC(20,6) NOT NULL,
        currency VARCHAR(12) NOT NULL DEFAULT '',
        product_url TEXT NOT NULL DEFAULT '',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (market, external_game_key, external_pack_key, seller_key)
      );
      CREATE INDEX IF NOT EXISTS gameinfo_market_offers_seller_idx
        ON gameinfo_market_offers (market, external_game_key, seller_key);

      CREATE TABLE IF NOT EXISTS gameinfo_market_mappings (
        game_id INTEGER NOT NULL,
        data_mode VARCHAR(16) NOT NULL CHECK (data_mode IN ('uid', 'idpass')),
        market VARCHAR(16) NOT NULL CHECK (market IN ('kaleoz', 'itemku', 'playerok', 'g2g')),
        pack_id TEXT NOT NULL,
        gameinfo_pack_name TEXT NOT NULL DEFAULT '',
        external_game_key TEXT NOT NULL,
        external_pack_key TEXT NOT NULL,
        identity_signature TEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale')),
        version BIGINT NOT NULL DEFAULT 1,
        updated_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (game_id, data_mode, market, pack_id),
        UNIQUE (game_id, data_mode, market, external_game_key, external_pack_key)
      );
      CREATE INDEX IF NOT EXISTS gameinfo_market_mappings_external_idx
        ON gameinfo_market_mappings (market, external_game_key, external_pack_key);
      ALTER TABLE gameinfo_market_mappings ADD COLUMN IF NOT EXISTS gameinfo_pack_name TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS gameinfo_market_mapping_logs (
        id BIGSERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL,
        data_mode VARCHAR(16) NOT NULL,
        market VARCHAR(16) NOT NULL,
        pack_id TEXT NOT NULL,
        actor_id INTEGER,
        action VARCHAR(16) NOT NULL,
        before_data JSONB,
        after_data JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS gameinfo_market_own_sellers (
        market VARCHAR(16) NOT NULL CHECK (market IN ('kaleoz', 'itemku', 'playerok', 'g2g')),
        seller_key TEXT NOT NULL,
        seller_name TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (market, seller_key)
      );
      ALTER TABLE gameinfo_market_own_sellers
        DROP CONSTRAINT IF EXISTS gameinfo_market_own_sellers_market_check;
      ALTER TABLE gameinfo_market_own_sellers
        ADD CONSTRAINT gameinfo_market_own_sellers_market_check
        CHECK (market IN ('kaleoz', 'itemku', 'playerok', 'g2g'));

      CREATE TABLE IF NOT EXISTS gameinfo_market_rate_references (
        market VARCHAR(16) NOT NULL,
        external_game_key TEXT NOT NULL,
        external_game_label TEXT NOT NULL DEFAULT '',
        reference_at TIMESTAMPTZ NOT NULL,
        updated_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (market, external_game_key)
      );

      CREATE TABLE IF NOT EXISTS gameinfo_market_check_runs (
        id BIGSERIAL PRIMARY KEY,
        market VARCHAR(16) NOT NULL CHECK (market IN ('kaleoz', 'itemku', 'playerok', 'g2g')),
        trigger_type VARCHAR(16) NOT NULL CHECK (trigger_type IN ('manual', 'scheduled')),
        status VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed')),
        requested_by INTEGER,
        total_games INTEGER NOT NULL DEFAULT 0,
        completed_games INTEGER NOT NULL DEFAULT 0,
        failed_games INTEGER NOT NULL DEFAULT 0,
        alerts_opened INTEGER NOT NULL DEFAULT 0,
        error TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS gameinfo_market_check_single_flight_idx
        ON gameinfo_market_check_runs (market) WHERE status IN ('queued', 'running');

      CREATE TABLE IF NOT EXISTS gameinfo_market_check_run_games (
        run_id BIGINT NOT NULL,
        game_id INTEGER NOT NULL,
        data_mode VARCHAR(16) NOT NULL,
        status VARCHAR(16) NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
        mapped_count INTEGER NOT NULL DEFAULT 0,
        alert_count INTEGER NOT NULL DEFAULT 0,
        error TEXT NOT NULL DEFAULT '',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        PRIMARY KEY (run_id, game_id, data_mode)
      );

      CREATE TABLE IF NOT EXISTS gameinfo_price_alerts (
        id BIGSERIAL PRIMARY KEY,
        market VARCHAR(16) NOT NULL,
        game_id INTEGER NOT NULL,
        data_mode VARCHAR(16) NOT NULL,
        pack_id TEXT NOT NULL,
        seller_key TEXT NOT NULL,
        seller_name TEXT NOT NULL,
        kind VARCHAR(24) NOT NULL,
        direction VARCHAR(24) NOT NULL,
        base_price NUMERIC(20,6),
        market_price NUMERIC(20,6),
        difference NUMERIC(20,6),
        percent NUMERIC(12,6),
        status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
        first_seen_run_id BIGINT,
        last_seen_run_id BIGINT,
        resolved_run_id BIGINT,
        acknowledged_by INTEGER,
        acknowledged_at TIMESTAMPTZ,
        note TEXT NOT NULL DEFAULT '',
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        UNIQUE (market, game_id, data_mode, pack_id, seller_key)
      );
      CREATE INDEX IF NOT EXISTS gameinfo_price_alerts_status_idx
        ON gameinfo_price_alerts (status, market, last_seen_at DESC);
      ALTER TABLE gameinfo_price_alerts ALTER COLUMN first_seen_run_id DROP NOT NULL;
      ALTER TABLE gameinfo_price_alerts ALTER COLUMN last_seen_run_id DROP NOT NULL;

      CREATE TABLE IF NOT EXISTS gameinfo_price_alert_events (
        id BIGSERIAL PRIMARY KEY,
        alert_id BIGINT NOT NULL,
        run_id BIGINT,
        event_type VARCHAR(16) NOT NULL CHECK (event_type IN ('opened', 'seen', 'resolved', 'acknowledged')),
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        actor_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS gameinfo_price_alert_events_alert_idx
        ON gameinfo_price_alert_events (alert_id, created_at DESC);
    `).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export async function getGameinfoMarketPool() {
  const connection = await getConnection();
  if (!connection) throw httpError(`ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}"`, 503);
  const pool = getPoolForConnection(connection);
  await ensureSchema(pool);
  return pool;
}

function mode(value) {
  return normalizeGameinfoDataMode(value);
}

function positiveInt(value, fallback = 1, max = 10000) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}

function actorId(actor) {
  const id = Number(actor?.id ?? actor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function mapGameMarket(row) {
  return {
    gameId: Number(row.game_id),
    dataMode: row.data_mode,
    market: row.market,
    externalGameKey: row.external_game_key,
    externalGameLabel: row.external_game_label,
    productType: row.product_type,
    enabled: row.enabled,
    priceColumnKey: row.price_column_key || "",
    version: Number(row.version),
    updatedAt: row.updated_at,
  };
}

export async function listGameinfoGameMarkets(gameId, dataMode = "uid") {
  const normalizedMode = mode(dataMode);
  const result = await (await getGameinfoMarketPool()).query(
    `SELECT * FROM gameinfo_game_markets WHERE game_id = $1 AND data_mode = $2`,
    [gameId, normalizedMode]
  );
  const saved = new Map(result.rows.map((row) => [row.market, mapGameMarket(row)]));
  return GAMEINFO_MARKETS.map((market) => saved.get(market.key) || {
    gameId: Number(gameId), dataMode: normalizedMode, market: market.key,
    externalGameKey: "", externalGameLabel: "", productType: "", enabled: false, priceColumnKey: "", version: 0,
  });
}

export async function saveGameinfoGameMarket(gameId, dataMode, market, input, actor) {
  const normalizedMarket = normalizeGameinfoMarket(market);
  const normalizedMode = mode(dataMode);
  const externalGameKey = String(input?.externalGameKey || "").trim().slice(0, 200);
  const enabled = input?.enabled === true;
  const priceColumnKey = String(input?.priceColumnKey || "").trim().slice(0, 64);
  if (enabled && !externalGameKey) throw httpError("กรุณาเลือกเกมของ Market");
  const pool = await getGameinfoMarketPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT * FROM gameinfo_game_markets WHERE game_id = $1 AND data_mode = $2 AND market = $3 FOR UPDATE`,
      [gameId, normalizedMode, normalizedMarket]
    );
    const version = Number(current.rows[0]?.version) || 0;
    if (input?.version !== undefined && Number(input.version) !== version) throw httpError("การตั้งค่า Market ถูกแก้โดยผู้ใช้อื่น", 409);
    const result = await client.query(
      `INSERT INTO gameinfo_game_markets
         (game_id, data_mode, market, external_game_key, external_game_label, product_type, enabled, price_column_key, version, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9)
       ON CONFLICT (game_id, data_mode, market) DO UPDATE SET
         external_game_key = EXCLUDED.external_game_key,
         external_game_label = EXCLUDED.external_game_label,
         product_type = EXCLUDED.product_type,
         enabled = EXCLUDED.enabled,
         price_column_key = EXCLUDED.price_column_key,
         version = gameinfo_game_markets.version + 1,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [gameId, normalizedMode, normalizedMarket, externalGameKey,
        String(input?.externalGameLabel || externalGameKey).trim().slice(0, 255),
        String(input?.productType || "").trim().slice(0, 160), enabled, priceColumnKey, actorId(actor)]
    );
    await client.query("COMMIT");
    return mapGameMarket(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listGameinfoMarketsOverview(dataMode = "uid") {
  const normalizedMode = mode(dataMode);
  const [games, configs] = await Promise.all([
    listGameListRows(),
    (await getGameinfoMarketPool()).query(`SELECT * FROM gameinfo_game_markets WHERE data_mode = $1`, [normalizedMode]),
  ]);
  const byGame = new Map();
  for (const row of configs.rows) {
    const items = byGame.get(Number(row.game_id)) || [];
    items.push(mapGameMarket(row));
    byGame.set(Number(row.game_id), items);
  }
  return games.map((game) => ({ id: game.id, game: game.game, markets: byGame.get(game.id) || [] }));
}

export async function getGameinfoMarketGameOptions(market) {
  return listGameinfoMarketGames(normalizeGameinfoMarket(market));
}

export async function upsertGameinfoMarketCatalog(catalog, client = null) {
  const pool = client ? null : await getGameinfoMarketPool();
  const db = client || await pool.connect();
  try {
    if (!client) await db.query("BEGIN");
    // A refresh only owns the product type it just fetched. uid and idpass can
    // share one external game key with different categories (Kaleoz splits UID
    // and LOGIN packs that way), so a run must not retire the other mode's
    // packs. Rows written before product_type existed carry '' and are folded
    // into the first run that touches them.
    const productType = String(catalog.productType || "");
    await db.query(
      `UPDATE gameinfo_market_catalog_packs SET active = FALSE
       WHERE market = $1 AND external_game_key = $2 AND product_type IN ($3, '')`,
      [catalog.market, catalog.externalGameKey, productType]
    );
    await db.query(
      `DELETE FROM gameinfo_market_offers o
       USING gameinfo_market_catalog_packs c
       WHERE o.market = $1 AND o.external_game_key = $2
         AND c.market = o.market AND c.external_game_key = o.external_game_key
         AND c.external_pack_key = o.external_pack_key AND c.product_type IN ($3, '')`,
      [catalog.market, catalog.externalGameKey, productType]
    );
    for (const pack of catalog.packs) {
      await db.query(
        `INSERT INTO gameinfo_market_catalog_packs
           (market, external_game_key, external_pack_key, identity_signature, listing_id, name,
            normalized_name, category, amount, product_type, sort_order, metadata, active, last_seen_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,$13)
         ON CONFLICT (market, external_game_key, external_pack_key) DO UPDATE SET
           identity_signature = EXCLUDED.identity_signature, listing_id = EXCLUDED.listing_id,
           name = EXCLUDED.name, normalized_name = EXCLUDED.normalized_name,
           category = EXCLUDED.category, amount = EXCLUDED.amount,
           product_type = EXCLUDED.product_type, sort_order = EXCLUDED.sort_order,
           metadata = EXCLUDED.metadata, active = TRUE, last_seen_at = EXCLUDED.last_seen_at`,
        [catalog.market, catalog.externalGameKey, pack.externalPackKey, pack.identitySignature,
          pack.listingId, pack.name, pack.normalizedName, pack.category, pack.amount, productType,
          pack.sortOrder, JSON.stringify(pack.metadata), catalog.fetchedAt]
      );
      for (const offer of pack.offers) {
        await db.query(
          `INSERT INTO gameinfo_market_offers
           (market, external_game_key, external_pack_key, seller_key, seller_name, listing_id,
              price, currency, product_url, metadata, fetched_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (market, external_game_key, external_pack_key, seller_key) DO UPDATE SET
             seller_name = EXCLUDED.seller_name, listing_id = EXCLUDED.listing_id,
             price = EXCLUDED.price, currency = EXCLUDED.currency,
             product_url = EXCLUDED.product_url, metadata = EXCLUDED.metadata,
             fetched_at = EXCLUDED.fetched_at`,
          [catalog.market, catalog.externalGameKey, pack.externalPackKey, offer.sellerKey,
            offer.sellerName, offer.listingId, offer.price, offer.currency, offer.productUrl,
            JSON.stringify(offer.metadata), catalog.fetchedAt]
        );
      }
    }
    await db.query(
      `UPDATE gameinfo_market_mappings m
       SET status = CASE WHEN c.active THEN 'active' ELSE 'stale' END, updated_at = NOW()
       FROM gameinfo_market_catalog_packs c
       WHERE m.market = $1 AND m.external_game_key = $2
         AND c.market = m.market AND c.external_game_key = m.external_game_key
         AND c.external_pack_key = m.external_pack_key`,
      [catalog.market, catalog.externalGameKey]
    );
    await db.query(
      `UPDATE gameinfo_market_mappings m SET status = 'stale', updated_at = NOW()
       WHERE m.market = $1 AND m.external_game_key = $2 AND NOT EXISTS (
         SELECT 1 FROM gameinfo_market_catalog_packs c
          WHERE c.market = m.market AND c.external_game_key = m.external_game_key
            AND c.external_pack_key = m.external_pack_key AND c.active
       )`,
      [catalog.market, catalog.externalGameKey]
    );
    if (!client) await db.query("COMMIT");
    return { packs: catalog.packs.length, offers: catalog.packs.reduce((sum, pack) => sum + pack.offers.length, 0) };
  } catch (error) {
    if (!client) await db.query("ROLLBACK");
    throw error;
  } finally {
    if (!client) db.release();
  }
}

export async function listGameinfoMarketCatalog({ market, externalGameKey, gameId, dataMode = "uid", allModes = false, query = "", status = "all", page = 1, limit = GAMEINFO_COMPARE_PAGE_SIZE, sellerKeys = null }) {
  const normalizedMarket = normalizeGameinfoMarket(market);
  const normalizedMode = mode(dataMode);
  const pageNumber = positiveInt(page);
  const pageSize = positiveInt(limit, GAMEINFO_COMPARE_PAGE_SIZE, GAMEINFO_COMPARE_PAGE_SIZE);
  const needle = String(query || "").trim();
  const ownSellerKeys = Array.isArray(sellerKeys) ? sellerKeys.map(normalizeMarketIdentityPart).filter(Boolean) : null;
  const values = [normalizedMarket, String(externalGameKey || ""), Number(gameId) || 0, normalizedMode, needle ? `%${needle}%` : "", pageSize, (pageNumber - 1) * pageSize];
  const filterBySeller = ownSellerKeys && status !== "stale";
  if (filterBySeller) values.push(ownSellerKeys);
  const mappedClause = status === "unmapped" ? "AND m.pack_id IS NULL" : status === "mapped" ? "AND m.status = 'active'" : status === "stale" ? "AND m.status = 'stale'" : "";
  const activeClause = status === "stale" ? "" : "AND c.active";
  // The listed price comes from our own shop's offer when we know which sellers
  // are ours, so the mapping table shows the price a buyer sees on the market.
  const ownPriceClause = filterBySeller ? "AND o.seller_key = ANY($8::text[])" : "";
  // In the combined view a market pack may be mapped from either data mode, so
  // the mapping is looked up across modes with the viewed mode winning ties.
  const mappingModeClause = allModes ? "" : "AND mm.data_mode = $4";
  const mappingJoin = `LEFT JOIN LATERAL (
         SELECT mm.pack_id, mm.status, mm.data_mode
           FROM gameinfo_market_mappings mm
          WHERE mm.game_id = $3 AND mm.market = c.market
            AND mm.external_game_key = c.external_game_key
            AND mm.external_pack_key = c.external_pack_key ${mappingModeClause}
          ORDER BY (mm.data_mode = $4) DESC, mm.updated_at DESC
          LIMIT 1
       ) m ON TRUE`;
  const otherModeJoin = allModes
    ? "LEFT JOIN LATERAL (SELECT NULL::text AS pack_id, NULL::text AS data_mode) other_mode ON TRUE"
    : `LEFT JOIN LATERAL (
         SELECT om.pack_id, om.data_mode
           FROM gameinfo_market_mappings om
          WHERE om.game_id = $3 AND om.data_mode <> $4 AND om.market = c.market
            AND om.external_game_key = c.external_game_key
            AND om.external_pack_key = c.external_pack_key
          ORDER BY om.updated_at DESC
          LIMIT 1
       ) other_mode ON TRUE`;
  const sellerClause = filterBySeller ? `AND EXISTS (
          SELECT 1 FROM gameinfo_market_offers own_offer
           WHERE own_offer.market = c.market
             AND own_offer.external_game_key = c.external_game_key
             AND own_offer.external_pack_key = c.external_pack_key
             AND own_offer.seller_key = ANY($8::text[])
        )` : "";
  const summarySellerClause = ownSellerKeys ? `AND EXISTS (
          SELECT 1 FROM gameinfo_market_offers own_offer
           WHERE own_offer.market = c.market
             AND own_offer.external_game_key = c.external_game_key
             AND own_offer.external_pack_key = c.external_pack_key
             AND own_offer.seller_key = ANY($5::text[])
        )` : "";
  const pool = await getGameinfoMarketPool();
  const [result, summaryResult] = await Promise.all([pool.query(
    `SELECT c.*, m.pack_id, m.status AS mapping_status, m.data_mode AS mapping_mode,
            own_price.price, own_price.currency,
            other_mode.pack_id AS other_mode_pack_id, other_mode.data_mode AS other_mode,
            COUNT(*) OVER()::int AS total
       FROM gameinfo_market_catalog_packs c
       LEFT JOIN LATERAL (
         SELECT o.price, o.currency
           FROM gameinfo_market_offers o
          WHERE o.market = c.market AND o.external_game_key = c.external_game_key
            AND o.external_pack_key = c.external_pack_key ${ownPriceClause}
          ORDER BY o.price
          LIMIT 1
       ) own_price ON TRUE
       ${otherModeJoin}
       ${mappingJoin}
      WHERE c.market = $1 AND c.external_game_key = $2 ${activeClause}
        AND ($5 = '' OR c.name ILIKE $5 OR c.category ILIKE $5 OR c.amount ILIKE $5)
        ${sellerClause}
        ${mappedClause}
      ORDER BY c.sort_order, c.name
      LIMIT $6 OFFSET $7`,
    values
  ), pool.query(
    `SELECT COUNT(*) FILTER (WHERE c.active ${summarySellerClause})::int AS total,
            COUNT(*) FILTER (WHERE c.active AND m.status = 'active' ${summarySellerClause})::int AS mapped,
            COUNT(*) FILTER (WHERE c.active AND m.pack_id IS NULL ${summarySellerClause})::int AS unmapped,
            COUNT(*) FILTER (WHERE m.status = 'stale')::int AS stale
       FROM gameinfo_market_catalog_packs c
       ${mappingJoin}
      WHERE c.market = $1 AND c.external_game_key = $2`,
    ownSellerKeys
      ? [normalizedMarket, String(externalGameKey || ""), Number(gameId) || 0, normalizedMode, ownSellerKeys]
      : [normalizedMarket, String(externalGameKey || ""), Number(gameId) || 0, normalizedMode]
  )]);
  const summary = summaryResult.rows[0] || {};
  return {
    items: result.rows.map((row) => ({
      externalPackKey: row.external_pack_key, identitySignature: row.identity_signature,
      listingId: row.listing_id, name: row.name, category: row.category, amount: row.amount,
      active: row.active, packId: row.pack_id || "", mappingStatus: row.mapping_status || "unmapped",
      mappingMode: row.mapping_mode || "",
      price: row.price == null ? null : Number(row.price), currency: row.currency || "",
      productType: row.product_type || "",
      otherModePackId: row.other_mode_pack_id || "", otherMode: row.other_mode || "",
      lastSeenAt: row.last_seen_at,
    })),
    page: pageNumber, limit: pageSize, total: Number(result.rows[0]?.total) || 0,
    summary: {
      total: Number(summary.total) || 0,
      mapped: Number(summary.mapped) || 0,
      unmapped: Number(summary.unmapped) || 0,
      stale: Number(summary.stale) || 0,
    },
  };
}

export async function getGameinfoMarketPackSource({ market, externalGameKey, externalPackKey }) {
  const normalizedMarket = normalizeGameinfoMarket(market);
  const gameKey = String(externalGameKey || "").trim();
  const packKey = String(externalPackKey || "").trim();
  if (!gameKey || !packKey) throw httpError("ข้อมูล Pack ต้นทางไม่ครบ", 400);
  const pool = await getGameinfoMarketPool();
  const [packResult, offerResult] = await Promise.all([
    pool.query(
      `SELECT * FROM gameinfo_market_catalog_packs
        WHERE market = $1 AND external_game_key = $2 AND external_pack_key = $3`,
      [normalizedMarket, gameKey, packKey]
    ),
    pool.query(
      `SELECT * FROM gameinfo_market_offers
        WHERE market = $1 AND external_game_key = $2 AND external_pack_key = $3
        ORDER BY price, seller_name`,
      [normalizedMarket, gameKey, packKey]
    ),
  ]);
  const pack = packResult.rows[0];
  if (!pack) throw httpError("ไม่พบ Pack ต้นทาง", 404);
  return {
    externalPackKey: pack.external_pack_key,
    listingId: pack.listing_id,
    name: pack.name,
    category: pack.category,
    amount: pack.amount,
    active: pack.active,
    lastSeenAt: pack.last_seen_at,
    metadata: pack.metadata || {},
    offers: offerResult.rows.map((offer) => ({
      sellerKey: offer.seller_key,
      sellerName: offer.seller_name,
      listingId: offer.listing_id,
      price: Number(offer.price),
      currency: offer.currency,
      productUrl: offer.product_url,
      metadata: offer.metadata || {},
      fetchedAt: offer.fetched_at,
    })),
  };
}

function mapMapping(row) {
  return {
    gameId: Number(row.game_id), dataMode: row.data_mode, market: row.market,
    packId: row.pack_id, externalGameKey: row.external_game_key,
    gameinfoPackName: row.gameinfo_pack_name || "",
    externalPackKey: row.external_pack_key, identitySignature: row.identity_signature,
    status: row.status, version: Number(row.version), updatedAt: row.updated_at,
  };
}

export async function listGameinfoMarketMappings(gameId, dataMode, market) {
  const result = await (await getGameinfoMarketPool()).query(
    `SELECT * FROM gameinfo_market_mappings WHERE game_id = $1 AND data_mode = $2 AND market = $3 ORDER BY pack_id`,
    [gameId, mode(dataMode), normalizeGameinfoMarket(market)]
  );
  return result.rows.map(mapMapping);
}

async function resolveActiveAlertsForMappingChange(
  client,
  { gameId, dataMode, market, packIds = null, reason, actor }
) {
  const values = [gameId, dataMode, market];
  const packClause = packIds?.length
    ? `AND pack_id = ANY($${values.push(packIds)}::text[])`
    : "";
  const dataIndex = values.push(JSON.stringify({ reason }));
  const actorIndex = values.push(actorId(actor));
  const result = await client.query(
    `WITH resolved AS (
       UPDATE gameinfo_price_alerts
          SET status = 'resolved', resolved_run_id = NULL, resolved_at = NOW()
        WHERE game_id = $1 AND data_mode = $2 AND market = $3
          AND status = 'active' ${packClause}
        RETURNING id
     )
     INSERT INTO gameinfo_price_alert_events (alert_id, event_type, data, actor_id)
     SELECT id, 'resolved', $${dataIndex}::jsonb, $${actorIndex} FROM resolved
     RETURNING alert_id`,
    values
  );
  return result.rowCount;
}

export async function saveGameinfoMarketMapping(input, actor) {
  const gameId = Number(input?.gameId);
  const normalizedMode = mode(input?.dataMode);
  const market = normalizeGameinfoMarket(input?.market);
  const packId = String(input?.packId || "").trim().slice(0, 128);
  const externalPackKey = String(input?.externalPackKey || "").trim();
  if (!Number.isInteger(gameId) || gameId <= 0 || !packId || !externalPackKey) throw httpError("ข้อมูล Mapping ไม่ครบ");
  const pack = (await packPriceMap(gameId, normalizedMode, market)).get(packId);
  if (!pack) throw httpError("ไม่พบ Pack ของ GameInfo", 404);
  const gameinfoPackName = normalizeMarketIdentityPart(pack.name);
  const pool = await getGameinfoMarketPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const config = await client.query(
      `SELECT * FROM gameinfo_game_markets WHERE game_id = $1 AND data_mode = $2 AND market = $3`,
      [gameId, normalizedMode, market]
    );
    if (!config.rows[0]?.external_game_key) throw httpError("ยังไม่ได้เลือกเกมของ Market", 409);
    const externalGameKey = config.rows[0].external_game_key;
    const catalog = await client.query(
      `SELECT * FROM gameinfo_market_catalog_packs
       WHERE market = $1 AND external_game_key = $2 AND external_pack_key = $3 AND active`,
      [market, externalGameKey, externalPackKey]
    );
    if (!catalog.rows[0]) throw httpError("ไม่พบ Pack ของ Market", 404);
    const current = await client.query(
      `SELECT * FROM gameinfo_market_mappings WHERE game_id = $1 AND data_mode = $2 AND market = $3 AND pack_id = $4 FOR UPDATE`,
      [gameId, normalizedMode, market, packId]
    );
    const version = Number(current.rows[0]?.version) || 0;
    if (input?.version !== undefined && Number(input.version) !== version) throw httpError("Mapping ถูกแก้โดยผู้ใช้อื่น", 409);
    const mappingChanged = !current.rows[0]
      || current.rows[0].external_game_key !== externalGameKey
      || current.rows[0].external_pack_key !== externalPackKey;
    if (mappingChanged) {
      await resolveActiveAlertsForMappingChange(client, {
        gameId, dataMode: normalizedMode, market, packIds: [packId],
        reason: current.rows[0] ? "mapping_changed" : "mapping_created", actor,
      });
    }
    let result;
    try {
      result = await client.query(
        `INSERT INTO gameinfo_market_mappings
           (game_id, data_mode, market, pack_id, gameinfo_pack_name, external_game_key, external_pack_key, identity_signature, status, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9)
         ON CONFLICT (game_id, data_mode, market, pack_id) DO UPDATE SET
           gameinfo_pack_name = EXCLUDED.gameinfo_pack_name,
           external_game_key = EXCLUDED.external_game_key, external_pack_key = EXCLUDED.external_pack_key,
           identity_signature = EXCLUDED.identity_signature, status = 'active',
           version = gameinfo_market_mappings.version + 1, updated_by = EXCLUDED.updated_by, updated_at = NOW()
         RETURNING *`,
        [gameId, normalizedMode, market, packId, gameinfoPackName, externalGameKey, externalPackKey,
          catalog.rows[0].identity_signature, actorId(actor)]
      );
    } catch (error) {
      if (error.code === "23505") throw httpError("Pack ของ Market นี้ถูกใช้กับ Mapping อื่นแล้ว", 409);
      throw error;
    }
    await client.query(
      `INSERT INTO gameinfo_market_mapping_logs
         (game_id, data_mode, market, pack_id, actor_id, action, before_data, after_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [gameId, normalizedMode, market, packId, actorId(actor), current.rows[0] ? "update" : "create",
        current.rows[0] ? JSON.stringify(current.rows[0]) : null, JSON.stringify(result.rows[0])]
    );
    await client.query("COMMIT");
    return mapMapping(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveGameinfoMarketMappingsInOrder(input, actor) {
  const gameId = Number(input?.gameId);
  const normalizedMode = mode(input?.dataMode);
  const market = normalizeGameinfoMarket(input?.market);
  const pairs = Array.isArray(input?.pairs) ? input.pairs.slice(0, 500) : [];
  if (!Number.isInteger(gameId) || gameId <= 0 || !pairs.length) throw httpError("ไม่มีรายการสำหรับ Mapping");
  const prices = await packPriceMap(gameId, normalizedMode, market);
  const clean = pairs.map((pair) => ({
    packId: String(pair?.packId || "").trim().slice(0, 128),
    externalPackKey: String(pair?.externalPackKey || "").trim(),
  }));
  if (clean.some((pair) => !prices.has(pair.packId) || !pair.externalPackKey)) throw httpError("รายการ Pack สำหรับ Mapping ไม่ถูกต้อง");
  if (new Set(clean.map((pair) => pair.packId)).size !== clean.length || new Set(clean.map((pair) => pair.externalPackKey)).size !== clean.length) throw httpError("รายการ Mapping ซ้ำกัน");
  const pool = await getGameinfoMarketPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const config = await client.query(
      `SELECT * FROM gameinfo_game_markets WHERE game_id = $1 AND data_mode = $2 AND market = $3 FOR UPDATE`,
      [gameId, normalizedMode, market]
    );
    const externalGameKey = config.rows[0]?.external_game_key;
    if (!externalGameKey) throw httpError("ยังไม่ได้เลือกเกมของ Market", 409);
    const catalog = await client.query(
      `SELECT external_pack_key, identity_signature FROM gameinfo_market_catalog_packs
        WHERE market = $1 AND external_game_key = $2 AND external_pack_key = ANY($3::text[]) AND active`,
      [market, externalGameKey, clean.map((pair) => pair.externalPackKey)]
    );
    const catalogByKey = new Map(catalog.rows.map((row) => [row.external_pack_key, row]));
    if (catalogByKey.size !== clean.length) throw httpError("Pack ของ Market บางรายการไม่พร้อมใช้งาน", 409);
    await resolveActiveAlertsForMappingChange(client, {
      gameId, dataMode: normalizedMode, market, packIds: clean.map((pair) => pair.packId),
      reason: "mapping_created_ordered", actor,
    });
    for (const pair of clean) {
      const pack = prices.get(pair.packId);
      const externalPack = catalogByKey.get(pair.externalPackKey);
      let result;
      try {
        result = await client.query(
          `INSERT INTO gameinfo_market_mappings
             (game_id, data_mode, market, pack_id, gameinfo_pack_name, external_game_key,
              external_pack_key, identity_signature, status, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9)
           RETURNING *`,
          [gameId, normalizedMode, market, pair.packId, normalizeMarketIdentityPart(pack.name),
            externalGameKey, pair.externalPackKey, externalPack.identity_signature, actorId(actor)]
        );
      } catch (error) {
        if (error.code === "23505") throw httpError("มี Pack บางรายการถูก Mapping ไปแล้ว กรุณาโหลดหน้าใหม่", 409);
        throw error;
      }
      await client.query(
        `INSERT INTO gameinfo_market_mapping_logs
           (game_id, data_mode, market, pack_id, actor_id, action, after_data)
         VALUES ($1,$2,$3,$4,$5,'create_ordered',$6)`,
        [gameId, normalizedMode, market, pair.packId, actorId(actor), JSON.stringify(result.rows[0])]
      );
    }
    await client.query("COMMIT");
    return { mapped: clean.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteGameinfoMarketMapping(input, actor) {
  const values = [Number(input?.gameId), mode(input?.dataMode), normalizeGameinfoMarket(input?.market), String(input?.packId || "")];
  const pool = await getGameinfoMarketPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT * FROM gameinfo_market_mappings WHERE game_id = $1 AND data_mode = $2 AND market = $3 AND pack_id = $4 FOR UPDATE`, values
    );
    if (!current.rows[0]) throw httpError("ไม่พบ Mapping", 404);
    if (input?.version !== undefined && Number(input.version) !== Number(current.rows[0].version)) throw httpError("Mapping ถูกแก้โดยผู้ใช้อื่น", 409);
    await resolveActiveAlertsForMappingChange(client, {
      gameId: values[0], dataMode: values[1], market: values[2], packIds: [values[3]],
      reason: "mapping_deleted", actor,
    });
    await client.query(`DELETE FROM gameinfo_market_mappings WHERE game_id = $1 AND data_mode = $2 AND market = $3 AND pack_id = $4`, values);
    await client.query(
      `INSERT INTO gameinfo_market_mapping_logs
         (game_id, data_mode, market, pack_id, actor_id, action, before_data)
       VALUES ($1,$2,$3,$4,$5,'delete',$6)`,
      [...values, actorId(actor), JSON.stringify(current.rows[0])]
    );
    await client.query("COMMIT");
    return { deleted: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAllGameinfoMarketMappings(input, actor) {
  const gameId = Number(input?.gameId);
  const normalizedMode = mode(input?.dataMode);
  const market = normalizeGameinfoMarket(input?.market);
  if (!Number.isInteger(gameId) || gameId <= 0) throw httpError("ข้อมูล Mapping ไม่ครบ");
  const values = [gameId, normalizedMode, market];
  const pool = await getGameinfoMarketPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT * FROM gameinfo_market_mappings
       WHERE game_id = $1 AND data_mode = $2 AND market = $3 FOR UPDATE`, values
    );
    for (const mapping of current.rows) {
      await client.query(
        `INSERT INTO gameinfo_market_mapping_logs
           (game_id, data_mode, market, pack_id, actor_id, action, before_data)
         VALUES ($1,$2,$3,$4,$5,'delete_all',$6)`,
        [...values, mapping.pack_id, actorId(actor), JSON.stringify(mapping)]
      );
    }
    await resolveActiveAlertsForMappingChange(client, {
      gameId, dataMode: normalizedMode, market,
      reason: "all_mappings_deleted", actor,
    });
    await client.query(
      `DELETE FROM gameinfo_market_mappings WHERE game_id = $1 AND data_mode = $2 AND market = $3`, values
    );
    await client.query("COMMIT");
    return { deleted: current.rowCount };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listGameinfoOwnSellers(market = "") {
  const values = [];
  const where = market ? "WHERE market = $1" : "";
  if (market) values.push(normalizeGameinfoMarket(market));
  const result = await (await getGameinfoMarketPool()).query(
    `SELECT * FROM gameinfo_market_own_sellers ${where} ORDER BY market, seller_name`, values
  );
  return result.rows.map((row) => ({ market: row.market, sellerKey: row.seller_key, sellerName: row.seller_name, enabled: row.enabled, updatedAt: row.updated_at }));
}

export async function saveGameinfoOwnSellers(market, sellers, actor) {
  const normalizedMarket = normalizeGameinfoMarket(market);
  const clean = [...new Map((sellers || []).map((seller) => {
    const name = String(seller?.sellerName || seller || "").trim().slice(0, 255);
    return [normalizeMarketIdentityPart(name), { sellerKey: normalizeMarketIdentityPart(name), sellerName: name, enabled: seller?.enabled !== false }];
  }).filter(([key, seller]) => key && seller.sellerName)).values()].slice(0, 100);
  const pool = await getGameinfoMarketPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM gameinfo_market_own_sellers WHERE market = $1`, [normalizedMarket]);
    for (const seller of clean) {
      await client.query(
        `INSERT INTO gameinfo_market_own_sellers (market, seller_key, seller_name, enabled, updated_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [normalizedMarket, seller.sellerKey, seller.sellerName, seller.enabled, actorId(actor)]
      );
    }
    await client.query("COMMIT");
    return listGameinfoOwnSellers(normalizedMarket);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function mapMarketRateReference(row) {
  return {
    market: row.market,
    externalGameKey: row.external_game_key,
    externalGameLabel: row.external_game_label,
    referenceAt: new Date(row.reference_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listGameinfoMarketRateReferences(market = "") {
  const normalizedMarket = market ? normalizeGameinfoMarket(market) : "";
  const result = await (await getGameinfoMarketPool()).query(
    `SELECT * FROM gameinfo_market_rate_references ${normalizedMarket ? "WHERE market = $1" : ""}
      ORDER BY market, external_game_label, external_game_key`,
    normalizedMarket ? [normalizedMarket] : []
  );
  return result.rows.map(mapMarketRateReference);
}

export async function listGameinfoMarketRateReferenceOptions() {
  const [references, marketGames] = await Promise.all([
    listGameinfoMarketRateReferences(),
    Promise.all(GAMEINFO_MARKETS.map(async (market) => ({
      ...market,
      games: await listGameinfoMarketGames(market.key),
    }))),
  ]);
  return marketGames.map((market) => ({
    key: market.key,
    label: market.label,
    games: market.games,
    references: references.filter((reference) => reference.market === market.key),
  }));
}

export async function saveGameinfoMarketRateReference(input, actor) {
  const market = normalizeGameinfoMarket(input?.market);
  const externalGameKey = String(input?.externalGameKey || "").trim().slice(0, 200);
  const referenceAt = new Date(input?.referenceAt);
  if (!externalGameKey || !Number.isFinite(referenceAt.getTime())) throw httpError("กรุณาเลือกเกมและระบุวันเวลาอ้างอิง");
  const game = (await listGameinfoMarketGames(market)).find((item) => item.value === externalGameKey);
  if (!game) throw httpError("ไม่พบเกมนี้ในรายการของ Market", 404);
  const result = await (await getGameinfoMarketPool()).query(
    `INSERT INTO gameinfo_market_rate_references
       (market, external_game_key, external_game_label, reference_at, updated_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (market, external_game_key) DO UPDATE SET
       external_game_label = EXCLUDED.external_game_label,
       reference_at = EXCLUDED.reference_at,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING *`,
    [market, externalGameKey, game.label, referenceAt.toISOString(), actorId(actor)]
  );
  return mapMarketRateReference(result.rows[0]);
}

export async function deleteGameinfoMarketRateReference(market, externalGameKey) {
  const result = await (await getGameinfoMarketPool()).query(
    `DELETE FROM gameinfo_market_rate_references WHERE market = $1 AND external_game_key = $2 RETURNING *`,
    [normalizeGameinfoMarket(market), String(externalGameKey || "").trim()]
  );
  if (!result.rows[0]) throw httpError("ไม่พบเวลาอ้างอิงที่ต้องการลบ", 404);
  return mapMarketRateReference(result.rows[0]);
}

async function getGameinfoMarketRateReference(market, externalGameKey) {
  if (!externalGameKey) return null;
  const result = await (await getGameinfoMarketPool()).query(
    `SELECT reference_at FROM gameinfo_market_rate_references WHERE market = $1 AND external_game_key = $2`,
    [normalizeGameinfoMarket(market), externalGameKey]
  );
  return result.rows[0]?.reference_at ? new Date(result.rows[0].reference_at).toISOString() : null;
}

async function packPriceMap(gameId, dataMode, market, externalGameKey = "") {
  const data = dataMode === "idpass" ? await getGameinfoModeData(gameId, dataMode) : await getGamelistPacks(gameId);
  const packs = dataMode === "idpass" ? data?.packs : data;
  const [gameRow, variableData, referenceAt, gameMarkets] = await Promise.all([
    getGameListRow(gameId),
    getGameinfoFormulaVariables(gameId),
    getGameinfoMarketRateReference(market, externalGameKey),
    listGameinfoGameMarkets(gameId, dataMode),
  ]);
  // Which column this game says holds the market's price. Empty for mappings
  // made before columns could be linked, which fall back to the old
  // market-kind column.
  const priceColumnKey =
    gameMarkets.find((entry) => entry.market === normalizeGameinfoMarket(market))?.priceColumnKey || "";
  const rates = await getGameinfoExchangeRates(
    ["USDT/THB", "USDCNY", "IDRTHB", "USDIDR", "THBUSD"],
    { at: referenceAt, includeHistory: false, refreshStale: false }
  ).catch(() => []);
  const fields = dataMode === "idpass" ? data?.fields : null;
  const game = {
    ...gameRow,
    gameName: gameRow?.game,
    region: fields?.region ?? gameRow?.region,
    platform: fields?.platform ?? gameRow?.platform,
    server: fields?.server ?? gameRow?.server,
  };
  const externalValues = Object.fromEntries(rates.filter((rate) => rate.available).map((rate) => [rate.pair, rate.rate]));
  const prices = buildGameinfoMarketPackPriceMap(packs, game, market, {
    formulaVariables: variableData.variables,
    externalValues,
    priceColumnKey,
  });
  prices.priceLabel =
    findGameinfoMarketPriceColumn(packs?.computedColumns, market, priceColumnKey)?.label || null;
  prices.rateReferenceAt = referenceAt;
  prices.rateSnapshotAt = rates.find((rate) => rate.available)?.fetchedAt || null;
  return prices;
}

async function reconcileGameinfoPackMappings(gameId, dataMode, market, mappings, prices) {
  const plan = reconcileGameinfoPackMappingTargets(mappings, [...prices.values()]);
  const pool = await getGameinfoMarketPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const mapping of mappings) {
      const currentPack = prices.get(mapping.packId);
      if (!currentPack) continue;
      const currentName = normalizeMarketIdentityPart(currentPack.name);
      if (currentName !== mapping.gameinfoPackName) {
        await client.query(
          `UPDATE gameinfo_market_mappings SET gameinfo_pack_name = $5, updated_at = NOW()
            WHERE game_id = $1 AND data_mode = $2 AND market = $3 AND pack_id = $4`,
          [gameId, dataMode, market, mapping.packId, currentName]
        );
      }
    }
    for (const { mapping, pack } of plan.reconnect) {
      await client.query(
        `UPDATE gameinfo_market_mappings
            SET pack_id = $5, gameinfo_pack_name = $6, version = version + 1, updated_at = NOW()
          WHERE game_id = $1 AND data_mode = $2 AND market = $3 AND pack_id = $4`,
        [gameId, dataMode, market, mapping.packId, String(pack.id), normalizeMarketIdentityPart(pack.name)]
      );
      await client.query(
        `INSERT INTO gameinfo_market_mapping_logs
           (game_id, data_mode, market, pack_id, action, before_data, after_data)
         VALUES ($1,$2,$3,$4,'reconnect',$5,$6)`,
        [gameId, dataMode, market, String(pack.id), JSON.stringify(mapping), JSON.stringify({ ...mapping, packId: String(pack.id), gameinfoPackName: normalizeMarketIdentityPart(pack.name) })]
      );
    }
    for (const mapping of plan.remove) {
      await client.query(
        `DELETE FROM gameinfo_market_mappings
          WHERE game_id = $1 AND data_mode = $2 AND market = $3 AND pack_id = $4`,
        [gameId, dataMode, market, mapping.packId]
      );
      await client.query(
        `INSERT INTO gameinfo_market_mapping_logs
           (game_id, data_mode, market, pack_id, action, before_data)
         VALUES ($1,$2,$3,$4,'auto_unmap',$5)`,
        [gameId, dataMode, market, mapping.packId, JSON.stringify(mapping)]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return listGameinfoMarketMappings(gameId, dataMode, market);
}

export async function getGameinfoMappingWorkspace(gameId, dataMode, market, options = {}) {
  const viewMode = normalizeGameinfoMappingViewMode(dataMode);
  const viewedModes = gameinfoMappingViewModes(viewMode);
  const allModes = viewMode === "all";
  const normalizedMarket = normalizeGameinfoMarket(market);
  const [game, ownSellers, perMode] = await Promise.all([
    getGameListRow(gameId),
    listGameinfoOwnSellers(normalizedMarket),
    Promise.all(viewedModes.map(async (viewedMode) => {
      const [configs, initialMappings] = await Promise.all([
        listGameinfoGameMarkets(gameId, viewedMode),
        listGameinfoMarketMappings(gameId, viewedMode, normalizedMarket),
      ]);
      const config = configs.find((item) => item.market === normalizedMarket);
      const prices = await packPriceMap(gameId, viewedMode, normalizedMarket, config?.externalGameKey);
      const mappings = await reconcileGameinfoPackMappings(gameId, viewedMode, normalizedMarket, initialMappings, prices);
      const mappingByPack = new Map(mappings.map((mapping) => [mapping.packId, mapping]));
      return {
        dataMode: viewedMode,
        config,
        packs: [...prices.values()].map((pack) => ({ ...pack, dataMode: viewedMode, mapping: mappingByPack.get(pack.id) || null })),
      };
    })),
  ]);
  if (!game) throw httpError("ไม่พบเกม", 404);
  const ownSellerKeys = ownSellers.filter((seller) => seller.enabled).map((seller) => seller.sellerKey);
  // Both modes usually point at one market game page; when they do not, the
  // combined view can only show one catalog, so the mismatch is reported.
  const configuredKeys = [...new Set(perMode.map((item) => item.config?.externalGameKey).filter(Boolean))];
  const config = perMode.find((item) => item.config?.externalGameKey)?.config || perMode[0]?.config;
  const catalog = config?.externalGameKey
    ? await listGameinfoMarketCatalog({
      ...options, market: normalizedMarket, externalGameKey: config.externalGameKey, gameId,
      dataMode: viewedModes[0], allModes, sellerKeys: ownSellerKeys,
    })
    : { items: [], page: 1, limit: GAMEINFO_COMPARE_PAGE_SIZE, total: 0, summary: { total: 0, mapped: 0, unmapped: 0, stale: 0 } };
  return {
    game: { id: game.id, name: game.game }, config, viewMode,
    packs: perMode.flatMap((item) => item.packs),
    catalog, ownSellerCount: ownSellerKeys.length,
    externalGameKeyConflict: configuredKeys.length > 1 ? configuredKeys : [],
  };
}

export async function getGameinfoPackPriceComparison({ gameId, dataMode = "uid", market, page = 1, sellers = [], allSellers = false, includeCompetitors = false, ownOnly = false }) {
  const normalizedMode = mode(dataMode);
  const normalizedMarket = normalizeGameinfoMarket(market);
  const pageNumber = positiveInt(page);
  const [game, configs, ownSellers] = await Promise.all([
    getGameListRow(gameId), listGameinfoGameMarkets(gameId, normalizedMode), listGameinfoOwnSellers(normalizedMarket),
  ]);
  if (!game) throw httpError("ไม่พบเกม", 404);
  const config = configs.find((item) => item.market === normalizedMarket);
  if (!config?.externalGameKey) return { game: { id: game.id, name: game.game }, config, rows: [], sellers: [], total: 0, page: pageNumber, limit: GAMEINFO_COMPARE_PAGE_SIZE };
  const prices = await packPriceMap(gameId, normalizedMode, normalizedMarket, config.externalGameKey);
  // The seller list and the mapped rows both depend only on the config, so they
  // go out together instead of one after the other.
  const comparePool = await getGameinfoMarketPool();
  const ownSellerKeys = ownSellers.filter((seller) => seller.enabled).map((seller) => seller.sellerKey);
  const mappingValues = [gameId, normalizedMode, normalizedMarket, config.externalGameKey, ownOnly, ownSellerKeys, GAMEINFO_COMPARE_PAGE_SIZE, (pageNumber - 1) * GAMEINFO_COMPARE_PAGE_SIZE];
  const [availableResult, mappings] = await Promise.all([
    comparePool.query(
      `SELECT seller_key, MIN(seller_name) AS seller_name, COUNT(DISTINCT external_pack_key)::int AS coverage
         FROM gameinfo_market_offers WHERE market = $1 AND external_game_key = $2
        GROUP BY seller_key ORDER BY coverage DESC, seller_name LIMIT 200`,
      [normalizedMarket, config.externalGameKey]
    ),
    comparePool.query(
      `SELECT m.*, c.name AS market_pack_name, c.category, c.amount, COUNT(*) OVER()::int AS total
         FROM gameinfo_market_mappings m
        JOIN gameinfo_market_catalog_packs c ON c.market = m.market AND c.external_game_key = m.external_game_key AND c.external_pack_key = m.external_pack_key
        WHERE m.game_id = $1 AND m.data_mode = $2 AND m.market = $3 AND m.external_game_key = $4
          AND m.status = 'active' AND c.active
          AND ($5::boolean = FALSE OR EXISTS (
            SELECT 1 FROM gameinfo_market_offers own_offer
             WHERE own_offer.market = m.market
               AND own_offer.external_game_key = m.external_game_key
               AND own_offer.external_pack_key = m.external_pack_key
               AND own_offer.seller_key = ANY($6::text[])
          ))
        ORDER BY c.sort_order, c.name LIMIT $7 OFFSET $8`,
      mappingValues
    ),
  ]);
  const availableSellers = availableResult.rows.map((row) => ({
    value: row.seller_key,
    label: row.seller_name,
    coverage: Number(row.coverage),
    own: ownSellerKeys.includes(row.seller_key),
  }));
  const requestedSellerKeys = (sellers || []).map(normalizeMarketIdentityPart).filter(Boolean);
  const requestedOrAll = allSellers || includeCompetitors
    ? availableSellers.map((seller) => seller.value)
    : requestedSellerKeys;
  const selectedSellerKeys = selectGameinfoCompareSellerKeys(
    availableSellers,
    ownSellerKeys,
    ownOnly ? ownSellerKeys : requestedOrAll
  );
  const packKeys = mappings.rows.map((row) => row.external_pack_key);
  const offerResult = packKeys.length ? await comparePool.query(
    `SELECT * FROM gameinfo_market_offers
      WHERE market = $1 AND external_game_key = $2 AND external_pack_key = ANY($3::text[])
        AND seller_key = ANY($4::text[])
      ORDER BY seller_name`,
    [normalizedMarket, config.externalGameKey, packKeys, selectedSellerKeys]
  ) : { rows: [] };
  const offers = new Map();
  for (const offer of offerResult.rows) {
    const list = offers.get(offer.external_pack_key) || [];
    list.push({ sellerKey: offer.seller_key, sellerName: offer.seller_name, listingId: offer.listing_id, price: Number(offer.price), currency: offer.currency, productUrl: offer.product_url, metadata: offer.metadata || {}, fetchedAt: offer.fetched_at });
    offers.set(offer.external_pack_key, list);
  }
  const availableByKey = new Map(availableSellers.map((seller) => [seller.value, seller]));
  const sellerList = selectedSellerKeys.map((key) => availableByKey.get(key)).filter(Boolean);
  return {
    game: { id: game.id, name: game.game }, config, sellers: sellerList,
    priceLabel: prices.priceLabel || GAMEINFO_MARKETS.find((item) => item.key === normalizedMarket)?.label || normalizedMarket,
    rateReferenceAt: prices.rateReferenceAt,
    rateSnapshotAt: prices.rateSnapshotAt,
    availableSellers: availableSellers.filter((seller) => !ownOnly || seller.own),
    rows: mappings.rows.map((row) => ({
      packId: row.pack_id, packName: prices.get(row.pack_id)?.name || row.pack_id, externalPackKey: row.external_pack_key,
      price: prices.get(row.pack_id)?.price ?? null, basePrice: prices.get(row.pack_id)?.basePrice ?? null, marketPackName: row.market_pack_name,
      category: row.category, amount: row.amount, mappingStatus: row.status,
      offers: offers.get(row.external_pack_key) || [],
    })),
    total: Number(mappings.rows[0]?.total) || 0, page: pageNumber, limit: GAMEINFO_COMPARE_PAGE_SIZE,
  };
}

async function upsertAlert(client, { runId, market, gameId, dataMode, packId, seller, basePrice, marketPrice, result }) {
  const existing = await client.query(
    `SELECT * FROM gameinfo_price_alerts
      WHERE market = $1 AND game_id = $2 AND data_mode = $3 AND pack_id = $4 AND seller_key = $5 FOR UPDATE`,
    [market, gameId, dataMode, packId, seller.seller_key]
  );
  const eventType = existing.rows[0]?.status === "active" ? "seen" : "opened";
  const saved = await client.query(
    `INSERT INTO gameinfo_price_alerts
       (market, game_id, data_mode, pack_id, seller_key, seller_name, kind, direction,
        base_price, market_price, difference, percent, status, first_seen_run_id, last_seen_run_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active',$13,$13)
     ON CONFLICT (market, game_id, data_mode, pack_id, seller_key) DO UPDATE SET
       seller_name = EXCLUDED.seller_name, kind = EXCLUDED.kind, direction = EXCLUDED.direction,
       base_price = EXCLUDED.base_price, market_price = EXCLUDED.market_price,
       difference = EXCLUDED.difference, percent = EXCLUDED.percent, status = 'active',
       last_seen_run_id = COALESCE(EXCLUDED.last_seen_run_id, gameinfo_price_alerts.last_seen_run_id), last_seen_at = NOW(),
       resolved_run_id = NULL, resolved_at = NULL
     RETURNING *`,
    [market, gameId, dataMode, packId, seller.seller_key, seller.seller_name, result.kind,
      result.direction, Number(basePrice) || null, Number.isFinite(Number(marketPrice)) ? Number(marketPrice) : null,
      result.difference, result.percent, runId]
  );
  await client.query(
    `INSERT INTO gameinfo_price_alert_events (alert_id, run_id, event_type, data)
     VALUES ($1,$2,$3,$4)`,
    [saved.rows[0].id, runId, eventType, JSON.stringify({ basePrice, marketPrice, direction: result.direction, percent: result.percent })]
  );
  return { id: saved.rows[0].id, key: `${packId}:${seller.seller_key}` };
}

async function evaluateAlertsForConfig(client, runId, config) {
  const [prices, mappings, sellers, offers] = await Promise.all([
    packPriceMap(Number(config.game_id), config.data_mode, config.market, config.external_game_key),
    client.query(`SELECT * FROM gameinfo_market_mappings WHERE game_id = $1 AND data_mode = $2 AND market = $3`, [config.game_id, config.data_mode, config.market]),
    client.query(`SELECT * FROM gameinfo_market_own_sellers WHERE market = $1 AND enabled`, [config.market]),
    client.query(`SELECT * FROM gameinfo_market_offers WHERE market = $1 AND external_game_key = $2`, [config.market, config.external_game_key]),
  ]);
  const offerByPackSeller = new Map(offers.rows.map((offer) => [`${offer.external_pack_key}:${offer.seller_key}`, offer]));
  const mappingStatusByPack = new Map(mappings.rows.map((mapping) => [mapping.pack_id, mapping.status]));
  const seen = new Set();
  let alerts = 0;
  for (const mapping of mappings.rows) {
    if (mapping.status !== "active") continue;
    const pack = prices.get(mapping.pack_id);
    for (const seller of sellers.rows) {
      const offer = offerByPackSeller.get(`${mapping.external_pack_key}:${seller.seller_key}`);
      const result = calculateGameinfoPriceDifference(pack?.price, offer ? Number(offer.price) : null);
      const key = `${mapping.pack_id}:${seller.seller_key}`;
      if (!result.alert) continue;
      const saved = await upsertAlert(client, {
        runId, market: config.market, gameId: Number(config.game_id), dataMode: config.data_mode,
        packId: mapping.pack_id, seller, basePrice: pack?.price, marketPrice: offer?.price, result,
      });
      seen.add(saved.key);
      alerts += 1;
    }
  }
  const active = await client.query(
    `SELECT * FROM gameinfo_price_alerts WHERE market = $1 AND game_id = $2 AND data_mode = $3 AND status = 'active' FOR UPDATE`,
    [config.market, config.game_id, config.data_mode]
  );
  for (const alert of active.rows) {
    if (seen.has(`${alert.pack_id}:${alert.seller_key}`)) continue;
    // Missing or ambiguous provider identity makes the mapping stale. Preserve
    // its previous alert because this run has no trustworthy replacement price.
    if (mappingStatusByPack.get(alert.pack_id) === "stale") continue;
    await client.query(
      `UPDATE gameinfo_price_alerts SET status = 'resolved', resolved_run_id = $2, resolved_at = NOW() WHERE id = $1`,
      [alert.id, runId]
    );
    await client.query(
      `INSERT INTO gameinfo_price_alert_events (alert_id, run_id, event_type, data) VALUES ($1,$2,'resolved','{}'::jsonb)`,
      [alert.id, runId]
    );
  }
  return { mappings: mappings.rows.length, alerts };
}

// Prices in GameInfo change far more often than the market does, and an alert
// is the comparison between the two. This re-runs that comparison against the
// offers already in the database, so no market is called and no check run is
// opened: the alert rows just catch up with the prices as they are now.
export async function recalculateGameinfoPriceAlerts({ market = "", gameId = 0, dataMode = "" } = {}) {
  const pool = await getGameinfoMarketPool();
  const conditions = ["enabled", "external_game_key <> ''"];
  const values = [];
  if (market) { values.push(normalizeGameinfoMarket(market)); conditions.push(`market = ${values.length}`); }
  if (Number(gameId) > 0) { values.push(Number(gameId)); conditions.push(`game_id = ${values.length}`); }
  if (dataMode) { values.push(mode(dataMode)); conditions.push(`data_mode = ${values.length}`); }
  const configs = await pool.query(
    `SELECT * FROM gameinfo_game_markets WHERE ${conditions.join(" AND ")} ORDER BY market, game_id, data_mode`,
    values
  );
  const result = { games: 0, alerts: 0, errors: [] };
  for (const config of configs.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const evaluated = await evaluateAlertsForConfig(client, null, config);
      await client.query("COMMIT");
      result.games += 1;
      result.alerts += evaluated.alerts;
    } catch (error) {
      await client.query("ROLLBACK");
      result.errors.push(`${config.game_id}/${config.data_mode}: ${error.message}`);
    } finally {
      client.release();
    }
  }
  return result;
}

export async function executeGameinfoMarketCheck(runId) {
  const pool = await getGameinfoMarketPool();
  const runResult = await pool.query(`SELECT * FROM gameinfo_market_check_runs WHERE id = $1`, [runId]);
  const run = runResult.rows[0];
  if (!run || !["queued", "running"].includes(run.status)) return run || null;
  await pool.query(`UPDATE gameinfo_market_check_runs SET status = 'running', started_at = COALESCE(started_at, NOW()) WHERE id = $1`, [runId]);
  const configs = await pool.query(
    `SELECT * FROM gameinfo_game_markets WHERE market = $1 AND enabled AND external_game_key <> '' ORDER BY game_id, data_mode`, [run.market]
  );
  const ownSellerResult = await pool.query(
    `SELECT seller_name FROM gameinfo_market_own_sellers WHERE market = $1 AND enabled ORDER BY seller_name`, [run.market]
  );
  const ownSellerNames = ownSellerResult.rows.map((seller) => seller.seller_name);
  const catalogCache = new Map();
  let completed = 0;
  let failed = 0;
  let alerts = 0;
  const errors = [];
  for (const config of configs.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO gameinfo_market_check_run_games (run_id, game_id, data_mode, status)
         VALUES ($1,$2,$3,'running') ON CONFLICT (run_id, game_id, data_mode) DO UPDATE SET status = 'running', error = ''`,
        [runId, config.game_id, config.data_mode]
      );
      const cacheKey = `${config.external_game_key}:${config.product_type}`;
      let catalog = catalogCache.get(cacheKey);
      if (!catalog) {
        catalog = await fetchNormalizedGameinfoMarketCatalog(run.market, config.external_game_key, config.product_type, ownSellerNames);
        catalogCache.set(cacheKey, catalog);
      }
      await upsertGameinfoMarketCatalog(catalog, client);
      if (catalog.ambiguities?.length) {
        const ambiguityError = new Error(`พบ Pack identity ซ้ำ ${catalog.ambiguities.length} รายการ; Mapping ถูกทำเครื่องหมาย stale`);
        ambiguityError.persistCatalog = true;
        throw ambiguityError;
      }
      const result = await evaluateAlertsForConfig(client, runId, config);
      await client.query(
        `UPDATE gameinfo_market_check_run_games SET status = 'completed', mapped_count = $4,
          alert_count = $5, finished_at = NOW() WHERE run_id = $1 AND game_id = $2 AND data_mode = $3`,
        [runId, config.game_id, config.data_mode, result.mappings, result.alerts]
      );
      await client.query("COMMIT");
      completed += 1;
      alerts += result.alerts;
    } catch (error) {
      await client.query(error.persistCatalog ? "COMMIT" : "ROLLBACK");
      failed += 1;
      errors.push(`${config.game_id}/${config.data_mode}: ${error.message}`);
      await pool.query(
        `INSERT INTO gameinfo_market_check_run_games (run_id, game_id, data_mode, status, error, finished_at)
         VALUES ($1,$2,$3,'failed',$4,NOW()) ON CONFLICT (run_id, game_id, data_mode) DO UPDATE SET status = 'failed', error = $4, finished_at = NOW()`,
        [runId, config.game_id, config.data_mode, String(error.message || "โหลดไม่สำเร็จ").slice(0, 1000)]
      );
    } finally {
      client.release();
      await pool.query(
        `UPDATE gameinfo_market_check_runs SET completed_games = $2, failed_games = $3, alerts_opened = $4 WHERE id = $1`,
        [runId, completed, failed, alerts]
      );
    }
  }
  const status = failed && completed ? "partial" : failed ? "failed" : "completed";
  const final = await pool.query(
    `UPDATE gameinfo_market_check_runs SET status = $2, completed_games = $3, failed_games = $4,
      alerts_opened = $5, error = $6, finished_at = NOW() WHERE id = $1 RETURNING *`,
    [runId, status, completed, failed, alerts, errors.join("\n").slice(0, 4000)]
  );
  return mapRun(final.rows[0]);
}

function mapRun(row, games = []) {
  if (!row) return null;
  return {
    id: Number(row.id), market: row.market, triggerType: row.trigger_type, status: row.status,
    totalGames: Number(row.total_games), completedGames: Number(row.completed_games),
    failedGames: Number(row.failed_games), alertsOpened: Number(row.alerts_opened), error: row.error,
    createdAt: row.created_at, startedAt: row.started_at, finishedAt: row.finished_at, games,
  };
}

function launchRun(runId) {
  if (runners.has(runId)) return runners.get(runId);
  const promise = executeGameinfoMarketCheck(runId)
    .catch((error) => console.error(`[gameinfo-market] run ${runId} failed`, error))
    .finally(() => runners.delete(runId));
  runners.set(runId, promise);
  return promise;
}

export async function startGameinfoMarketCheck(market, actor, triggerType = "manual") {
  const normalizedMarket = normalizeGameinfoMarket(market);
  const pool = await getGameinfoMarketPool();
  const active = await pool.query(
    `SELECT * FROM gameinfo_market_check_runs WHERE market = $1 AND status IN ('queued','running') ORDER BY id DESC LIMIT 1`, [normalizedMarket]
  );
  if (active.rows[0]) {
    launchRun(Number(active.rows[0].id));
    return { run: mapRun(active.rows[0]), existing: true };
  }
  const count = await pool.query(`SELECT COUNT(*)::int AS count FROM gameinfo_game_markets WHERE market = $1 AND enabled AND external_game_key <> ''`, [normalizedMarket]);
  const totalGames = Number(count.rows[0]?.count) || 0;
  if (!totalGames) {
    throw httpError(`ยังไม่มีเกมที่เปิด ${GAMEINFO_MARKETS.find((item) => item.key === normalizedMarket)?.label || normalizedMarket} กรุณาเลือกเกมต้นทางและเปิด Market จากหน้า Packs ก่อน`, 409);
  }
  let result;
  try {
    result = await pool.query(
      `INSERT INTO gameinfo_market_check_runs (market, trigger_type, requested_by, total_games)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [normalizedMarket, triggerType === "scheduled" ? "scheduled" : "manual", actorId(actor), totalGames]
    );
  } catch (error) {
    if (error.code !== "23505") throw error;
    const concurrent = await pool.query(`SELECT * FROM gameinfo_market_check_runs WHERE market = $1 AND status IN ('queued','running') ORDER BY id DESC LIMIT 1`, [normalizedMarket]);
    return { run: mapRun(concurrent.rows[0]), existing: true };
  }
  launchRun(Number(result.rows[0].id));
  return { run: mapRun(result.rows[0]), existing: false };
}

export async function getGameinfoMarketCheckRun(runId) {
  const pool = await getGameinfoMarketPool();
  const [run, games] = await Promise.all([
    pool.query(`SELECT * FROM gameinfo_market_check_runs WHERE id = $1`, [runId]),
    pool.query(`SELECT * FROM gameinfo_market_check_run_games WHERE run_id = $1 ORDER BY game_id, data_mode`, [runId]),
  ]);
  if (!run.rows[0]) throw httpError("ไม่พบ Check run", 404);
  return mapRun(run.rows[0], games.rows.map((row) => ({
    gameId: Number(row.game_id), dataMode: row.data_mode, status: row.status,
    mappedCount: Number(row.mapped_count), alertCount: Number(row.alert_count), error: row.error,
  })));
}

export async function listLatestGameinfoMarketCheckRuns() {
  const result = await (await getGameinfoMarketPool()).query(
    `SELECT DISTINCT ON (market) * FROM gameinfo_market_check_runs ORDER BY market, id DESC`
  );
  return result.rows.map((row) => mapRun(row));
}

export async function countEnabledGameinfoMarkets() {
  const result = await (await getGameinfoMarketPool()).query(
    `SELECT market, COUNT(*)::int AS count
       FROM gameinfo_game_markets
      WHERE enabled AND external_game_key <> ''
      GROUP BY market`
  );
  return Object.fromEntries(GAMEINFO_MARKETS.map((market) => [
    market.key,
    Number(result.rows.find((row) => row.market === market.key)?.count) || 0,
  ]));
}

export async function listGameinfoPriceAlerts(filters = {}) {
  const page = positiveInt(filters.page);
  const limit = positiveInt(filters.limit, GAMEINFO_COMPARE_PAGE_SIZE, GAMEINFO_COMPARE_PAGE_SIZE);
  const values = [];
  const clauses = [];
  function add(value, sql) { values.push(value); clauses.push(sql.replace("?", `$${values.length}`)); }
  if (filters.market) add(normalizeGameinfoMarket(filters.market), "a.market = ?");
  if (filters.gameId) add(Number(filters.gameId), "a.game_id = ?");
  if (filters.dataMode) add(mode(filters.dataMode), "a.data_mode = ?");
  if (["active", "resolved"].includes(filters.status)) add(filters.status, "a.status = ?");
  if (["under", "over", "invalid_base", "missing"].includes(filters.direction)) add(filters.direction, "a.direction = ?");
  if (filters.seller) add(normalizeMarketIdentityPart(filters.seller), "a.seller_key = ?");
  values.push(limit, (page - 1) * limit);
  const result = await (await getGameinfoMarketPool()).query(
    `SELECT a.*, g.game AS game_name, p.data->>'name' AS pack_name, m.status AS mapping_status, COUNT(*) OVER()::int AS total
       FROM gameinfo_price_alerts a
       LEFT JOIN game_list g ON g.id = a.game_id
       LEFT JOIN gamelist_packs p ON p.game_id = a.game_id AND p.pack_id = a.pack_id
       LEFT JOIN gameinfo_market_mappings m ON m.game_id = a.game_id AND m.data_mode = a.data_mode AND m.market = a.market AND m.pack_id = a.pack_id
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY (a.status = 'active') DESC, a.last_seen_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return {
    items: result.rows.map((row) => ({
      id: Number(row.id), market: row.market, gameId: Number(row.game_id), gameName: row.game_name,
      dataMode: row.data_mode, packId: row.pack_id, packName: row.pack_name || row.pack_id,
      sellerKey: row.seller_key, sellerName: row.seller_name, kind: row.kind, direction: row.direction,
      basePrice: row.base_price == null ? null : Number(row.base_price), marketPrice: row.market_price == null ? null : Number(row.market_price),
      difference: row.difference == null ? null : Number(row.difference), percent: row.percent == null ? null : Number(row.percent),
      status: row.status, mappingStatus: row.mapping_status || "unmapped", acknowledgedAt: row.acknowledged_at, note: row.note,
      firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, resolvedAt: row.resolved_at,
    })),
    page, limit, total: Number(result.rows[0]?.total) || 0,
  };
}

export async function acknowledgeGameinfoPriceAlert(alertId, note, actor) {
  const pool = await getGameinfoMarketPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE gameinfo_price_alerts SET acknowledged_by = $2, acknowledged_at = NOW(), note = $3 WHERE id = $1 RETURNING *`,
      [alertId, actorId(actor), String(note || "").trim().slice(0, 1000)]
    );
    if (!result.rows[0]) throw httpError("ไม่พบ Alert", 404);
    await client.query(
      `INSERT INTO gameinfo_price_alert_events (alert_id, event_type, data, actor_id)
       VALUES ($1,'acknowledged',$2,$3)`,
      [alertId, JSON.stringify({ note: String(note || "").trim().slice(0, 1000) }), actorId(actor)]
    );
    await client.query("COMMIT");
    return { id: Number(alertId), acknowledgedAt: result.rows[0].acknowledged_at, note: result.rows[0].note };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function unacknowledgeGameinfoPriceAlert(alertId, actor) {
  const pool = await getGameinfoMarketPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE gameinfo_price_alerts SET acknowledged_by = NULL, acknowledged_at = NULL, note = '' WHERE id = $1 RETURNING id`,
      [alertId]
    );
    if (!result.rows[0]) throw httpError("ไม่พบ Alert", 404);
    await client.query(
      `INSERT INTO gameinfo_price_alert_events (alert_id, event_type, data, actor_id)
       VALUES ($1,'acknowledged',$2,$3)`,
      [alertId, JSON.stringify({ cancelled: true }), actorId(actor)]
    );
    await client.query("COMMIT");
    return { id: Number(alertId), acknowledgedAt: null, note: "" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function countActiveGameinfoPriceAlerts() {
  const result = await (await getGameinfoMarketPool()).query(`SELECT COUNT(*)::int AS count FROM gameinfo_price_alerts WHERE status = 'active'`);
  return Number(result.rows[0]?.count) || 0;
}

export async function recoverGameinfoMarketChecks() {
  const pool = await getGameinfoMarketPool();
  await pool.query(
    `UPDATE gameinfo_market_check_runs SET status = 'queued', error = CONCAT(error, CASE WHEN error = '' THEN '' ELSE E'\n' END, 'recovered after restart')
     WHERE status = 'running'`
  );
  const queued = await pool.query(`SELECT id FROM gameinfo_market_check_runs WHERE status = 'queued' ORDER BY id`);
  for (const row of queued.rows) launchRun(Number(row.id));
  return queued.rows.length;
}
