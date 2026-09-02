// The "เทียบร้านอื่น" page used to keep its scraped result in process memory
// only, so every cold start — and every worker that had not served that game yet
// — paid for a full scrape before the page could render. The pages now live in
// the gameinfo database: a page load answers from the stored snapshot, the daily
// 09:00 (Thai) job replaces it, and the refresh button still forces a live fetch
// under the same rules as before.
import { getPoolForConnection } from "@/lib/db";
import { nextGameinfoMarketRunAt } from "@/lib/gameinfo-market-system";
import { settlePricePage } from "@/lib/gameinfo-price-diff";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";
const schemaReady = new Map();

async function getGameinfoConnection() {
  const connections = await listConnections();
  const match = connections.find((connection) => connection.name.trim().toLowerCase() === CONNECTION_NAME);
  return match ? findConnectionWithSecret(match.id) : null;
}

async function getReadyPool() {
  const connection = await getGameinfoConnection();
  if (!connection) throw new Error(`ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}"`);
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  if (!schemaReady.has(cacheKey)) {
    const promise = getPoolForConnection(connection).query(`
      CREATE TABLE IF NOT EXISTS gameinfo_price_pages (
        market       VARCHAR(16) NOT NULL,
        game         TEXT NOT NULL,
        product_type TEXT NOT NULL DEFAULT '',
        page         JSONB NOT NULL,
        fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (market, game, product_type)
      )
    `).catch((error) => {
      schemaReady.delete(cacheKey);
      throw error;
    });
    schemaReady.set(cacheKey, promise);
  }
  await schemaReady.get(cacheKey);
  return getPoolForConnection(connection);
}

function key(value) {
  return String(value ?? "");
}

// The saved game list is read live on every page load, so freezing it into the
// snapshot would only give the page a stale list after a game is added or removed.
function withoutGameList(page) {
  return { ...page, games: undefined };
}

function withGameList(page, games) {
  return games ? { ...page, games } : page;
}

// The snapshot stands until the daily job replaces it, so that — not the old
// one-hour TTL — is what the page should advertise as its next refresh.
function withDailyRefresh(page) {
  return { ...page, nextRefreshAt: nextGameinfoMarketRunAt().toISOString() };
}

export async function readGameinfoPricePage(market, game, productType) {
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT page FROM gameinfo_price_pages WHERE market = $1 AND game = $2 AND product_type = $3`,
    [key(market), key(game), key(productType)]
  );
  return result.rows[0]?.page || null;
}

export async function saveGameinfoPricePage(market, game, productType, page) {
  const pool = await getReadyPool();
  const stored = withoutGameList(page);
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO gameinfo_price_pages (market, game, product_type, page, fetched_at, checked_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (market, game, product_type) DO UPDATE
       SET page = EXCLUDED.page, fetched_at = EXCLUDED.fetched_at, checked_at = EXCLUDED.checked_at`,
    [key(market), key(game), key(productType), JSON.stringify(stored), stored.fetchedAt || now, stored.checkedAt || now]
  );
}

// Pruning the snapshot of a game that was just removed from the list is
// housekeeping, so a failure here must not fail the delete the user asked for.
export async function deleteGameinfoPricePages(market, game) {
  try {
    const pool = await getReadyPool();
    await pool.query(`DELETE FROM gameinfo_price_pages WHERE market = $1 AND game = $2`, [key(market), key(game)]);
  } catch (error) {
    console.error(`[gameinfo-price-pages] delete ${market}/${game} failed`, error);
  }
}

export async function listGameinfoPricePageKeys() {
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT market, game, product_type FROM gameinfo_price_pages ORDER BY market, game, product_type`
  );
  return result.rows.map((row) => ({ market: row.market, game: row.game, productType: row.product_type }));
}

// A database that is down or not configured yet must not take the compare page
// with it: the store then behaves like the in-memory cache it replaced.
const databaseStore = {
  async read(market, game, productType) {
    try {
      return await readGameinfoPricePage(market, game, productType);
    } catch (error) {
      console.error(`[gameinfo-price-pages] read ${market}/${game} failed`, error);
      return null;
    }
  },
  async save(market, game, productType, page) {
    try {
      await saveGameinfoPricePage(market, game, productType, page);
    } catch (error) {
      console.error(`[gameinfo-price-pages] save ${market}/${game} failed`, error);
    }
  },
};

/**
 * Shared cache rule for the three market pages. Order of preference:
 * a hot in-memory copy, the stored snapshot, and only then a live fetch —
 * unless `force` (the refresh button and the daily job) skips straight to it.
 */
export async function resolveGameinfoPricePage({
  market,
  game,
  productType,
  games,
  cache,
  cacheKey,
  ttlMs,
  force = false,
  load,
  normalize = (page) => page,
  serveStoredOnError = false,
  store = databaseStore,
}) {
  const cached = cache.get(cacheKey);
  if (!force) {
    if (cached?.value && cached.expiresAt > Date.now()) return cached.value;
    if (cached?.promise) return cached.promise;
  }
  // The snapshot carries no game list of its own, so the live one is attached on
  // the way out; the memory copy then holds the same page the callers get back.
  let stored = cached?.value;
  if (!stored) {
    const snapshot = await store.read(market, game, productType);
    stored = snapshot ? withGameList(snapshot, games) : null;
    if (!force && stored) {
      cache.set(cacheKey, { value: stored, expiresAt: Date.now() + ttlMs });
      return stored;
    }
  }
  const promise = (async () => {
    const value = withDailyRefresh(settlePricePage(stored, normalize(await load())));
    cache.set(cacheKey, { value, expiresAt: Date.now() + ttlMs });
    await store.save(market, game, productType, withoutGameList(value));
    return value;
  })();
  cache.set(cacheKey, { ...cached, promise });
  try {
    return await promise;
  } catch (error) {
    if (!stored) {
      cache.delete(cacheKey);
      throw error;
    }
    cache.set(cacheKey, { value: stored, expiresAt: Date.now() + ttlMs });
    if (serveStoredOnError) return stored;
    throw error;
  }
}
