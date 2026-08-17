// Packs for a game_list-based game — same UX as the old games/game_packs
// pack editor, but storage is deliberately as small as that one was before it
// grew a computed_column on `games`: one table keyed by (game_id, pack_id)
// with everything else as a JSONB blob. game_id here is game_list's own id
// (an external, shared table we don't own — no FK, no ON DELETE CASCADE;
// cleanup on game delete is done explicitly by deleteGameListRow()).
//
// Computed columns have nowhere else to live (game_list isn't ours to ALTER),
// so they're stored as one sentinel row per game at pack_id = "__computed__"
// rather than adding a second table — keeps the "just id -> pack_id -> json"
// shape the whole way through.
import { getPoolForConnection } from "@/lib/db";
import { sanitizeGameinfoPack } from "@/lib/gameinfo-pack-model";
import {
  sanitizeGameinfoCostProfiles,
  validateGameinfoCostProfiles,
} from "@/lib/gameinfo-cost-profiles";
import { mergeCurrencies } from "@/lib/gameinfo-import";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";
const COMPUTED_SENTINEL = "__computed__";

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// --- currencies[] (UI shape) <-> gamelist_packs rows (storage shape) -----
// Ported from the old games/game_packs storage (src/server/gameinfo-games.js,
// now removed — game_list-based storage was the only consumer left).

/** One flat row per pack -> the nested currency/category/pack tree the UI
 * (GameinfoGameView, GameinfoPackEditor) already expects. */
function reconstructCurrencies(packRows) {
  const currencies = new Map();
  for (const { pack_id: packId, data } of packRows) {
    const d = data || {};
    if (!currencies.has(d.currencyId)) {
      currencies.set(d.currencyId, {
        id: d.currencyId,
        name: d.currencyName || "",
        image: d.currencyImage || "",
        order: d.currencyOrder ?? 0,
        categories: new Map(),
      });
    }
    const currency = currencies.get(d.currencyId);
    if (!currency.categories.has(d.categoryId)) {
      currency.categories.set(d.categoryId, {
        id: d.categoryId,
        name: d.categoryName || "",
        order: d.categoryOrder ?? 0,
        packs: [],
      });
    }
    currency.categories.get(d.categoryId).packs.push({
      ...sanitizeGameinfoPack({ ...d, id: packId }),
      order: d.packOrder ?? 0,
    });
  }
  return [...currencies.values()]
    .sort((a, b) => a.order - b.order)
    .map((currency) => ({
      id: currency.id,
      name: currency.name,
      image: currency.image,
      categories: [...currency.categories.values()]
        .sort((a, b) => a.order - b.order)
        .map((category) => ({
          id: category.id,
          name: category.name,
          packs: category.packs
            .sort((a, b) => a.order - b.order)
            .map(({ order, ...pack }) => pack),
        })),
    }));
}

/** The nested UI tree -> one { packId, gameId, data } per pack, ready to
 * insert. Currency/category grouping and display order are carried inside
 * `data` (packOrder/categoryOrder/currencyOrder) since there's no separate
 * currency/category table. */
function flattenCurrencies(gameId, currencies) {
  const rows = [];
  (currencies || []).forEach((currency, currencyOrder) => {
    (currency.categories || []).forEach((category, categoryOrder) => {
      (category.packs || []).forEach((pack, packOrder) => {
        const cleanPack = sanitizeGameinfoPack(pack);
        rows.push({
          packId: cleanPack.id,
          gameId,
          data: {
            currencyId: currency.id,
            currencyName: currency.name || "",
            currencyImage: currency.image || "",
            currencyOrder,
            categoryId: category.id,
            categoryName: category.name || "",
            categoryOrder,
            packOrder,
            name: cleanPack.name,
            image: cleanPack.image,
            price: cleanPack.price,
            amountChargedFee: cleanPack.amountChargedFee,
            costProfileId: cleanPack.costProfileId,
            channelsMain: cleanPack.channelsMain,
            channelsSecondary: cleanPack.channelsSecondary,
            country: cleanPack.country,
          },
        });
      });
    });
  });
  return rows;
}

async function getGameinfoConnection() {
  const connections = await listConnections();
  const match = connections.find((c) => c.name.trim().toLowerCase() === CONNECTION_NAME);
  if (!match) return null;
  return findConnectionWithSecret(match.id);
}

const schemaReadyByConnection = new Map();

function ensureSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached && cached.cacheKey === cacheKey) return cached.promise;

  const promise = (async () => {
    const pool = getPoolForConnection(connection);
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_packs (
          game_id    INTEGER NOT NULL,
          pack_id    TEXT NOT NULL,
          data       JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (game_id, pack_id)
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS gamelist_packs_game_id_idx ON gamelist_packs (game_id)
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_pack_audit_logs (
          id          BIGSERIAL PRIMARY KEY,
          game_id     INTEGER NOT NULL,
          pack_id     TEXT,
          actor_id    INTEGER,
          actor_name  VARCHAR(255) NOT NULL DEFAULT '',
          action      VARCHAR(32) NOT NULL,
          source      VARCHAR(32) NOT NULL DEFAULT 'editor',
          before_data JSONB,
          after_data  JSONB,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS gamelist_pack_audit_game_time_idx
        ON gamelist_pack_audit_logs (game_id, created_at DESC, id DESC)
      `);
      await client.query(`
        ALTER TABLE gamelist_pack_audit_logs
        ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'editor'
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_pack_view_presets (
          id          BIGSERIAL PRIMARY KEY,
          game_id     INTEGER NOT NULL,
          user_id     INTEGER NOT NULL,
          surface     VARCHAR(12) NOT NULL CHECK (surface IN ('edit', 'view')),
          name        VARCHAR(80) NOT NULL,
          layout      JSONB NOT NULL DEFAULT '{"order": [], "hidden": []}'::jsonb,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (game_id, user_id, surface, name)
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS gamelist_pack_view_presets_owner_idx
        ON gamelist_pack_view_presets (game_id, user_id, surface, updated_at DESC, id DESC)
      `);
    } finally {
      client.release();
    }
  })();
  promise.catch(() => schemaReadyByConnection.delete(connection.id));
  schemaReadyByConnection.set(connection.id, { cacheKey, promise });
  return promise;
}

async function getReadyPool() {
  const connection = await getGameinfoConnection();
  if (!connection) {
    throw createHttpError(
      `ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}" — เพิ่ม Connection ชื่อนี้ก่อนที่หน้า Connections`,
      503
    );
  }
  await ensureSchema(connection);
  return getPoolForConnection(connection);
}

/** Shared pack data/config for one game_list row's id. */
export async function getGamelistPacks(gameId) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT game_id, pack_id, data FROM gamelist_packs WHERE game_id = $1`,
      [gameId]
    );
    const computedRow = result.rows.find((r) => r.pack_id === COMPUTED_SENTINEL);
    const packRows = result.rows.filter((r) => r.pack_id !== COMPUTED_SENTINEL);
    return {
      currencies: reconstructCurrencies(packRows),
      computedColumns: Array.isArray(computedRow?.data?.columns) ? computedRow.data.columns : [],
      costProfiles: sanitizeGameinfoCostProfiles(computedRow?.data?.costProfiles),
      schemaVersion: Number(computedRow?.data?.schemaVersion) || 1,
    };
  } finally {
    client.release();
  }
}

/** Full-tree replace, same shape as the old saveGameinfoPacks — delete every
 * row for this game and reinsert, including the computed-columns sentinel. */
export async function saveGamelistPacks(
  gameId,
  { currencies, computedColumns, costProfiles, actor = null, source = "editor" }
) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const previousResult = await client.query(
      `SELECT game_id, pack_id, data FROM gamelist_packs WHERE game_id = $1`,
      [gameId]
    );
    const previousComputed = previousResult.rows.find((row) => row.pack_id === COMPUTED_SENTINEL);
    const previousRows = previousResult.rows.filter((row) => row.pack_id !== COMPUTED_SENTINEL);
    const nextRows = flattenCurrencies(gameId, Array.isArray(currencies) ? currencies : []);
    const nextComputed = Array.isArray(computedColumns) ? computedColumns : [];
    const previousCostProfiles = sanitizeGameinfoCostProfiles(previousComputed?.data?.costProfiles);
    const submittedCostProfiles = sanitizeGameinfoCostProfiles(costProfiles);
    const actorId = Number(actor?.id);
    const changedAt = new Date().toISOString();
    const nextCostProfiles = submittedCostProfiles.map((profile) => {
      const previous = previousCostProfiles.find((item) => item.id === profile.id);
      if (previous && sameJson(costProfileDefinition(previous), costProfileDefinition(profile))) {
        return { ...profile, updatedAt: previous.updatedAt, updatedBy: previous.updatedBy };
      }
      return {
        ...profile,
        updatedAt: changedAt,
        updatedBy: Number.isInteger(actorId) && actorId > 0 ? actorId : null,
      };
    });
    const profileErrors = validateGameinfoCostProfiles(nextCostProfiles);
    if (profileErrors.length) throw createHttpError(profileErrors[0], 400);
    const validProfileIds = new Set(nextCostProfiles.map((profile) => profile.id));
    const missingProfile = nextRows.find(
      (row) => row.data.costProfileId && !validProfileIds.has(row.data.costProfileId)
    );
    if (missingProfile) {
      throw createHttpError(`pack ${missingProfile.packId} อ้างโปรไฟล์ต้นทุนที่ไม่มีอยู่`, 400);
    }
    const auditEvents = buildAuditEvents({
      previousRows,
      nextRows,
      previousComputed: Array.isArray(previousComputed?.data?.columns)
        ? previousComputed.data.columns
        : [],
      nextComputed,
      previousCostProfiles,
      nextCostProfiles,
      source,
    });

    await client.query(`DELETE FROM gamelist_packs WHERE game_id = $1`, [gameId]);
    for (const r of nextRows) {
      await client.query(
        `INSERT INTO gamelist_packs (game_id, pack_id, data) VALUES ($1, $2, $3)`,
        [r.gameId, r.packId, JSON.stringify(r.data)]
      );
    }
    await client.query(
      `INSERT INTO gamelist_packs (game_id, pack_id, data) VALUES ($1, $2, $3)`,
      [
        gameId,
        COMPUTED_SENTINEL,
        JSON.stringify({ schemaVersion: 2, columns: nextComputed, costProfiles: nextCostProfiles }),
      ]
    );
    for (const event of auditEvents) {
      await insertPackAudit(client, gameId, actor, event, source);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getGamelistPacks(gameId);
}

/** Multi-game CSV import in one transaction. Computed-column sentinel rows
 * are preserved; only real pack rows are replaced/merged. */
export async function importGamelistPacks(games, mode = "replace", actor = null) {
  if (!Array.isArray(games) || games.length === 0) return { gameCount: 0, packCount: 0 };
  if (mode !== "replace" && mode !== "add") throw createHttpError("โหมดนำเข้าไม่ถูกต้อง", 400);
  const source = mode === "add" ? "csv_append" : "csv_replace";
  const pool = await getReadyPool();
  const client = await pool.connect();
  let importedPackCount = 0;
  try {
    await client.query("BEGIN");
    for (const game of games) {
      const target = await client.query(`SELECT id FROM game_list WHERE id = $1 FOR UPDATE`, [game.gameId]);
      if (target.rows.length !== 1) throw createHttpError(`ไม่พบ game_id ${game.gameId}`, 404);

      const previousResult = await client.query(
        `SELECT game_id, pack_id, data FROM gamelist_packs WHERE game_id = $1`,
        [game.gameId]
      );
      const previousComputed = previousResult.rows.find((row) => row.pack_id === COMPUTED_SENTINEL);
      const previousRows = previousResult.rows.filter((row) => row.pack_id !== COMPUTED_SENTINEL);
      let currencies = Array.isArray(game.currencies) ? game.currencies : [];
      if (mode === "add") currencies = mergeCurrencies(reconstructCurrencies(previousRows), currencies);
      const nextRows = flattenCurrencies(game.gameId, currencies);
      const computedColumns = Array.isArray(previousComputed?.data?.columns)
        ? previousComputed.data.columns
        : [];
      const costProfiles = sanitizeGameinfoCostProfiles(previousComputed?.data?.costProfiles);
      const auditEvents = buildAuditEvents({
        previousRows,
        nextRows,
        previousComputed: computedColumns,
        nextComputed: computedColumns,
        previousCostProfiles: costProfiles,
        nextCostProfiles: costProfiles,
        source,
      });

      await client.query(
        `DELETE FROM gamelist_packs WHERE game_id = $1 AND pack_id != $2`,
        [game.gameId, COMPUTED_SENTINEL]
      );
      for (const row of nextRows) {
        await client.query(
          `INSERT INTO gamelist_packs (game_id, pack_id, data) VALUES ($1, $2, $3)`,
          [row.gameId, row.packId, JSON.stringify(row.data)]
        );
      }
      for (const event of auditEvents) {
        await insertPackAudit(client, game.gameId, actor, event, source);
      }
      importedPackCount += Number(game.packCount) || 0;
    }
    await client.query("COMMIT");
    return { gameCount: games.length, packCount: importedPackCount };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function buildAuditEvents({
  previousRows,
  nextRows,
  previousComputed,
  nextComputed,
  previousCostProfiles = [],
  nextCostProfiles = [],
  source,
}) {
  const events = [];
  const before = new Map(previousRows.map((row) => [String(row.pack_id), row.data || {}]));
  const after = new Map(nextRows.map((row) => [String(row.packId), row.data || {}]));

  for (const [packId, data] of before) {
    if (!after.has(packId)) {
      events.push({ packId, action: "delete", before: data, after: null });
    }
  }

  for (const [packId, data] of after) {
    const old = before.get(packId);
    if (old) {
      if (!sameJson(old, data)) {
        events.push({
          packId,
          action: onlyPositionChanged(old, data) ? "reorder" : "update",
          before: old,
          after: data,
        });
      }
      continue;
    }
    const duplicateSource = findDuplicateSource(before, data);
    events.push({
      packId,
      action: duplicateSource ? "duplicate" : "create",
      before: duplicateSource
        ? { sourcePackId: duplicateSource.packId, ...duplicateSource.data }
        : null,
      after: data,
    });
  }

  if (!sameJson(previousComputed, nextComputed) || !sameJson(previousCostProfiles, nextCostProfiles)) {
    events.push({
      packId: null,
      action: "config_update",
      before: { computedColumns: previousComputed, costProfiles: previousCostProfiles },
      after: { computedColumns: nextComputed, costProfiles: nextCostProfiles },
    });
  }
  if ((source === "csv_append" || source === "csv_replace") && events.length > 0) {
    events.push({
      packId: null,
      action: source === "csv_append" ? "import_append" : "import_replace",
      before: { packCount: previousRows.length },
      after: { packCount: nextRows.length },
    });
  }
  return events;
}

function findDuplicateSource(before, nextData) {
  for (const [packId, data] of before) {
    if (nextData.name !== `${data.name || ""} (สำเนา)`) continue;
    const sourceComparable = { ...data, name: nextData.name, packOrder: nextData.packOrder };
    if (sameJson(sourceComparable, nextData)) return { packId, data };
  }
  return null;
}

function sameJson(a, b) {
  return JSON.stringify(canonicalJson(a)) === JSON.stringify(canonicalJson(b));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = canonicalJson(value[key]);
  return out;
}

function costProfileDefinition(profile) {
  const { updatedAt, updatedBy, ...definition } = profile || {};
  return definition;
}

function onlyPositionChanged(before, after) {
  const withoutPosition = (value) => {
    const { currencyOrder, categoryOrder, packOrder, ...rest } = value || {};
    return rest;
  };
  return sameJson(withoutPosition(before), withoutPosition(after));
}

async function insertPackAudit(client, gameId, actor, event, source) {
  const actorId = Number(actor?.id);
  const safeActorId = Number.isInteger(actorId) && actorId > 0 ? actorId : null;
  const actorName = String(actor?.name || "").slice(0, 255);
  await client.query(
    `INSERT INTO gamelist_pack_audit_logs
       (game_id, pack_id, actor_id, actor_name, action, source, before_data, after_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
    [
      gameId,
      event.packId,
      safeActorId,
      actorName,
      event.action,
      source === "csv_append" || source === "csv_replace" ? source : "editor",
      event.before == null ? null : JSON.stringify(event.before),
      event.after == null ? null : JSON.stringify(event.after),
    ]
  );
}

export async function listGamelistPackAudit(gameId, limit = 100) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    const result = await client.query(
      `SELECT id, game_id, pack_id, actor_id, actor_name, action, source,
              before_data, after_data, created_at
       FROM gamelist_pack_audit_logs
       WHERE game_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [gameId, safeLimit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      gameId: row.game_id,
      packId: row.pack_id,
      actorId: row.actor_id,
      actorName: row.actor_name,
      action: row.action,
      source: row.source || "editor",
      before: row.before_data,
      after: row.after_data,
      createdAt: row.created_at,
    }));
  } finally {
    client.release();
  }
}

export async function listAllGamelistPackAudit(limit = 1000) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const safeLimit = Math.min(2000, Math.max(1, Number(limit) || 1000));
    const result = await client.query(
      `SELECT a.id, a.game_id, g.game, a.pack_id, a.actor_id, a.actor_name,
              a.action, a.source, a.before_data, a.after_data, a.created_at
       FROM gamelist_pack_audit_logs a
       LEFT JOIN game_list g ON g.id = a.game_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $1`,
      [safeLimit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      gameId: row.game_id,
      gameName: row.game || `Game ID ${row.game_id}`,
      packId: row.pack_id,
      actorId: row.actor_id,
      actorName: row.actor_name,
      action: row.action,
      source: row.source || "editor",
      before: row.before_data,
      after: row.after_data,
      createdAt: row.created_at,
    }));
  } finally {
    client.release();
  }
}

// --- Personal pack-table display presets ---------------------------------
// These are deliberately separate from gamelist_packs and its audit log:
// they change only one person's screen, never the underlying pack data. The
// gameinfo connection owns this table, while the user row itself lives in the
// primary GameDB connection, so user_id is intentionally not a foreign key.

function normalizePresetScope({ gameId, userId, surface }) {
  const safeGameId = Number(gameId);
  const safeUserId = Number(userId);
  if (!Number.isInteger(safeGameId) || safeGameId <= 0) {
    throw createHttpError("gameId ไม่ถูกต้อง", 400);
  }
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    throw createHttpError("ผู้ใช้ไม่ถูกต้อง", 400);
  }
  if (surface !== "edit" && surface !== "view") {
    throw createHttpError("surface ต้องเป็น edit หรือ view", 400);
  }
  return { gameId: safeGameId, userId: safeUserId, surface };
}

function normalizePresetName(value) {
  if (typeof value !== "string") throw createHttpError("กรุณาตั้งชื่อ preset", 400);
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw createHttpError("กรุณาตั้งชื่อ preset", 400);
  if (name.length > 80) throw createHttpError("ชื่อ preset ยาวได้ไม่เกิน 80 ตัวอักษร", 400);
  return name;
}

function presetColumnIds(value) {
  const ids = [];
  for (const item of Array.isArray(value) ? value : []) {
    const id = typeof item === "string" ? item.trim() : "";
    if (!id || id.length > 128 || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= 200) break;
  }
  return ids;
}

/** Keep a persisted layout deliberately generic. The client knows the live
 * column schema and will safely merge this into it; the server only accepts a
 * bounded JSON shape so a preset cannot be used to store arbitrary data. */
export function sanitizeGamelistPackViewPresetLayout(layout) {
  const filters = [];
  for (const filter of Array.isArray(layout?.filters) ? layout.filters : []) {
    const columnId = typeof filter?.columnId === "string" ? filter.columnId.trim().slice(0, 128) : "";
    const operator = ["contains", "equals", "not_empty", "empty"].includes(filter?.operator)
      ? filter.operator
      : "contains";
    if (!columnId) continue;
    filters.push({ columnId, operator, value: String(filter?.value ?? "").slice(0, 200) });
    if (filters.length >= 10) break;
  }
  const sanitized = {
    order: presetColumnIds(layout?.order),
    hidden: presetColumnIds(layout?.hidden),
  };
  if (Array.isArray(layout?.filters)) sanitized.filters = filters;
  return sanitized;
}

function mapGamelistPackViewPreset(row) {
  return {
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    surface: row.surface,
    name: row.name,
    layout: sanitizeGamelistPackViewPresetLayout(row.layout),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listGamelistPackViewPresets({ gameId, userId, surface }) {
  const scope = normalizePresetScope({ gameId, userId, surface });
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, game_id, user_id, surface, name, layout, created_at, updated_at
       FROM gamelist_pack_view_presets
       WHERE game_id = $1 AND user_id = $2 AND surface = $3
       ORDER BY updated_at DESC, id DESC`,
      [scope.gameId, scope.userId, scope.surface]
    );
    return result.rows.map(mapGamelistPackViewPreset);
  } finally {
    client.release();
  }
}

/** Create a named preset, or update only a preset in the current user's
 * game/surface scope. `presetId` is omitted for Save as new. */
export async function saveGamelistPackViewPreset({
  gameId,
  userId,
  surface,
  presetId = null,
  name,
  layout,
}) {
  const scope = normalizePresetScope({ gameId, userId, surface });
  const safeName = normalizePresetName(name);
  const safeLayout = sanitizeGamelistPackViewPresetLayout(layout);
  const safePresetId = presetId == null || presetId === "" ? null : Number(presetId);
  if (safePresetId != null && (!Number.isInteger(safePresetId) || safePresetId <= 0)) {
    throw createHttpError("presetId ไม่ถูกต้อง", 400);
  }

  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    let result;
    if (safePresetId == null) {
      result = await client.query(
        `INSERT INTO gamelist_pack_view_presets (game_id, user_id, surface, name, layout)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, game_id, user_id, surface, name, layout, created_at, updated_at`,
        [scope.gameId, scope.userId, scope.surface, safeName, JSON.stringify(safeLayout)]
      );
    } else {
      result = await client.query(
        `UPDATE gamelist_pack_view_presets
         SET name = $5, layout = $6::jsonb, updated_at = NOW()
         WHERE id = $1 AND game_id = $2 AND user_id = $3 AND surface = $4
         RETURNING id, game_id, user_id, surface, name, layout, created_at, updated_at`,
        [
          safePresetId,
          scope.gameId,
          scope.userId,
          scope.surface,
          safeName,
          JSON.stringify(safeLayout),
        ]
      );
      if (result.rows.length === 0) throw createHttpError("ไม่พบ preset ที่ต้องการบันทึก", 404);
    }
    return mapGamelistPackViewPreset(result.rows[0]);
  } catch (error) {
    // The unique constraint remains the authority under concurrent browser
    // requests; turn its database error into a recoverable UI message.
    if (error?.code === "23505") {
      throw createHttpError("มี preset ชื่อนี้อยู่แล้ว กรุณาตั้งชื่ออื่น", 409);
    }
    throw error;
  } finally {
    client.release();
  }
}

/** { [gameId]: { main: string[], secondary: string[] } } — unique
 * channelsMain and channelsSecondary across every pack of every game, kept
 * separate (not merged into one list) so the UI can label which is which and
 * say "ไม่มี" for whichever side has nothing, one query for the whole list.
 * Same aggregation the old games-admin table did per game (see the removed
 * toRow() in gameinfo/[lang]/admin/page.js) — used to show a read-only
 * "channel" column on the game_list table without a per-row query per game. */
export async function listGamelistChannelsByGame() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT game_id, data FROM gamelist_packs WHERE pack_id != $1`,
      [COMPUTED_SENTINEL]
    );
    const byGame = new Map();
    for (const row of result.rows) {
      const entry = byGame.get(row.game_id) || { main: new Set(), secondary: new Set() };
      const d = row.data || {};
      (d.channelsMain || []).forEach((c) => c && entry.main.add(c));
      (d.channelsSecondary || []).forEach((c) => c && entry.secondary.add(c));
      byGame.set(row.game_id, entry);
    }
    const out = {};
    for (const [gameId, entry] of byGame) {
      out[gameId] = { main: [...entry.main], secondary: [...entry.secondary] };
    }
    return out;
  } finally {
    client.release();
  }
}

/** Every distinct channelsMain/channelsSecondary value across every game's
 * packs, main and secondary merged into one flat sorted list (not split by
 * game or by main/secondary side) — feeds the pack editor's channel
 * autocomplete so a channel typed for one game is immediately offered while
 * editing any other game's packs, instead of each game only "remembering"
 * its own. */
export async function listAllGamelistChannels() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT data FROM gamelist_packs WHERE pack_id != $1`,
      [COMPUTED_SENTINEL]
    );
    const all = new Set();
    for (const row of result.rows) {
      const d = row.data || {};
      (d.channelsMain || []).forEach((c) => c && all.add(c));
      (d.channelsSecondary || []).forEach((c) => c && all.add(c));
    }
    return [...all].sort((a, b) => a.localeCompare(b, "th"));
  } finally {
    client.release();
  }
}

/** { [gameId]: true } for games where at least one pack has a `country`
 * value set — `country` is only meaningful on VPN-required packs (see the
 * pack editor's vpnOn-gated country field), so its presence is used as the
 * source of truth for a "VPN" column instead of game_list's own free-text
 * `vpn` field (which this replaces). Absent from the map = "NO". */
export async function listGamelistVpnByGame() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT DISTINCT game_id FROM gamelist_packs
       WHERE pack_id != $1 AND NULLIF(TRIM(data->>'country'), '') IS NOT NULL`,
      [COMPUTED_SENTINEL]
    );
    const out = {};
    for (const row of result.rows) out[row.game_id] = true;
    return out;
  } finally {
    client.release();
  }
}

/** Cleanup hook for deleteGameListRow() — game_list isn't ours to put an FK
 * CASCADE on, so this has to be called explicitly. */
export async function deleteGamelistPacksForGame(gameId) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM gamelist_packs WHERE game_id = $1`, [gameId]);
  } finally {
    client.release();
  }
}

/** { [gameId]: count } — number of real packs (the "__computed__" sentinel
 * row doesn't count) per game, one query for the whole list table. */
export async function listGamelistPackCountByGame() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT game_id, COUNT(*)::int AS pack_count FROM gamelist_packs
       WHERE pack_id != $1 GROUP BY game_id`,
      [COMPUTED_SENTINEL]
    );
    const out = {};
    for (const row of result.rows) out[row.game_id] = row.pack_count;
    return out;
  } finally {
    client.release();
  }
}
