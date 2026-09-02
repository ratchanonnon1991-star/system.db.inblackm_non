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
import { findDuplicateGameinfoPackNamePrices } from "@/lib/gameinfo-pack-validation";
import {
  sanitizeGameinfoCostProfiles,
  validateGameinfoCostProfiles,
} from "@/lib/gameinfo-cost-profiles";
import { mergeCurrencies } from "@/lib/gameinfo-import";
import {
  flattenGameinfoColumnsForLegacy,
  mergeGameinfoColumns,
  splitGameinfoColumns,
} from "@/lib/gameinfo-column-registry";
import { parseFormula } from "@/lib/gamedb-formula";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";
const COMPUTED_SENTINEL = "__computed__";

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function assertUniquePackNamePrices(currencies) {
  if (findDuplicateGameinfoPackNamePrices(currencies).size === 0) return;
  throw createHttpError("ชื่อ Pack และราคาห้ามซ้ำกันพร้อมกัน", 400);
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
            localizedNames: cleanPack.localizedNames,
            image: cleanPack.image,
            price: cleanPack.price,
            amountChargedFee: cleanPack.amountChargedFee,
            serviceEnabled: cleanPack.serviceEnabled,
            serviceStatus: cleanPack.serviceStatus,
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
        CREATE TABLE IF NOT EXISTS gamelist_pack_revisions (
          game_id INTEGER PRIMARY KEY,
          version BIGINT NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
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
        ALTER TABLE gamelist_pack_audit_logs
        ADD COLUMN IF NOT EXISTS area VARCHAR(32) NOT NULL DEFAULT 'pack',
        ADD COLUMN IF NOT EXISTS data_mode VARCHAR(16) NOT NULL DEFAULT 'uid'
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS gamelist_pack_audit_area_time_idx
        ON gamelist_pack_audit_logs (area, created_at DESC, id DESC)
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
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        DELETE FROM gamelist_pack_view_presets v
        WHERE v.surface = 'view'
          AND EXISTS (
            SELECT 1 FROM gamelist_pack_view_presets e
            WHERE e.surface = 'edit'
              AND e.game_id = v.game_id
              AND e.user_id = v.user_id
              AND e.name = v.name
          )
      `);
      await client.query(`
        DROP INDEX IF EXISTS gamelist_pack_view_presets_game_user_surface_name
      `);
      await client.query(`
        DROP INDEX IF EXISTS gamelist_pack_view_presets_game_user_name
      `);
      await client.query(`
        ALTER TABLE gamelist_pack_view_presets
        DROP CONSTRAINT IF EXISTS gamelist_pack_view_presets_game_id_user_id_surface_name_key
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS gamelist_pack_view_presets_owner_name_key
        ON gamelist_pack_view_presets (game_id, user_id, name)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS gamelist_pack_view_presets_owner_idx
        ON gamelist_pack_view_presets (game_id, user_id, surface, updated_at DESC, id DESC)
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_pack_languages (
          id              BIGSERIAL PRIMARY KEY,
          name            VARCHAR(80) NOT NULL,
          normalized_name VARCHAR(80) NOT NULL UNIQUE,
          created_by      INTEGER,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gameinfo_formula_presets (
          id              BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
          normalized_name TEXT NOT NULL UNIQUE CHECK (char_length(normalized_name) BETWEEN 1 AND 80),
          formula         TEXT NOT NULL CHECK (char_length(formula) BETWEEN 1 AND 500),
          result_type     TEXT NOT NULL CHECK (result_type IN ('number', 'text', 'date', 'boolean')),
          symbol          TEXT NOT NULL DEFAULT '' CHECK (char_length(symbol) <= 24),
          created_by      INTEGER,
          created_by_name TEXT NOT NULL DEFAULT '',
          updated_by      INTEGER,
          updated_by_name TEXT NOT NULL DEFAULT '',
          version         BIGINT NOT NULL DEFAULT 1,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        ALTER TABLE gameinfo_formula_presets
        ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS gameinfo_formula_presets_updated_idx
        ON gameinfo_formula_presets (updated_at DESC, id DESC)
      `);
      // One definition per column, shared by every game. Empty until the
      // backfill runs, and an empty registry means getGamelistPacks keeps
      // reading the per-game sentinel exactly as before.
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_pack_column_registry (
          column_key VARCHAR(64) PRIMARY KEY,
          label      VARCHAR(120) NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          data       JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS gamelist_pack_column_registry_order_idx
        ON gamelist_pack_column_registry (sort_order, column_key)
      `);
      // Which columns a role sees. game_id 0 is the rule for every game and a
      // row for a real game overrides it. Only rows that hide something are
      // stored — no row means visible, so a newly registered column is visible
      // to everyone until someone decides otherwise.
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_pack_column_roles (
          role       VARCHAR(16) NOT NULL,
          game_id    INTEGER NOT NULL DEFAULT 0,
          column_key VARCHAR(64) NOT NULL,
          visible    BOOLEAN NOT NULL DEFAULT TRUE,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (role, game_id, column_key)
        )
      `);
    } finally {
      client.release();
    }
  })();
  promise.catch(() => schemaReadyByConnection.delete(connection.id));
  schemaReadyByConnection.set(connection.id, { cacheKey, promise });
  return promise;
}

/** The gameinfo pool with its schema ensured — for sibling repositories. */
export async function getGameinfoPool() {
  return getReadyPool();
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

// --- shared column registry ---------------------------------------------
// The registry holds one definition per column for every game; the per-game
// sentinel keeps only what is about this game's packs. Both halves are merged
// back into the one flat column array the UI has always read, so nothing above
// this layer knows the storage was split.

async function readColumnRegistry(client) {
  const result = await client.query(
    `SELECT column_key, label, sort_order, data
     FROM gamelist_pack_column_registry
     ORDER BY sort_order, column_key`
  );
  return result.rows.map((row) => ({
    columnKey: row.column_key,
    label: row.label,
    sortOrder: Number(row.sort_order) || 0,
    data: row.data || {},
  }));
}

/** Every shared column definition, for surfaces that work across games. */
export async function listGamelistPackColumnRegistry(transactionClient = null) {
  const client = transactionClient || (await getReadyPool());
  return readColumnRegistry(client);
}

/** Registry + this game's overrides, or the pre-registry per-game columns. */
export function resolveComputedColumns(registryRows, sentinelData) {
  // An empty registry is the pre-backfill state: keep serving the per-game
  // columns byte for byte so deploying this code changes nothing on its own.
  if (!registryRows.length) {
    return Array.isArray(sentinelData?.columns) ? sentinelData.columns : [];
  }
  return mergeGameinfoColumns(registryRows, sentinelData?.columnOverrides || {});
}

export async function writeGameinfoColumnRegistry(client, registryRows, removedKeys = []) {
  return writeColumnRegistry(client, registryRows, removedKeys);
}

// `removedKeys` are the columns the caller established were deliberately
// removed, by diffing what this game had before against what it is saving.
// Deleting "everything not in this array" instead would let one game's save
// destroy definitions shared with every other game — a stale client, a
// role-filtered column list, or a half-migrated store would each be enough.
async function writeColumnRegistry(client, registryRows, removedKeys = []) {
  for (const row of registryRows) {
    await client.query(
      `INSERT INTO gamelist_pack_column_registry (column_key, label, sort_order, data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (column_key) DO UPDATE
         SET label = EXCLUDED.label,
             sort_order = EXCLUDED.sort_order,
             data = EXCLUDED.data,
             updated_at = NOW()`,
      [row.columnKey, row.label, row.sortOrder, JSON.stringify(row.data)]
    );
  }
  // A column dropped in the editor is dropped for every game — that is what
  // "shared definition" means. Its per-game overrides are pruned lazily by
  // the merge, which only ever walks registry rows.
  if (removedKeys.length) {
    await client.query(
      `DELETE FROM gamelist_pack_column_registry WHERE column_key = ANY($1::varchar[])`,
      [removedKeys]
    );
  }
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
    const revisionResult = await client.query(
      `SELECT version FROM gamelist_pack_revisions WHERE game_id = $1`,
      [gameId]
    );
    const registryRows = await readColumnRegistry(client);
    const computedRow = result.rows.find((r) => r.pack_id === COMPUTED_SENTINEL);
    const packRows = result.rows.filter((r) => r.pack_id !== COMPUTED_SENTINEL);
    return {
      currencies: reconstructCurrencies(packRows),
      computedColumns: resolveComputedColumns(registryRows, computedRow?.data),
      costProfiles: sanitizeGameinfoCostProfiles(computedRow?.data?.costProfiles),
      schemaVersion: Number(computedRow?.data?.schemaVersion) || 1,
      version: Number(revisionResult.rows[0]?.version) || 1,
    };
  } finally {
    client.release();
  }
}

/** Full-tree replace, same shape as the old saveGameinfoPacks — delete every
 * row for this game and reinsert, including the computed-columns sentinel. */
export async function saveGamelistPacks(
  gameId,
  { currencies, computedColumns, costProfiles, actor = null, source = "editor", expectedVersion },
  transactionClient = null
) {
  assertUniquePackNamePrices(currencies);
  const pool = await getReadyPool();
  const client = transactionClient || await pool.connect();
  let transactionResult;
  try {
    if (!transactionClient) await client.query("BEGIN");
    await client.query(
      `INSERT INTO gamelist_pack_revisions (game_id, version)
       VALUES ($1, 1) ON CONFLICT (game_id) DO NOTHING`,
      [gameId]
    );
    const revisionResult = await client.query(
      `SELECT version FROM gamelist_pack_revisions WHERE game_id = $1 FOR UPDATE`,
      [gameId]
    );
    const currentVersion = Number(revisionResult.rows[0]?.version) || 1;
    if (expectedVersion !== undefined && (
      !Number.isSafeInteger(Number(expectedVersion)) || Number(expectedVersion) !== currentVersion
    )) {
      throw createHttpError(
        "ข้อมูลถูกแก้โดยผู้ใช้อื่น การบันทึกครั้งนี้ยังไม่ถูกนำไปเขียนทับ กรุณาโหลดข้อมูลล่าสุดก่อนแก้และบันทึกใหม่",
        409
      );
    }
    const previousResult = await client.query(
      `SELECT game_id, pack_id, data FROM gamelist_packs WHERE game_id = $1`,
      [gameId]
    );
    const previousComputed = previousResult.rows.find((row) => row.pack_id === COMPUTED_SENTINEL);
    const previousRows = previousResult.rows.filter((row) => row.pack_id !== COMPUTED_SENTINEL);
    const nextRows = flattenCurrencies(gameId, Array.isArray(currencies) ? currencies : []);
    const nextComputed = Array.isArray(computedColumns) ? computedColumns : [];
    // The registry stays dormant until the backfill fills it, so deploying
    // this code cannot change how an existing game saves.
    const registryActive = (await readColumnRegistry(client)).length > 0;
    const legacyComputed = flattenGameinfoColumnsForLegacy(nextComputed);
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
      // Diff the flattened shape both sides so splitting storage does not
      // show up in the audit log as a change the user never made.
      previousComputed: Array.isArray(previousComputed?.data?.columns)
        ? previousComputed.data.columns
        : [],
      nextComputed: legacyComputed,
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
    // Split the edited columns into the shared definitions and this game's
    // overrides. `columns` keeps being written alongside them: until the
    // registry is proven in production, reverting the code has to be enough to
    // get the old per-game behaviour back, with no data restore.
    const { registry: nextRegistry, overrides: nextOverrides } =
      splitGameinfoColumns(nextComputed);
    if (registryActive) {
      // What this save actually dropped: columns the game was showing before
      // and is not saving now. Anything else in the registry belongs to a
      // column this request never saw and must survive.
      const nextKeys = new Set(nextComputed.map((column) => column.key));
      const removedKeys = resolveComputedColumns(await readColumnRegistry(client), previousComputed?.data)
        .map((column) => column.key)
        .filter((key) => !nextKeys.has(key));
      await writeColumnRegistry(client, nextRegistry, removedKeys);
    }
    await client.query(
      `INSERT INTO gamelist_packs (game_id, pack_id, data) VALUES ($1, $2, $3)`,
      [
        gameId,
        COMPUTED_SENTINEL,
        JSON.stringify({
          schemaVersion: registryActive ? 3 : 2,
          columns: legacyComputed,
          columnOverrides: nextOverrides,
          costProfiles: nextCostProfiles,
        }),
      ]
    );
    for (const event of auditEvents) {
      await insertPackAudit(client, gameId, actor, event, source);
    }
    const nextVersion = currentVersion + 1;
    await client.query(
      `UPDATE gamelist_pack_revisions SET version = $2, updated_at = NOW() WHERE game_id = $1`,
      [gameId, nextVersion]
    );
    transactionResult = { currencies, computedColumns: nextComputed, costProfiles: nextCostProfiles, version: nextVersion };
    if (!transactionClient) await client.query("COMMIT");
  } catch (error) {
    if (!transactionClient) await client.query("ROLLBACK");
    throw error;
  } finally {
    if (!transactionClient) client.release();
  }
  if (transactionClient) return transactionResult;
  return getGamelistPacks(gameId);
}

function normalizePackLanguageName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export async function listGamelistPackLanguages() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, name FROM gamelist_pack_languages ORDER BY name, id`
    );
    return result.rows.map((row) => ({ id: Number(row.id), name: row.name }));
  } finally {
    client.release();
  }
}

export async function createGamelistPackLanguage(name, actorId = null) {
  const cleanName = normalizePackLanguageName(name);
  if (!cleanName) throw createHttpError("กรุณากรอกชื่อภาษา", 400);
  const normalizedName = cleanName.toLocaleLowerCase("th");
  const numericActorId = Number(actorId);
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO gamelist_pack_languages (name, normalized_name, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (normalized_name) DO UPDATE SET name = gamelist_pack_languages.name
       RETURNING id, name`,
      [cleanName, normalizedName, Number.isInteger(numericActorId) && numericActorId > 0 ? numericActorId : null]
    );
    return { id: Number(result.rows[0].id), name: result.rows[0].name };
  } finally {
    client.release();
  }
}

/** Computed-column configs for every game, used to protect the one global
 * formula-variable set from removing a name that any saved formula needs. */
export async function listAllGamelistComputedColumns() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT game_id, data FROM gamelist_packs WHERE pack_id = $1 ORDER BY game_id`,
      [COMPUTED_SENTINEL]
    );
    return result.rows.map((row) => ({
      gameId: row.game_id,
      computedColumns: Array.isArray(row.data?.columns) ? row.data.columns : [],
    }));
  } finally {
    client.release();
  }
}

/** Multi-game CSV import in one transaction. Computed-column sentinel rows
 * are preserved; only real pack rows are replaced/merged. */
export async function importGamelistPacks(
  games,
  mode = "replace",
  actor = null,
  transactionClient = null
) {
  if (!Array.isArray(games) || games.length === 0) return { gameCount: 0, packCount: 0 };
  if (mode !== "replace" && mode !== "add") throw createHttpError("โหมดนำเข้าไม่ถูกต้อง", 400);
  const source = mode === "add" ? "csv_append" : "csv_replace";
  const pool = transactionClient ? null : await getReadyPool();
  const client = transactionClient || (await pool.connect());
  let importedPackCount = 0;
  try {
    if (!transactionClient) await client.query("BEGIN");
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
      // A file can now carry columns for a game without carrying any of its
      // packs — "add this column to these games" is the whole point of naming
      // a game by name. Replacing a game with nothing would delete every pack
      // it has, which is never what that file meant, so a game the file has no
      // packs for keeps the packs it already has.
      const columnsOnly = !currencies.length;
      if (mode === "add" || columnsOnly) {
        currencies = mergeCurrencies(reconstructCurrencies(previousRows), currencies);
      }
      assertUniquePackNamePrices(currencies);
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
      if (game.columns?.length) {
        await writeImportedColumns(client, game.gameId, game.columns, previousComputed, nextRows);
      }
      for (const event of auditEvents) {
        await insertPackAudit(client, game.gameId, actor, event, source);
      }
      importedPackCount += Number(game.packCount) || 0;
    }
    if (!transactionClient) await client.query("COMMIT");
    return { gameCount: games.length, packCount: importedPackCount };
  } catch (error) {
    if (!transactionClient) await client.query("ROLLBACK");
    throw error;
  } finally {
    if (!transactionClient) client.release();
  }
}

// Row overrides are keyed by pack id and a replace import regenerates every
// pack id, so ones that no longer point at a live pack are dropped rather than
// left dangling.
function pruneToLivePacks(rowOverrides, livePackIds) {
  return Object.fromEntries(
    Object.entries(rowOverrides || {}).filter(([packId]) => livePackIds.has(packId))
  );
}

// Columns carried by an imported CSV: register the definition (shared by every
// game) and store this game's values against it. Row overrides are keyed by
// pack id, and a replace import regenerates every pack id, so overrides that
// no longer point at a live pack are dropped rather than left dangling.
async function writeImportedColumns(client, gameId, columns, previousComputed, nextRows) {
  const registryRows = await readColumnRegistry(client);
  // An empty registry means every game still keeps its own columns, and the
  // reader switches to the registry the moment it holds a single row. Putting
  // one there would leave the system half-migrated: every game this file does
  // not name would show only the column this import created and lose its own.
  // So while the registry is dormant an imported column is written the old
  // way, into this game's own list. Activation stays one deliberate act — the
  // backfill, which promotes every game at once.
  const registryActive = registryRows.length > 0;
  const previous = previousComputed?.data || {};
  const livePackIds = new Set(nextRows.map((row) => row.packId));

  if (registryActive) {
    const known = new Set(registryRows.map((row) => row.columnKey));
    let sortOrder = registryRows.length;
    for (const column of columns) {
      if (known.has(column.key)) continue;
      await client.query(
        `INSERT INTO gamelist_pack_column_registry (column_key, label, sort_order, data)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (column_key) DO NOTHING`,
        [
          column.key,
          column.label,
          sortOrder++,
          JSON.stringify({
            formula: column.formula || "",
            entryMode: column.entryMode || "manual",
            kind: "formula",
            marketKey: "",
            type: "number",
            symbol: "",
            scopeMode: "global",
          }),
        ]
      );
    }
  } else {
    const legacy = Array.isArray(previous.columns) ? [...previous.columns] : [];
    const known = new Set(legacy.map((column) => column.key));
    for (const column of columns) {
      const rowOverrides = { ...column.rowOverrides };
      const index = legacy.findIndex((item) => item.key === column.key);
      if (known.has(column.key)) {
        const existing = legacy[index];
        legacy[index] = {
          ...existing,
          rowOverrides: pruneToLivePacks({ ...existing.rowOverrides, ...rowOverrides }, livePackIds),
        };
        continue;
      }
      legacy.push({
        key: column.key,
        label: column.label,
        formula: column.formula || "",
        entryMode: column.entryMode || "manual",
        kind: "formula",
        marketKey: "",
        enabled: true,
        type: "number",
        symbol: "",
        scopeMode: "global",
        categoryFormulas: {},
        rowOverrides: pruneToLivePacks(rowOverrides, livePackIds),
      });
    }
    await client.query(
      `INSERT INTO gamelist_packs (game_id, pack_id, data) VALUES ($1, $2, $3)
       ON CONFLICT (game_id, pack_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [
        gameId,
        COMPUTED_SENTINEL,
        JSON.stringify({
          ...previous,
          schemaVersion: 2,
          columns: legacy,
          costProfiles: sanitizeGameinfoCostProfiles(previous.costProfiles),
        }),
      ]
    );
    return;
  }

  const overrides = { ...(previous.columnOverrides || {}) };
  for (const [key, override] of Object.entries(overrides)) {
    if (!override?.rowOverrides) continue;
    overrides[key] = { ...override, rowOverrides: pruneToLivePacks(override.rowOverrides, livePackIds) };
  }
  for (const column of columns) {
    const existing = overrides[column.key] || {};
    const next = { ...existing };
    if (Object.keys(column.rowOverrides).length) {
      next.rowOverrides = { ...(existing.rowOverrides || {}), ...column.rowOverrides };
    }
    if (Object.keys(next).length) overrides[column.key] = next;
  }

  await client.query(
    `INSERT INTO gamelist_packs (game_id, pack_id, data) VALUES ($1, $2, $3)
     ON CONFLICT (game_id, pack_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [
      gameId,
      COMPUTED_SENTINEL,
      JSON.stringify({
        ...previous,
        schemaVersion: 3,
        columns: Array.isArray(previous.columns) ? previous.columns : [],
        columnOverrides: overrides,
        costProfiles: sanitizeGameinfoCostProfiles(previous.costProfiles),
      }),
    ]
  );
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
        if (onlyGroupLabelChanged(old, data)) continue;
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

  for (const renamed of groupRenames(previousRows, nextRows)) {
    events.push({ packId: null, area: "group", action: "group_rename", ...renamed });
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

const AUDIT_SOURCES = new Set(["editor", "csv_append", "csv_replace", "mode_clone", "import"]);
export const GAMEINFO_AUDIT_AREAS = new Set([
  "pack", "group", "game", "tutorial", "warning", "links", "variables",
  "status", "import", "clone", "image", "tags", "publishers", "order", "settings",
]);

async function insertPackAudit(client, gameId, actor, event, source, dataMode = "uid") {
  const actorId = Number(actor?.id);
  const safeActorId = Number.isInteger(actorId) && actorId > 0 ? actorId : null;
  const actorName = String(actor?.name || "").slice(0, 255);
  await client.query(
    `INSERT INTO gamelist_pack_audit_logs
       (game_id, pack_id, actor_id, actor_name, action, source, area, data_mode,
        before_data, after_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`,
    [
      gameId,
      event.packId,
      safeActorId,
      actorName,
      event.action,
      AUDIT_SOURCES.has(source) ? source : "editor",
      GAMEINFO_AUDIT_AREAS.has(event.area) ? event.area : "pack",
      dataMode === "idpass" ? "idpass" : "uid",
      event.before == null ? null : JSON.stringify(event.before),
      event.after == null ? null : JSON.stringify(event.after),
    ]
  );
}

function onlyGroupLabelChanged(before, after) {
  const withoutGroupLabels = (value) => {
    const { currencyName, currencyImage, categoryName, ...rest } = value || {};
    return rest;
  };
  return sameJson(withoutGroupLabels(before), withoutGroupLabels(after));
}

function groupRenames(previousRows, nextRows) {
  const labelsById = (rows, idKey, nameKey) => {
    const map = new Map();
    for (const row of rows) {
      const data = row.data || {};
      const id = data[idKey];
      if (id == null || map.has(String(id))) continue;
      map.set(String(id), data[nameKey] || "");
    }
    return map;
  };
  const renames = [];
  for (const [kind, idKey, nameKey] of [
    ["currency", "currencyId", "currencyName"],
    ["category", "categoryId", "categoryName"],
  ]) {
    const before = labelsById(previousRows, idKey, nameKey);
    const after = labelsById(nextRows, idKey, nameKey);
    for (const [id, name] of after) {
      if (!before.has(id) || before.get(id) === name) continue;
      renames.push({ before: { kind, id, name: before.get(id) }, after: { kind, id, name } });
    }
  }
  return renames;
}

export async function recordGameinfoAudit({
  gameId,
  area,
  packId = null,
  dataMode = "uid",
  actor = null,
  action = "update",
  source = "editor",
  before = null,
  after = null,
  client: transactionClient = null,
}) {
  const numericGameId = Number(gameId);
  if (!Number.isInteger(numericGameId) || numericGameId < 0 || sameJson(before ?? null, after ?? null)) return;
  const pool = await getReadyPool();
  const client = transactionClient || await pool.connect();
  try {
    await insertPackAudit(
      client,
      numericGameId,
      actor,
      { packId, action, area, before, after },
      source,
      dataMode
    );
  } finally {
    if (!transactionClient) client.release();
  }
}

export function auditActor(user) {
  return user ? { id: user.id, name: user.displayName || user.username || "" } : null;
}

export async function listGamelistPackAudit(gameId, limit = 100, { dataMode = null } = {}) {
  return listAllGamelistPackAudit(Math.min(500, Math.max(1, Number(limit) || 100)), {
    gameId,
    dataMode,
  });
}

export async function listAllGamelistPackAudit(limit = 1000, { area = null, gameId = null, dataMode = null } = {}) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const safeLimit = Math.min(2000, Math.max(1, Number(limit) || 1000));
    const params = [];
    const where = [];
    if (GAMEINFO_AUDIT_AREAS.has(area)) {
      params.push(area);
      where.push(`a.area = $${params.length}`);
    }
    const numericGameId = gameId === null || gameId === "" ? NaN : Number(gameId);
    if (Number.isInteger(numericGameId) && numericGameId >= 0) {
      params.push(numericGameId);
      where.push(`a.game_id = $${params.length}`);
    }
    if (dataMode === "uid" || dataMode === "idpass") {
      params.push(dataMode);
      where.push(`a.data_mode = $${params.length}`);
    }
    params.push(safeLimit);
    const result = await client.query(
      `SELECT a.id, a.game_id, g.game, a.pack_id, a.actor_id, a.actor_name,
              a.action, a.source, a.area, a.data_mode, a.before_data,
              a.after_data, a.created_at
       FROM gamelist_pack_audit_logs a
       LEFT JOIN game_list g ON g.id = a.game_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${params.length}`,
      params
    );
    return result.rows.map((row) => ({
      id: row.id,
      gameId: row.game_id,
      gameName: row.game || (Number(row.game_id) === 0 ? "ตั้งค่าส่วนกลาง" : `Game ID ${row.game_id}`),
      packId: row.pack_id,
      actorId: row.actor_id,
      actorName: row.actor_name,
      action: row.action,
      source: row.source || "editor",
      area: row.area || "pack",
      dataMode: row.data_mode || "uid",
      before: row.before_data,
      after: row.after_data,
      createdAt: row.created_at,
    }));
  } finally {
    client.release();
  }
}

// --- Shared Formula Memory -----------------------------------------------
// Presets are shared by every GameInfo editor, game and data mode. Applying
// one copies its values into the target formula; pack data never stores a
// foreign key to this table.

const GAMEINFO_FORMULA_PRESET_TYPES = new Set(["number", "text", "date", "boolean"]);

function normalizeFormulaPresetInput(input) {
  const name = String(input?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) throw createHttpError("กรุณาตั้งชื่อชุดสูตร", 400);
  const formula = String(input?.formula ?? "").trim().slice(0, 500);
  if (!formula) throw createHttpError("กรุณากรอกสูตร", 400);
  try {
    parseFormula(formula);
  } catch (error) {
    throw createHttpError(error instanceof Error ? error.message : "สูตรไม่ถูกต้อง", 400);
  }
  const type = GAMEINFO_FORMULA_PRESET_TYPES.has(input?.type) ? input.type : "number";
  return {
    name,
    normalizedName: name.normalize("NFKC").toLocaleLowerCase("en-US"),
    formula,
    type,
    symbol: type === "number" ? String(input?.symbol ?? "").slice(0, 24) : "",
  };
}

function normalizeFormulaPresetActor(actor) {
  const id = Number(actor?.id);
  return {
    id: Number.isInteger(id) && id > 0 ? id : null,
    name: String(actor?.name || actor?.username || "").trim().slice(0, 255),
  };
}

function normalizeFormulaPresetId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw createHttpError("Formula Memory ID ไม่ถูกต้อง", 400);
  }
  return id;
}

function mapGameinfoFormulaPreset(row) {
  return {
    id: Number(row.id),
    name: row.name,
    formula: row.formula,
    type: row.result_type,
    symbol: row.symbol || "",
    createdBy: row.created_by,
    createdByName: row.created_by_name || "",
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: Number(row.version) || 1,
  };
}

export async function listGameinfoFormulaPresets() {
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT id, name, formula, result_type, symbol,
            created_by, created_by_name, updated_by, updated_by_name,
            created_at, updated_at, version
     FROM gameinfo_formula_presets
     ORDER BY updated_at DESC, id DESC`
  );
  return result.rows.map(mapGameinfoFormulaPreset);
}

export async function createGameinfoFormulaPreset(input, actor) {
  const preset = normalizeFormulaPresetInput(input);
  const safeActor = normalizeFormulaPresetActor(actor);
  const pool = await getReadyPool();
  try {
    const result = await pool.query(
      `INSERT INTO gameinfo_formula_presets
         (name, normalized_name, formula, result_type, symbol,
          created_by, created_by_name, updated_by, updated_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $6, $7)
       RETURNING id, name, formula, result_type, symbol,
                 created_by, created_by_name, updated_by, updated_by_name,
                 created_at, updated_at, version`,
      [preset.name, preset.normalizedName, preset.formula, preset.type, preset.symbol, safeActor.id, safeActor.name]
    );
    return mapGameinfoFormulaPreset(result.rows[0]);
  } catch (error) {
    if (error?.code === "23505") throw createHttpError("มี Formula Memory ชื่อนี้อยู่แล้ว", 409);
    throw error;
  }
}

export async function updateGameinfoFormulaPreset(presetId, input, actor) {
  const id = normalizeFormulaPresetId(presetId);
  const preset = normalizeFormulaPresetInput(input);
  const safeActor = normalizeFormulaPresetActor(actor);
  const pool = await getReadyPool();
  try {
    const result = await pool.query(
      `UPDATE gameinfo_formula_presets
       SET name = $2, normalized_name = $3, formula = $4,
           result_type = $5, symbol = $6,
           updated_by = $7, updated_by_name = $8,
           version = version + 1, updated_at = NOW()
       WHERE id = $1 AND version = $9
       RETURNING id, name, formula, result_type, symbol,
                 created_by, created_by_name, updated_by, updated_by_name,
                 created_at, updated_at, version`,
      [id, preset.name, preset.normalizedName, preset.formula, preset.type, preset.symbol, safeActor.id, safeActor.name, Number(input?.version)]
    );
    if (result.rows.length === 0) {
      const exists = await pool.query(`SELECT 1 FROM gameinfo_formula_presets WHERE id = $1`, [id]);
      if (exists.rows.length) throw createHttpError("Formula Memory ถูกแก้โดยผู้ใช้อื่น กรุณาโหลดข้อมูลล่าสุดก่อนแก้ใหม่", 409);
      throw createHttpError("ไม่พบ Formula Memory", 404);
    }
    return mapGameinfoFormulaPreset(result.rows[0]);
  } catch (error) {
    if (error?.code === "23505") throw createHttpError("มี Formula Memory ชื่อนี้อยู่แล้ว", 409);
    throw error;
  }
}

export async function deleteGameinfoFormulaPreset(presetId, expectedVersion) {
  const id = normalizeFormulaPresetId(presetId);
  const pool = await getReadyPool();
  const result = await pool.query(
    `DELETE FROM gameinfo_formula_presets WHERE id = $1 AND version = $2 RETURNING id`,
    [id, Number(expectedVersion)]
  );
  if (result.rows.length === 0) {
    const exists = await pool.query(`SELECT 1 FROM gameinfo_formula_presets WHERE id = $1`, [id]);
    if (exists.rows.length) throw createHttpError("Formula Memory ถูกแก้โดยผู้ใช้อื่น กรุณาโหลดข้อมูลล่าสุดก่อนลบ", 409);
    throw createHttpError("ไม่พบ Formula Memory", 404);
  }
  return { id: Number(result.rows[0].id) };
}

// --- Personal pack-table display presets ---------------------------------
// These are deliberately separate from gamelist_packs and its audit log:
// they change only one person's screen, never the underlying pack data. The
// gameinfo connection owns this table, while the user row itself lives in the
// primary GameDB connection, so user_id is intentionally not a foreign key.

function normalizePresetScope({ gameId, userId, surface = null }) {
  const safeGameId = Number(gameId);
  const safeUserId = Number(userId);
  if (!Number.isInteger(safeGameId) || safeGameId <= 0) {
    throw createHttpError("gameId ไม่ถูกต้อง", 400);
  }
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    throw createHttpError("ผู้ใช้ไม่ถูกต้อง", 400);
  }
  if (surface !== null && surface !== "edit" && surface !== "view") {
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
  // Which columns existed when this preset was saved. Columns registered later
  // are shared across every game, so the client hides them until the owner of
  // the preset asks for them. Absent on presets saved before this shipped, and
  // those keep showing every column.
  if (Array.isArray(layout?.knownIds)) sanitized.knownIds = presetColumnIds(layout.knownIds);
  return sanitized;
}

function mapGamelistPackViewPreset(row) {
  return {
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    surface: row.surface,
    locked: row.surface === "edit",
    name: row.name,
    layout: sanitizeGamelistPackViewPresetLayout(row.layout),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listGamelistPackViewPresets({ gameId, userId }) {
  const scope = normalizePresetScope({ gameId, userId });
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, game_id, user_id, surface, name, layout, created_at, updated_at
       FROM gamelist_pack_view_presets
       WHERE game_id = $1 AND user_id = $2
       ORDER BY updated_at DESC, id DESC`,
      [scope.gameId, scope.userId]
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
      const existing = await client.query(
        `SELECT surface FROM gamelist_pack_view_presets
         WHERE id = $1 AND game_id = $2 AND user_id = $3`,
        [safePresetId, scope.gameId, scope.userId]
      );
      if (existing.rows.length === 0) {
        throw createHttpError("ไม่พบ preset ที่ต้องการบันทึก", 404);
      }
      if (existing.rows[0].surface === "edit" && scope.surface === "view") {
        throw createHttpError(
          "preset นี้ถูกล็อกจากหน้าแก้ไข — บันทึกทับจากหน้านี้ไม่ได้ ใช้ \"บันทึกเป็น preset ใหม่\" แทน",
          403
        );
      }
      result = await client.query(
        `UPDATE gamelist_pack_view_presets
         SET name = $4, layout = $5::jsonb, updated_at = NOW()
         WHERE id = $1 AND game_id = $2 AND user_id = $3
         RETURNING id, game_id, user_id, surface, name, layout, created_at, updated_at`,
        [
          safePresetId,
          scope.gameId,
          scope.userId,
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

/** Cleanup hook for deleteGameListRow() — game_list isn't ours to put an FK
 * CASCADE on, so this has to be called explicitly. */
export async function deleteGamelistPacksForGame(gameId, transactionClient = null) {
  const pool = await getReadyPool();
  const client = transactionClient || await pool.connect();
  try {
    await client.query(`DELETE FROM gamelist_packs WHERE game_id = $1`, [gameId]);
    await client.query(`DELETE FROM gamelist_pack_view_presets WHERE game_id = $1`, [gameId]);
  } finally {
    if (!transactionClient) client.release();
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

/** Disabled-pack count used to derive the orange game service light. Old
 * rows without serviceEnabled are treated as enabled for compatibility. */
export async function listGamelistPackServiceByGame() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT game_id,
              COUNT(*)::int AS total_count,
              COUNT(*) FILTER (WHERE data->>'serviceEnabled' = 'false')::int AS disabled_count
         FROM gamelist_packs
        WHERE pack_id != $1
        GROUP BY game_id`,
      [COMPUTED_SENTINEL]
    );
    return Object.fromEntries(
      result.rows.map((row) => [row.game_id, { total: row.total_count, disabled: row.disabled_count }])
    );
  } finally {
    client.release();
  }
}
