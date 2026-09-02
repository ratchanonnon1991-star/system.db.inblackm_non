import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { normalizeGamelistLinks } from "@/server/gameinfo-gamelist-links";
import { normalizeGamelistTutorialCategories } from "@/server/gameinfo-gamelist-tutorial";
import { sanitizeGameinfoPack } from "@/lib/gameinfo-pack-model";
import {
  listGamelistPackColumnRegistry,
  recordGameinfoAudit,
  resolveComputedColumns,
  writeGameinfoColumnRegistry,
} from "@/server/gameinfo-gamelist-packs";
import {
  flattenGameinfoColumnsForLegacy,
  splitGameinfoColumns,
} from "@/lib/gameinfo-column-registry";

function sanitizeCurrencies(currencies) {
  return (Array.isArray(currencies) ? currencies : []).map((currency, currencyIndex) => ({
    id: String(currency?.id || `currency_${currencyIndex + 1}`),
    name: String(currency?.name || ""),
    image: String(currency?.image || ""),
    categories: (Array.isArray(currency?.categories) ? currency.categories : []).map((category, categoryIndex) => ({
      id: String(category?.id || `category_${categoryIndex + 1}`),
      name: String(category?.name || ""),
      packs: (Array.isArray(category?.packs) ? category.packs : []).map(sanitizeGameinfoPack),
    })),
  }));
}

const CONNECTION_NAME = "gameinfo";
const schemaReadyByConnection = new Map();

function emptyData() {
  return {
    fields: { region: "", platform: "", server: "", botManual: "" },
    links: [],
    tutorial: { categories: [] },
    warning: { categories: [] },
    packs: { currencies: [], computedColumns: [], costProfiles: [] },
  };
}

function sanitizeData(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    fields: {
      region: String(source.fields?.region ?? "").slice(0, 255),
      platform: String(source.fields?.platform ?? "").slice(0, 255),
      server: String(source.fields?.server ?? "").slice(0, 255),
      botManual: String(source.fields?.botManual ?? "").slice(0, 255),
    },
    links: normalizeGamelistLinks(Array.isArray(source.links) ? source.links : []),
    tutorial: { categories: normalizeGamelistTutorialCategories(source.tutorial) },
    warning: {
      categories: normalizeGamelistTutorialCategories(source.warning),
      autoOpen: source.warning?.autoOpen === undefined ? true : Boolean(source.warning.autoOpen),
      revision: String(source.warning?.revision || "legacy"),
    },
    packs: {
      currencies: sanitizeCurrencies(source.packs?.currencies),
      computedColumns: Array.isArray(source.packs?.computedColumns) ? source.packs.computedColumns : [],
      // This game's half of the shared column definitions, same shape as the
      // uid store's sentinel row. Dropping it here would silently discard a
      // game's per-pack values on the next save.
      columnOverrides:
        source.packs?.columnOverrides && typeof source.packs.columnOverrides === "object"
          ? source.packs.columnOverrides
          : {},
      costProfiles: Array.isArray(source.packs?.costProfiles) ? source.packs.costProfiles : [],
    },
  };
}

async function connection() {
  const connections = await listConnections();
  const match = connections.find((item) => item.name.trim().toLowerCase() === CONNECTION_NAME);
  return match ? findConnectionWithSecret(match.id) : null;
}

async function readyPool() {
  const selected = await connection();
  if (!selected) {
    const error = new Error(`ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}"`);
    error.status = 503;
    throw error;
  }
  const cacheKey = `${selected.id}:${selected.updatedAt}`;
  if (!schemaReadyByConnection.has(cacheKey)) {
    const promise = (async () => {
      const client = await getPoolForConnection(selected).connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS gameinfo_mode_data (
            game_id INTEGER NOT NULL,
            data_mode VARCHAR(16) NOT NULL CHECK (data_mode IN ('idpass')),
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            version BIGINT NOT NULL DEFAULT 1,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (game_id, data_mode)
          )
        `);
        await client.query(`
          ALTER TABLE gameinfo_mode_data
          ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1
        `);
      } finally {
        client.release();
      }
    })().catch((error) => {
      schemaReadyByConnection.delete(cacheKey);
      throw error;
    });
    schemaReadyByConnection.set(cacheKey, promise);
  }
  await schemaReadyByConnection.get(cacheKey);
  return getPoolForConnection(selected);
}

export async function getGameinfoModeData(gameId, mode, transactionClient = null) {
  if (normalizeGameinfoDataMode(mode) !== "idpass") return emptyData();
  const pool = await readyPool();
  const client = transactionClient || await pool.connect();
  try {
    const result = await client.query(
      `SELECT data, version FROM gameinfo_mode_data WHERE game_id = $1 AND data_mode = 'idpass'`,
      [gameId]
    );
    const data = sanitizeData(result.rows[0]?.data);
    return {
      ...data,
      packs: { ...data.packs, computedColumns: await resolveModeColumns(client, data.packs) },
      version: Number(result.rows[0]?.version) || 1,
    };
  } finally {
    if (!transactionClient) client.release();
  }
}

// idpass keeps its packs in a store of its own, but pack columns are shared by
// every game in both modes — so this resolves them the same way the uid store
// does, and falls back to the game's own columns while the registry is empty.
async function resolveModeColumns(client, packs) {
  const registry = await listGamelistPackColumnRegistry(client);
  return resolveComputedColumns(registry, {
    columns: packs.computedColumns,
    columnOverrides: packs.columnOverrides,
  });
}

export async function listGameinfoModeData(mode) {
  if (normalizeGameinfoDataMode(mode) !== "idpass") return {};
  const pool = await readyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT game_id, data, version FROM gameinfo_mode_data WHERE data_mode = 'idpass'`);
    return Object.fromEntries(result.rows.map((row) => [row.game_id, {
      ...sanitizeData(row.data),
      version: Number(row.version) || 1,
    }]));
  } finally {
    client.release();
  }
}

export async function saveGameinfoModeData(gameId, mode, nextData, transactionClient = null) {
  if (normalizeGameinfoDataMode(mode) !== "idpass") throw new Error("ใช้ mode storage ได้เฉพาะ IDPASS");
  const data = sanitizeData(nextData);
  const pool = await readyPool();
  const client = transactionClient || await pool.connect();
  try {
    // Columns arrive merged, the way every surface reads them. Split them back
    // apart so the shared definition is written once and only this game's
    // formulas and per-pack values stay here — the same trade saveGamelistPacks
    // makes, including keeping `computedColumns` as the rollback copy.
    const registry = await listGamelistPackColumnRegistry(client);
    if (registry.length) {
      const split = splitGameinfoColumns(data.packs.computedColumns);
      // What this save dropped: columns this game was showing before and is
      // not saving now. Diffing against the whole registry instead would let
      // one game's save delete definitions shared with every other game and
      // with uid mode.
      const stored = await client.query(
        `SELECT data FROM gameinfo_mode_data WHERE game_id = $1 AND data_mode = 'idpass'`,
        [gameId]
      );
      const previous = sanitizeData(stored.rows[0]?.data).packs;
      const nextKeys = new Set(data.packs.computedColumns.map((column) => column.key));
      const removedKeys = resolveComputedColumns(registry, {
        columns: previous.computedColumns,
        columnOverrides: previous.columnOverrides,
      })
        .map((column) => column.key)
        .filter((key) => !nextKeys.has(key));
      await writeGameinfoColumnRegistry(client, split.registry, removedKeys);
      data.packs.columnOverrides = split.overrides;
      data.packs.computedColumns = flattenGameinfoColumnsForLegacy(data.packs.computedColumns);
    }
    await client.query(
      `INSERT INTO gameinfo_mode_data (game_id, data_mode, data, version, updated_at)
       VALUES ($1, 'idpass', $2, 2, NOW())
       ON CONFLICT (game_id, data_mode) DO UPDATE
       SET data = EXCLUDED.data, version = gameinfo_mode_data.version + 1, updated_at = NOW()`,
      [gameId, JSON.stringify(data)]
    );
  } finally {
    if (!transactionClient) client.release();
  }
  return data;
}

export async function updateGameinfoModeData(
  gameId,
  mode,
  updater,
  { area = null, actor = null, expectedVersion } = {}
) {
  if (normalizeGameinfoDataMode(mode) !== "idpass") throw new Error("ใช้ mode storage ได้เฉพาะ IDPASS");
  const pool = await readyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const game = await client.query(`SELECT id FROM game_list WHERE id = $1 FOR UPDATE`, [gameId]);
    if (game.rows.length !== 1) {
      const error = new Error("ไม่พบเกม");
      error.status = 404;
      throw error;
    }
    const currentResult = await client.query(
      `SELECT data, version FROM gameinfo_mode_data WHERE game_id = $1 AND data_mode = 'idpass' FOR UPDATE`,
      [gameId]
    );
    const currentVersion = Number(currentResult.rows[0]?.version) || 1;
    if (expectedVersion !== undefined && (
      !Number.isSafeInteger(Number(expectedVersion)) || Number(expectedVersion) !== currentVersion
    )) {
      const conflict = new Error(
        "ข้อมูลถูกแก้โดยผู้ใช้อื่น การบันทึกครั้งนี้ยังไม่ถูกนำไปเขียนทับ กรุณาโหลดข้อมูลล่าสุดก่อนแก้และบันทึกใหม่"
      );
      conflict.status = 409;
      throw conflict;
    }
    const current = sanitizeData(currentResult.rows[0]?.data);
    const next = sanitizeData(await updater(structuredClone(current)));
    const nextVersion = currentVersion + 1;
    await client.query(
      `INSERT INTO gameinfo_mode_data (game_id, data_mode, data, version, updated_at)
       VALUES ($1, 'idpass', $2, $3, NOW())
       ON CONFLICT (game_id, data_mode) DO UPDATE
       SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = NOW()`,
      [gameId, JSON.stringify(next), nextVersion]
    );
    if (area) {
      const slice = (data) => {
        if (area === "game") return data.fields;
        if (area === "pack") return data.packs;
        if (area === "tutorial") return data.tutorial;
        if (area === "warning") return data.warning;
        if (area === "links") return data.links;
        return data;
      };
      await recordGameinfoAudit({
        gameId,
        area,
        dataMode: "idpass",
        actor,
        before: slice(current),
        after: slice(next),
        client,
      });
    }
    await client.query("COMMIT");
    return { ...next, version: nextVersion };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteGameinfoModeData(gameId, transactionClient = null) {
  const pool = await readyPool();
  const client = transactionClient || await pool.connect();
  try {
    await client.query(`DELETE FROM gameinfo_mode_data WHERE game_id = $1`, [gameId]);
  } finally {
    if (!transactionClient) client.release();
  }
}
