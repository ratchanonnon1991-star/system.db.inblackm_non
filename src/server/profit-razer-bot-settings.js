import crypto from "crypto";
import { getPool } from "@/lib/db";

let schemaReady;

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
    } finally {
      client.release();
    }
  })();
  return schemaReady;
}

function hashApiKey(key) {
  return crypto.createHash("sha256").update(String(key)).digest("hex");
}

function generateApiKey() {
  return `sk_live_${crypto.randomBytes(16).toString("hex")}`;
}

export async function getRazerBotSettings() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT * FROM profit_razer_bot_settings WHERE id = 1`);
  const row = rows[0];
  const envKey = (process.env.RAZER_BOT_API_KEY || "").trim();
  const hasDbKey = Boolean(row?.api_key_hash);
  const dbEnabled = Boolean(row?.enabled && hasDbKey);
  const envEnabled = Boolean(envKey);

  return {
    enabled: dbEnabled || envEnabled,
    dbEnabled,
    envEnabled,
    hasKey: hasDbKey || envEnabled,
    keyPrefix: row?.api_key_prefix || (envKey ? `${envKey.slice(0, 16)}…` : null),
    source: hasDbKey ? "database" : envEnabled ? "env" : "none",
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
  const { rows } = await getPool().query(`SELECT api_key_hash, enabled FROM profit_razer_bot_settings WHERE id = 1`);
  const row = rows[0];

  if (row?.enabled && row.api_key_hash && hashApiKey(key) === row.api_key_hash) {
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
  const { rows } = await getPool().query(`SELECT api_key_hash FROM profit_razer_bot_settings WHERE id = 1`);
  if (enabled && !rows[0]?.api_key_hash && !(process.env.RAZER_BOT_API_KEY || "").trim()) {
    throw Object.assign(new Error("ต้องสร้าง Secret Key ก่อนเปิดใช้งาน"), { status: 400 });
  }
  await getPool().query(
    `UPDATE profit_razer_bot_settings SET enabled = $1, updated_at = NOW() WHERE id = 1`,
    [Boolean(enabled)]
  );
  return getRazerBotSettings();
}

/** Create or rotate API key — returns full key once (admin only). */
export async function regenerateRazerBotApiKey() {
  await ensureSchema();
  const raw = generateApiKey();
  const prefix = `${raw.slice(0, 20)}…`;
  await getPool().query(
    `UPDATE profit_razer_bot_settings
     SET api_key_hash = $1, api_key_prefix = $2, enabled = true, updated_at = NOW()
     WHERE id = 1`,
    [hashApiKey(raw), prefix]
  );
  const settings = await getRazerBotSettings();
  return { secretKey: raw, settings };
}
