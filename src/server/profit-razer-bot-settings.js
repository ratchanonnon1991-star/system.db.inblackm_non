import crypto from "crypto";
import { getPool } from "@/lib/db";

let schemaReady;

function hashApiKey(key) {
  return crypto.createHash("sha256").update(String(key)).digest("hex");
}

function generateApiKey() {
  return `sk_live_${crypto.randomBytes(16).toString("hex")}`;
}

function prefixOf(raw) {
  return `${String(raw).slice(0, 20)}…`;
}

function mapKeyRow(row) {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.api_key_prefix,
    createdAt: row.created_at,
  };
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const client = await getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_razer_bot_settings (
          id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          api_key_hash    TEXT,
          api_key_prefix  TEXT,
          enabled         BOOLEAN NOT NULL DEFAULT false,
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        INSERT INTO profit_razer_bot_settings (id, enabled)
        VALUES (1, false)
        ON CONFLICT (id) DO NOTHING
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS profit_razer_bot_api_keys (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name            TEXT NOT NULL,
          api_key_hash    TEXT NOT NULL UNIQUE,
          api_key_prefix  TEXT NOT NULL,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // Migrate legacy single key into the multi-key list once.
      await client.query(`
        INSERT INTO profit_razer_bot_api_keys (name, api_key_hash, api_key_prefix)
        SELECT 'Legacy', s.api_key_hash, s.api_key_prefix
        FROM profit_razer_bot_settings s
        WHERE s.id = 1
          AND s.api_key_hash IS NOT NULL
          AND s.api_key_prefix IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM profit_razer_bot_api_keys k WHERE k.api_key_hash = s.api_key_hash
          )
      `);
    } finally {
      client.release();
    }
  })();
  return schemaReady;
}

export async function listRazerBotApiKeys() {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, name, api_key_prefix, created_at
     FROM profit_razer_bot_api_keys
     ORDER BY created_at DESC`
  );
  return rows.map(mapKeyRow);
}

export async function getRazerBotSettings() {
  await ensureSchema();
  const [{ rows: settingRows }, keys] = await Promise.all([
    getPool().query(`SELECT * FROM profit_razer_bot_settings WHERE id = 1`),
    listRazerBotApiKeys(),
  ]);
  const row = settingRows[0];
  const envKey = (process.env.RAZER_BOT_API_KEY || "").trim();
  const hasDbKey = keys.length > 0 || Boolean(row?.api_key_hash);
  const dbEnabled = Boolean(row?.enabled && hasDbKey);
  const envEnabled = Boolean(envKey);

  return {
    enabled: dbEnabled || envEnabled,
    dbEnabled,
    envEnabled,
    hasKey: hasDbKey || envEnabled,
    keyCount: keys.length + (envEnabled ? 1 : 0),
    keyPrefix: keys[0]?.keyPrefix || row?.api_key_prefix || (envKey ? `${envKey.slice(0, 16)}…` : null),
    keys,
    envKeyPrefix: envEnabled ? `${envKey.slice(0, 16)}…` : null,
    source: keys.length || row?.api_key_hash ? "database" : envEnabled ? "env" : "none",
    updatedAt: row?.updated_at || null,
  };
}

export async function verifyRazerBotApiKey(provided) {
  const settings = await getRazerBotSettings();
  if (!settings.enabled) {
    throw Object.assign(new Error("Bot API ถูกปิดใช้งาน"), { status: 503 });
  }

  const key = String(provided || "").trim();
  if (!key) {
    throw Object.assign(new Error("API key ไม่ถูกต้อง"), { status: 401 });
  }

  await ensureSchema();
  const digest = hashApiKey(key);

  const { rows: multi } = await getPool().query(
    `SELECT 1 FROM profit_razer_bot_api_keys WHERE api_key_hash = $1 LIMIT 1`,
    [digest]
  );
  if (multi[0]) return true;

  const { rows } = await getPool().query(
    `SELECT api_key_hash, enabled FROM profit_razer_bot_settings WHERE id = 1`
  );
  const row = rows[0];
  if (row?.enabled && row.api_key_hash && digest === row.api_key_hash) {
    return true;
  }

  const envKey = (process.env.RAZER_BOT_API_KEY || "").trim();
  if (envKey && key === envKey) {
    return true;
  }

  throw Object.assign(new Error("API key ไม่ถูกต้อง"), { status: 401 });
}

export async function setRazerBotApiEnabled(enabled) {
  await ensureSchema();
  const settings = await getRazerBotSettings();
  if (enabled && !settings.hasKey) {
    throw Object.assign(new Error("ต้องสร้าง Secret Key ก่อนเปิดใช้งาน"), { status: 400 });
  }
  await getPool().query(
    `UPDATE profit_razer_bot_settings SET enabled = $1, updated_at = NOW() WHERE id = 1`,
    [Boolean(enabled)]
  );
  return getRazerBotSettings();
}

/** Create a named key — returns full secret once. Does not revoke existing keys. */
export async function createRazerBotApiKey({ name } = {}) {
  await ensureSchema();
  const label = String(name || "").trim();
  if (!label) {
    throw Object.assign(new Error("ใส่ชื่อ key"), { status: 400 });
  }
  if (label.length > 80) {
    throw Object.assign(new Error("ชื่อยาวเกินไป (สูงสุด 80 ตัวอักษ)"), { status: 400 });
  }

  const raw = generateApiKey();
  const prefix = prefixOf(raw);
  const { rows } = await getPool().query(
    `INSERT INTO profit_razer_bot_api_keys (name, api_key_hash, api_key_prefix)
     VALUES ($1, $2, $3)
     RETURNING id, name, api_key_prefix, created_at`,
    [label, hashApiKey(raw), prefix]
  );

  await getPool().query(
    `UPDATE profit_razer_bot_settings SET enabled = true, updated_at = NOW() WHERE id = 1`
  );

  const settings = await getRazerBotSettings();
  return { secretKey: raw, key: mapKeyRow(rows[0]), settings };
}

export async function revokeRazerBotApiKey(id) {
  await ensureSchema();
  const keyId = String(id || "").trim();
  if (!keyId) {
    throw Object.assign(new Error("ไม่พบ key"), { status: 404 });
  }

  const { rowCount } = await getPool().query(
    `DELETE FROM profit_razer_bot_api_keys WHERE id = $1`,
    [keyId]
  );
  if (!rowCount) {
    throw Object.assign(new Error("ไม่พบ key"), { status: 404 });
  }

  const settings = await getRazerBotSettings();
  if (!settings.keys.length && !settings.envEnabled) {
    await getPool().query(
      `UPDATE profit_razer_bot_settings
       SET enabled = false, api_key_hash = NULL, api_key_prefix = NULL, updated_at = NOW()
       WHERE id = 1`
    );
    return getRazerBotSettings();
  }

  return settings;
}

/** @deprecated prefer createRazerBotApiKey — kept for old clients */
export async function regenerateRazerBotApiKey() {
  return createRazerBotApiKey({ name: `Rotated ${new Date().toISOString().slice(0, 19)}` });
}
