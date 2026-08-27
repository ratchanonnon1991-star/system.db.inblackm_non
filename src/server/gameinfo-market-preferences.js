import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";
let schemaReady = null;

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function getReadyPool() {
  const connections = await listConnections();
  const match = connections.find((connection) => connection.name.trim().toLowerCase() === CONNECTION_NAME);
  const connection = match ? await findConnectionWithSecret(match.id) : null;
  if (!connection) throw createHttpError(`ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}"`, 503);

  if (!schemaReady) {
    schemaReady = getPoolForConnection(connection).query(`
      CREATE TABLE IF NOT EXISTS gameinfo_market_preferences (
        user_id         TEXT NOT NULL,
        provider        VARCHAR(16) NOT NULL CHECK (provider IN ('kaleoz', 'itemku')),
        game            VARCHAR(160) NOT NULL,
        baseline_seller TEXT NOT NULL,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, provider, game)
      )
    `).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
  return getPoolForConnection(connection);
}

function normalize(value, label, maxLength) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > maxLength) throw createHttpError(`${label}ไม่ถูกต้อง`, 400);
  return normalized;
}

function normalizeProvider(provider) {
  const normalized = String(provider || "").trim().toLowerCase();
  if (!['kaleoz', 'itemku'].includes(normalized)) throw createHttpError("ตลาดไม่ถูกต้อง", 400);
  return normalized;
}

export async function getGameinfoBaselineSeller(userId, provider, game) {
  const result = await (await getReadyPool()).query(
    `SELECT baseline_seller FROM gameinfo_market_preferences WHERE user_id = $1 AND provider = $2 AND game = $3`,
    [normalize(userId, "บัญชีผู้ใช้", 200), normalizeProvider(provider), normalize(game, "เกม", 160)]
  );
  return result.rows[0]?.baseline_seller || "";
}

export async function saveGameinfoBaselineSeller(userId, provider, game, seller) {
  const values = [
    normalize(userId, "บัญชีผู้ใช้", 200),
    normalizeProvider(provider),
    normalize(game, "เกม", 160),
    normalize(seller, "Seller", 255),
  ];
  const result = await (await getReadyPool()).query(
    `INSERT INTO gameinfo_market_preferences (user_id, provider, game, baseline_seller)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, provider, game)
     DO UPDATE SET baseline_seller = EXCLUDED.baseline_seller, updated_at = NOW()
     RETURNING baseline_seller`,
    values
  );
  return result.rows[0].baseline_seller;
}
