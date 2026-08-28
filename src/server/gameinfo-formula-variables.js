import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";
import { recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";
import { GAMEINFO_FIELD_NAMES } from "@/lib/gameinfo-formula-fields";
import {
  sanitizeGameinfoFormulaVariables,
  validateGameinfoFormulaVariables,
  variableDefinition,
} from "@/lib/gameinfo-formula-variables";

const CONNECTION_NAME = "gameinfo";
const GLOBAL_SCOPE_ID = 0;
const schemaReadyByConnection = new Map();

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function getConnection() {
  const connections = await listConnections();
  const match = connections.find((connection) => connection.name.trim().toLowerCase() === CONNECTION_NAME);
  return match ? findConnectionWithSecret(match.id) : null;
}

function ensureSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached && cached.cacheKey === cacheKey) return cached.promise;
  const promise = (async () => {
    const client = await getPoolForConnection(connection).connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_formula_variables (
          game_id INTEGER PRIMARY KEY,
          data JSONB NOT NULL DEFAULT '{"variables":[]}'::jsonb,
          version BIGINT NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        ALTER TABLE gamelist_formula_variables
        ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_formula_variable_logs (
          id BIGSERIAL PRIMARY KEY,
          game_id INTEGER NOT NULL,
          actor_id INTEGER,
          actor_name TEXT,
          before_data JSONB,
          after_data JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS gamelist_formula_variable_logs_game_time_idx
        ON gamelist_formula_variable_logs (game_id, created_at DESC, id DESC)
      `);
      // One-time compatibility migration from the earlier per-game draft:
      // if global scope 0 does not exist yet, promote the most recently
      // edited set and its audit trail. Old rows are retained for recovery.
      await client.query(`
        INSERT INTO gamelist_formula_variables (game_id, data, updated_at)
        SELECT 0, data, updated_at
          FROM gamelist_formula_variables
         WHERE game_id <> 0
         ORDER BY updated_at DESC
         LIMIT 1
        ON CONFLICT (game_id) DO NOTHING
      `);
      await client.query(`
        INSERT INTO gamelist_formula_variable_logs
          (game_id, actor_id, actor_name, before_data, after_data, created_at)
        SELECT 0, actor_id, actor_name, before_data, after_data, created_at
          FROM gamelist_formula_variable_logs
         WHERE game_id = (
           SELECT game_id FROM gamelist_formula_variables
            WHERE game_id <> 0 ORDER BY updated_at DESC LIMIT 1
         )
           AND NOT EXISTS (
             SELECT 1 FROM gamelist_formula_variable_logs WHERE game_id = 0
           )
         ORDER BY created_at ASC, id ASC
      `);
    } finally {
      client.release();
    }
  })();
  promise.catch(() => schemaReadyByConnection.delete(connection.id));
  schemaReadyByConnection.set(connection.id, { cacheKey, promise });
  return promise;
}

async function pool() {
  const connection = await getConnection();
  if (!connection) throw httpError(`ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}"`, 503);
  await ensureSchema(connection);
  return getPoolForConnection(connection);
}

// Formula variables are one global set shared by every game's packs. The
// existing game_id column is retained as a storage scope for compatibility;
// scope 0 is the single global document.
export async function getGameinfoFormulaVariables(_gameId, { includeLogs = false } = {}) {
  const readyPool = await pool();
  const client = await readyPool.connect();
  try {
    const result = await client.query(
      `SELECT data, version FROM gamelist_formula_variables WHERE game_id = $1`,
      [GLOBAL_SCOPE_ID]
    );
    const variables = sanitizeGameinfoFormulaVariables(result.rows[0]?.data?.variables);
    let logs = [];
    if (includeLogs) {
      const history = await client.query(
        `SELECT id, actor_id, actor_name, before_data, after_data, created_at
           FROM gamelist_formula_variable_logs
          WHERE game_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT 100`,
        [GLOBAL_SCOPE_ID]
      );
      logs = history.rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        actorName: row.actor_name || "ไม่ทราบชื่อ",
        before: row.before_data,
        after: row.after_data,
        createdAt: row.created_at,
      }));
    }
    return { variables, logs, version: Number(result.rows[0]?.version) || 1 };
  } finally {
    client.release();
  }
}

export async function saveGameinfoFormulaVariables(gameId, rawVariables, actor, expectedVersion) {
  if (!Array.isArray(rawVariables)) throw httpError("รูปแบบตัวแปรผสมไม่ถูกต้อง", 400);
  if (rawVariables.length > 100) throw httpError("เพิ่มตัวแปรผสมได้สูงสุด 100 ตัว", 400);
  const submitted = sanitizeGameinfoFormulaVariables(rawVariables);
  if (submitted.length !== rawVariables.length) {
    throw httpError("กรุณากรอกชื่อและรหัสตัวแปรผสมให้ครบ", 400);
  }
  const errors = validateGameinfoFormulaVariables(submitted, GAMEINFO_FIELD_NAMES);
  if (errors.length) throw httpError(errors[0], 400);
  const readyPool = await pool();
  const client = await readyPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [220022]);
    const previousResult = await client.query(
      `SELECT data, version FROM gamelist_formula_variables WHERE game_id = $1 FOR UPDATE`,
      [GLOBAL_SCOPE_ID]
    );
    const currentVersion = Number(previousResult.rows[0]?.version) || 1;
    if (expectedVersion !== undefined && (
      !Number.isSafeInteger(Number(expectedVersion)) || Number(expectedVersion) !== currentVersion
    )) {
      throw httpError("ตัวแปรผสมถูกแก้โดยผู้ใช้อื่น กรุณาโหลดข้อมูลล่าสุดก่อนแก้และบันทึกใหม่", 409);
    }
    const previous = sanitizeGameinfoFormulaVariables(previousResult.rows[0]?.data?.variables);
    const changedAt = new Date().toISOString();
    const actorName = String(actor?.name || "ไม่ทราบชื่อ").slice(0, 120);
    const variables = submitted.map((variable) => {
      const old = previous.find((item) => item.id === variable.id);
      if (old && JSON.stringify(variableDefinition(old)) === JSON.stringify(variableDefinition(variable))) {
        return { ...variable, updatedAt: old.updatedAt, updatedBy: old.updatedBy };
      }
      return { ...variable, updatedAt: changedAt, updatedBy: actorName };
    });
    const beforeDefinitions = previous.map(variableDefinition);
    const afterDefinitions = variables.map(variableDefinition);
    await client.query(
      `INSERT INTO gamelist_formula_variables (game_id, data, version, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (game_id) DO UPDATE
       SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = NOW()`,
      [GLOBAL_SCOPE_ID, JSON.stringify({ variables }), currentVersion + 1]
    );
    if (JSON.stringify(beforeDefinitions) !== JSON.stringify(afterDefinitions)) {
      await client.query(
        `INSERT INTO gamelist_formula_variable_logs
          (game_id, actor_id, actor_name, before_data, after_data, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [GLOBAL_SCOPE_ID, Number(actor?.id) || null, actorName, JSON.stringify(beforeDefinitions), JSON.stringify(afterDefinitions)]
      );
      await recordGameinfoAudit({
        gameId,
        area: "variables",
        actor,
        before: { scope: "global", variables: beforeDefinitions },
        after: { scope: "global", variables: afterDefinitions },
        client,
      });
    }
    await client.query("COMMIT");
    return { variables, version: currentVersion + 1 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
