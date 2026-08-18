// "How to top up" tutorial for a game_list row — one game_id -> one JSONB
// blob of categories, each holding steps ({ id, title, description,
// imageUrls, videoUrl }[]), same "not ours to ALTER game_list, keep a side
// table" shape as gamelist_packs
// (see gameinfo-gamelist-packs.js) and gamelist_order. One row per game
// (not one row per step) since steps are always read/written as a whole list
// together from the popup editor — no need for a second table.
import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
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
        CREATE TABLE IF NOT EXISTS gamelist_tutorials (
          game_id    INTEGER PRIMARY KEY,
          data       JSONB NOT NULL DEFAULT '{"steps":[]}'::jsonb,
          warning_data JSONB NOT NULL DEFAULT '{"categories":[]}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        ALTER TABLE gamelist_tutorials
        ADD COLUMN IF NOT EXISTS warning_data JSONB NOT NULL DEFAULT '{"categories":[]}'::jsonb
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

// imageUrls: unlimited images per step, shown as a slideshow (see
// gameinfo-tutorial-modal.js's ImageSlider) — .imageUrl (singular) is the
// older one-image shape, folded into a 1-item array here so nothing already
// saved is lost.
function normalizeStep(step, index) {
  const urls = Array.isArray(step?.imageUrls) ? step.imageUrls : step?.imageUrl ? [step.imageUrl] : [];
  return {
    id: step?.id ? String(step.id) : `step_${index + 1}`,
    title: String(step?.title ?? "").trim(),
    description: String(step?.description ?? "").trim(),
    imageUrls: urls.map((u) => String(u ?? "").trim()).filter(Boolean),
    videoUrl: String(step?.videoUrl ?? "").trim(),
  };
}

function normalizeCategory(category, index) {
  return {
    id: category?.id ? String(category.id) : `category_${index + 1}`,
    name: String(category?.name ?? "").trim(),
    steps: Array.isArray(category?.steps) ? category.steps.map(normalizeStep) : [],
  };
}

// Accepts either the current { categories: [{ name, steps }] } shape or the
// older, flatter shapes this table has gone through: { steps: [...] } with
// no grouping at all, or { steps: [...] } where each step carried its own
// .category tag (a short-lived earlier version of this feature). Either old
// shape gets folded into one category per distinct tag (untagged steps land
// in a nameless group) so nothing already saved gets dropped on next read.
export function normalizeGamelistTutorialCategories(raw) {
  if (Array.isArray(raw?.categories)) {
    return raw.categories.map(normalizeCategory);
  }
  const oldSteps = Array.isArray(raw?.steps) ? raw.steps : [];
  if (oldSteps.length === 0) return [];
  const groups = new Map();
  for (const step of oldSteps) {
    const key = String(step?.category ?? "").trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(step);
  }
  return [...groups.entries()].map(([name, steps], index) => normalizeCategory({ name, steps }, index));
}

/** { categories: [] } for one game_list row's id — empty if never saved. */
export async function getGamelistTutorial(gameId) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT data FROM gamelist_tutorials WHERE game_id = $1`,
      [gameId]
    );
    return { categories: normalizeCategories(result.rows[0]?.data) };
  } finally {
    client.release();
  }
}

/** Full replace, upserted — same "edit the whole list in memory, save it all
 * at once" shape as the pack editor. */
export async function saveGamelistTutorial(gameId, categories) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const normalized = normalizeCategories({ categories });
    await client.query(
      `INSERT INTO gamelist_tutorials (game_id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (game_id) DO UPDATE SET data = $2, updated_at = NOW()`,
      [gameId, JSON.stringify({ categories: normalized })]
    );
    return { categories: normalized };
  } finally {
    client.release();
  }
}

const normalizeCategories = normalizeGamelistTutorialCategories;

/** Separate caution content for the same game. It shares the tutorial row
 * only as storage; warning_data is loaded, saved, and displayed independently. */
export async function getGamelistWarning(gameId) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT warning_data FROM gamelist_tutorials WHERE game_id = $1`,
      [gameId]
    );
    return { categories: normalizeCategories(result.rows[0]?.warning_data) };
  } finally {
    client.release();
  }
}

export async function saveGamelistWarning(gameId, categories) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const normalized = normalizeCategories({ categories });
    await client.query(
      `INSERT INTO gamelist_tutorials (game_id, data, warning_data, updated_at)
       VALUES ($1, '{"categories":[]}'::jsonb, $2, NOW())
       ON CONFLICT (game_id) DO UPDATE SET warning_data = $2, updated_at = NOW()`,
      [gameId, JSON.stringify({ categories: normalized })]
    );
    return { categories: normalized };
  } finally {
    client.release();
  }
}

/** Cleanup hook for deleteGameListRow() — game_list isn't ours to put an FK
 * CASCADE on, so this has to be called explicitly, same as
 * deleteGamelistPacksForGame(). */
export async function deleteGamelistTutorialForGame(gameId) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM gamelist_tutorials WHERE game_id = $1`, [gameId]);
  } finally {
    client.release();
  }
}

/** Every distinct category name used across every game's tutorial — lets a
 * category name typed for one game's tutorial be reused (shared name
 * history) on any other game's, same "type it once, reuse everywhere" idea
 * as listAllGamelistChannels() in gameinfo-gamelist-packs.js. Reads both the
 * current data->categories[].name and the older data->steps[].category, so
 * names typed before the grouping rework still show up. */
export async function listAllGamelistTutorialCategories() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT data FROM gamelist_tutorials`);
    const all = new Set();
    for (const row of result.rows) {
      for (const category of row.data?.categories ?? []) {
        const name = String(category?.name ?? "").trim();
        if (name) all.add(name);
      }
      for (const step of row.data?.steps ?? []) {
        const name = String(step?.category ?? "").trim();
        if (name) all.add(name);
      }
    }
    return [...all].sort((a, b) => a.localeCompare(b, "th"));
  } finally {
    client.release();
  }
}

export async function listAllGamelistWarningCategories() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT warning_data FROM gamelist_tutorials`);
    const all = new Set();
    for (const row of result.rows) {
      for (const category of row.warning_data?.categories ?? []) {
        const name = String(category?.name ?? "").trim();
        if (name) all.add(name);
      }
    }
    return [...all].sort((a, b) => a.localeCompare(b, "th"));
  } finally {
    client.release();
  }
}

/** { [gameId]: true } for games that have at least one tutorial step (inside
 * any category, or in the older ungrouped shape) — lets the list table show
 * a filled vs. empty Tutorial button without a per-row query. */
export async function listGamelistTutorialPresence() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT game_id FROM gamelist_tutorials
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(data->'categories', '[]'::jsonb)) c
        WHERE jsonb_array_length(COALESCE(c->'steps', '[]'::jsonb)) > 0
      ) OR jsonb_array_length(COALESCE(data->'steps', '[]'::jsonb)) > 0
    `);
    const out = {};
    for (const row of result.rows) out[row.game_id] = true;
    return out;
  } finally {
    client.release();
  }
}

export async function listGamelistWarningPresence() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT game_id FROM gamelist_tutorials
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(warning_data->'categories', '[]'::jsonb)) c
        WHERE jsonb_array_length(COALESCE(c->'steps', '[]'::jsonb)) > 0
      )
    `);
    const out = {};
    for (const row of result.rows) out[row.game_id] = true;
    return out;
  } finally {
    client.release();
  }
}
