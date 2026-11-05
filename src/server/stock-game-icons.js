import { getPool } from "@/lib/db";
import { appStoreKey, appStoreSearchUrl, pickAppStoreIcon } from "@/lib/stock-app-store";

// App Store icons for Stock's game names, looked up once and kept in
// stock_game_icons so a page load does not call Apple each time. Only the
// icon's URL is kept (Apple's own CDN serves the image). A name Apple has no
// game for is remembered too, and asked again after a day.
let schemaReady;
const FOUND_FOR_DAYS = 30;
const MISSED_FOR_HOURS = 24;
const LOOKUPS_PER_LOAD = 8;

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = getPool().query(`
    CREATE TABLE IF NOT EXISTS stock_game_icons (
      name_key    VARCHAR(255) PRIMARY KEY,
      name        VARCHAR(255) NOT NULL,
      app_id      VARCHAR(40) NOT NULL DEFAULT '',
      app_name    VARCHAR(255) NOT NULL DEFAULT '',
      artwork_url TEXT NOT NULL DEFAULT '',
      checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  schemaReady.catch(() => { schemaReady = null; });
  return schemaReady;
}

async function lookUp(name) {
  for (const country of ["th", "us"]) {
    const response = await fetch(appStoreSearchUrl(name, country), { signal: AbortSignal.timeout(4000), headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`App Store search ${response.status}`);
    const found = pickAppStoreIcon(name, (await response.json()).results);
    if (found) return found;
  }
  return null;
}

/**
 * Game names → { [appStoreKey(name)]: artworkUrl } for those the App Store has a game for.
 * Names not looked up yet (or due again) are asked now, a few per call; a
 * failed call leaves that name for the next load. Never throws.
 */
export async function listAppStoreIcons(names) {
  const byKey = new Map();
  for (const name of names) {
    const key = appStoreKey(name);
    if (key.length >= 3 && !byKey.has(key)) byKey.set(key, String(name).trim());
  }
  if (!byKey.size) return {};
  try {
    await ensureSchema();
    const rows = (await getPool().query(
      `SELECT name_key, artwork_url,
              checked_at > NOW() - (CASE WHEN artwork_url = '' THEN $2 ELSE $3 END)::interval AS fresh
         FROM stock_game_icons WHERE name_key = ANY($1::text[])`,
      [[...byKey.keys()], `${MISSED_FOR_HOURS} hours`, `${FOUND_FOR_DAYS} days`]
    )).rows;
    const cached = new Map(rows.map((row) => [row.name_key, row]));
    const due = [...byKey.keys()].filter((key) => !cached.get(key)?.fresh).slice(0, LOOKUPS_PER_LOAD);
    await Promise.all(due.map(async (key) => {
      try {
        const found = await lookUp(byKey.get(key));
        await getPool().query(
          `INSERT INTO stock_game_icons (name_key, name, app_id, app_name, artwork_url, checked_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (name_key) DO UPDATE SET name = $2, app_id = $3, app_name = $4, artwork_url = $5, checked_at = NOW()`,
          [key, byKey.get(key).slice(0, 255), found?.appId || "", (found?.appName || "").slice(0, 255), found?.artworkUrl || ""]
        );
        cached.set(key, { artwork_url: found?.artworkUrl || "" });
      } catch (error) {
        console.error(`stock: App Store icon for "${byKey.get(key)}" unavailable`, error instanceof Error ? error.message : error);
      }
    }));
    const icons = {};
    for (const key of byKey.keys()) if (cached.get(key)?.artwork_url) icons[key] = cached.get(key).artwork_url;
    return icons;
  } catch (error) {
    console.error("stock: App Store icons unavailable", error);
    return {};
  }
}
