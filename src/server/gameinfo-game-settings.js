// Per-game settings GameInfo owns itself: which game on the TopUp website it
// is, where each mode's packs are sold from, and its test accounts.
// (Importance is game_list.rank_stars.)
// Everything the website owns (Web ON, customer fields, web prices) is read
// from the website's own database instead — see gameinfo-topup-web.js.
import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecretByName } from "@/server/connections-repository";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";
import { sanitizeGameinfoPriceChannels } from "@/lib/gameinfo-pack-list";

const CONNECTION_NAME = "gameinfo";
const schemaReadyByConnection = new Map();

export const GAMEINFO_TEST_ACCOUNT_USES = ["uid", "idpass", "both"];
export const GAMEINFO_TEST_RESULTS = ["", "pass", "fail"];
const MAX_TEST_ACCOUNTS = 20;

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function ensureSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached && cached.cacheKey === cacheKey) return cached.promise;
  const promise = (async () => {
    const pool = getPoolForConnection(connection);
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_game_settings (
          game_id       INTEGER PRIMARY KEY,
          topup_game_id TEXT,
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`ALTER TABLE gamelist_game_settings ADD COLUMN IF NOT EXISTS source_uid TEXT NOT NULL DEFAULT ''`);
      await client.query(`ALTER TABLE gamelist_game_settings ADD COLUMN IF NOT EXISTS source_idpass TEXT NOT NULL DEFAULT ''`);
      // { uid: [...], idpass: [...] }: a mode left out uses the built-in channels.
      await client.query(`ALTER TABLE gamelist_game_settings ADD COLUMN IF NOT EXISTS price_channels JSONB NOT NULL DEFAULT '{}'::jsonb`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_test_accounts (
          id             BIGSERIAL PRIMARY KEY,
          game_id        INTEGER NOT NULL,
          name           TEXT NOT NULL,
          login          TEXT NOT NULL DEFAULT '',
          password_enc   TEXT,
          server         TEXT NOT NULL DEFAULT '',
          use_for        TEXT NOT NULL DEFAULT 'both',
          note           TEXT NOT NULL DEFAULT '',
          last_result    TEXT NOT NULL DEFAULT '',
          last_tested_at TIMESTAMPTZ,
          last_tested_by TEXT,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_gamelist_test_accounts_game ON gamelist_test_accounts (game_id, id)`);
    } finally {
      client.release();
    }
  })();
  promise.catch(() => schemaReadyByConnection.delete(connection.id));
  schemaReadyByConnection.set(connection.id, { cacheKey, promise });
  return promise;
}

async function getReadyPool() {
  const connection = await findConnectionWithSecretByName(CONNECTION_NAME);
  if (!connection) throw createHttpError(`ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}"`, 503);
  await ensureSchema(connection);
  return getPoolForConnection(connection);
}

function cleanText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

const SETTINGS_COLUMNS = "topup_game_id, source_uid, source_idpass, price_channels";
const PRICE_CHANNEL_MODES = ["uid", "idpass"];

function priceChannelsFromJson(value) {
  return Object.fromEntries(PRICE_CHANNEL_MODES.map((mode) => [mode, sanitizeGameinfoPriceChannels(value?.[mode])]));
}

function settingsFromRow(row) {
  return {
    topupGameId: row?.topup_game_id || null,
    sourceUid: row?.source_uid || "",
    sourceIdpass: row?.source_idpass || "",
    priceChannels: priceChannelsFromJson(row?.price_channels),
  };
}

export async function getGamelistGameSettings(gameId) {
  const pool = await getReadyPool();
  const result = await pool.query(`SELECT ${SETTINGS_COLUMNS} FROM gamelist_game_settings WHERE game_id = $1`, [gameId]);
  return settingsFromRow(result.rows[0]);
}

export async function listGamelistGameSettings() {
  const pool = await getReadyPool();
  const result = await pool.query(`SELECT game_id, ${SETTINGS_COLUMNS} FROM gamelist_game_settings`);
  return Object.fromEntries(result.rows.map((row) => [row.game_id, settingsFromRow(row)]));
}

// Only the keys that are present change.
export async function saveGamelistGameSettings(gameId, patch, actor = null, transactionClient = null) {
  const pool = await getReadyPool();
  const client = transactionClient || await pool.connect();
  try {
    if (!transactionClient) await client.query("BEGIN");
    const game = await client.query(`SELECT id FROM game_list WHERE id = $1 FOR UPDATE`, [gameId]);
    if (game.rows.length !== 1) throw createHttpError("ไม่พบเกม", 404);
    const existing = await client.query(`SELECT ${SETTINGS_COLUMNS} FROM gamelist_game_settings WHERE game_id = $1`, [gameId]);
    const before = settingsFromRow(existing.rows[0]);
    const next = { ...before };
    if (Object.hasOwn(patch, "topupGameId")) next.topupGameId = cleanText(patch.topupGameId, 64) || null;
    if (Object.hasOwn(patch, "sourceUid")) next.sourceUid = cleanText(patch.sourceUid, 200);
    if (Object.hasOwn(patch, "sourceIdpass")) next.sourceIdpass = cleanText(patch.sourceIdpass, 200);
    // One mode's channels at a time; null puts that mode back on the built-in ones.
    if (Object.hasOwn(patch, "priceChannels")) {
      const { mode, channels } = patch.priceChannels || {};
      if (!PRICE_CHANNEL_MODES.includes(mode)) throw createHttpError("ไม่รู้จักโหมดของช่องทางขาย", 400);
      next.priceChannels = { ...before.priceChannels, [mode]: sanitizeGameinfoPriceChannels(channels) };
    }
    const storedChannels = Object.fromEntries(
      PRICE_CHANNEL_MODES.filter((mode) => next.priceChannels[mode]).map((mode) => [mode, next.priceChannels[mode]])
    );
    await client.query(
      `INSERT INTO gamelist_game_settings (game_id, topup_game_id, source_uid, source_idpass, price_channels, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (game_id) DO UPDATE SET
         topup_game_id = EXCLUDED.topup_game_id, source_uid = EXCLUDED.source_uid,
         source_idpass = EXCLUDED.source_idpass, price_channels = EXCLUDED.price_channels, updated_at = NOW()`,
      [gameId, next.topupGameId, next.sourceUid, next.sourceIdpass, JSON.stringify(storedChannels)]
    );
    await recordGameinfoAudit({ gameId, area: "settings", actor, before, after: next, client });
    if (!transactionClient) await client.query("COMMIT");
    return next;
  } catch (error) {
    if (!transactionClient) await client.query("ROLLBACK");
    throw error;
  } finally {
    if (!transactionClient) client.release();
  }
}

// The password never leaves the server here: lists carry only whether one
// is set. revealGamelistTestAccountPassword() is the one way to read it.
function accountFromRow(row) {
  return {
    id: String(row.id),
    name: row.name,
    login: row.login,
    hasPassword: Boolean(row.password_enc),
    server: row.server,
    useFor: GAMEINFO_TEST_ACCOUNT_USES.includes(row.use_for) ? row.use_for : "both",
    note: row.note,
    lastResult: GAMEINFO_TEST_RESULTS.includes(row.last_result) ? row.last_result : "",
    lastTestedAt: row.last_tested_at ? new Date(row.last_tested_at).toISOString() : null,
    lastTestedBy: row.last_tested_by || null,
  };
}

// For readers without the right to see test logins: what kind of account it
// is, nothing that identifies it.
export function maskGamelistTestAccount(account) {
  const login = String(account.login || "");
  const at = login.indexOf("@");
  return {
    ...account,
    login: login ? (at > 0 ? `••••••••${login.slice(at)}` : "••••••••") : "",
  };
}

function normalizeAccountInput(input) {
  const name = cleanText(input?.name, 80);
  if (!name) throw createHttpError("ต้องมีชื่อเรียกบัญชีทดสอบ", 400);
  const useFor = GAMEINFO_TEST_ACCOUNT_USES.includes(input?.useFor) ? input.useFor : "both";
  return {
    name,
    login: cleanText(input?.login, 200),
    server: cleanText(input?.server, 80),
    useFor,
    note: cleanText(input?.note, 300),
  };
}

export async function listGamelistTestAccounts(gameId) {
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT id, name, login, password_enc, server, use_for, note, last_result, last_tested_at, last_tested_by
     FROM gamelist_test_accounts WHERE game_id = $1 ORDER BY id`,
    [gameId]
  );
  return result.rows.map(accountFromRow);
}

export async function createGamelistTestAccount(gameId, input, actor = null) {
  const account = normalizeAccountInput(input);
  const password = String(input?.password ?? "");
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const game = await client.query(`SELECT id FROM game_list WHERE id = $1 FOR UPDATE`, [gameId]);
    if (game.rows.length !== 1) throw createHttpError("ไม่พบเกม", 404);
    const count = await client.query(`SELECT COUNT(*)::int AS n FROM gamelist_test_accounts WHERE game_id = $1`, [gameId]);
    if (count.rows[0].n >= MAX_TEST_ACCOUNTS) throw createHttpError(`เพิ่มบัญชีทดสอบได้สูงสุด ${MAX_TEST_ACCOUNTS} บัญชีต่อเกม`, 400);
    const inserted = await client.query(
      `INSERT INTO gamelist_test_accounts (game_id, name, login, password_enc, server, use_for, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, login, password_enc, server, use_for, note, last_result, last_tested_at, last_tested_by`,
      [gameId, account.name, account.login, password ? encryptSecret(password) : null, account.server, account.useFor, account.note]
    );
    // The audit keeps what changed, never the password itself.
    await recordGameinfoAudit({ gameId, area: "test-accounts", action: "create", actor, before: null, after: { ...account, passwordSet: Boolean(password) }, client });
    await client.query("COMMIT");
    return accountFromRow(inserted.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// `password` undefined keeps the stored one, "" clears it.
export async function updateGamelistTestAccount(gameId, accountId, input, actor = null) {
  const account = normalizeAccountInput(input);
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT id, name, login, server, use_for, note FROM gamelist_test_accounts WHERE id = $1 AND game_id = $2 FOR UPDATE`,
      [accountId, gameId]
    );
    if (!existing.rows[0]) throw createHttpError("ไม่พบบัญชีทดสอบ", 404);
    const passwordChanged = input?.password !== undefined;
    const updated = await client.query(
      `UPDATE gamelist_test_accounts
       SET name = $3, login = $4, server = $5, use_for = $6, note = $7,
           password_enc = CASE WHEN $8::boolean THEN $9 ELSE password_enc END,
           updated_at = NOW()
       WHERE id = $1 AND game_id = $2
       RETURNING id, name, login, password_enc, server, use_for, note, last_result, last_tested_at, last_tested_by`,
      [
        accountId, gameId, account.name, account.login, account.server, account.useFor, account.note,
        passwordChanged, passwordChanged && input.password ? encryptSecret(String(input.password)) : null,
      ]
    );
    await recordGameinfoAudit({
      gameId,
      area: "test-accounts",
      actor,
      before: existing.rows[0],
      after: { ...account, passwordChanged },
      client,
    });
    await client.query("COMMIT");
    return accountFromRow(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function recordGamelistTestResult(gameId, accountId, result, actor = null) {
  if (!["pass", "fail"].includes(result)) throw createHttpError("ผลทดสอบต้องเป็น ผ่าน หรือ ไม่ผ่าน", 400);
  const pool = await getReadyPool();
  const updated = await pool.query(
    `UPDATE gamelist_test_accounts
     SET last_result = $3, last_tested_at = NOW(), last_tested_by = $4, updated_at = NOW()
     WHERE id = $1 AND game_id = $2
     RETURNING id, name, login, password_enc, server, use_for, note, last_result, last_tested_at, last_tested_by`,
    [accountId, gameId, result, actor?.name || null]
  );
  if (!updated.rows[0]) throw createHttpError("ไม่พบบัญชีทดสอบ", 404);
  return accountFromRow(updated.rows[0]);
}

export async function deleteGamelistTestAccount(gameId, accountId, actor = null) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const removed = await client.query(
      `DELETE FROM gamelist_test_accounts WHERE id = $1 AND game_id = $2 RETURNING name, login, server, use_for`,
      [accountId, gameId]
    );
    if (!removed.rows[0]) throw createHttpError("ไม่พบบัญชีทดสอบ", 404);
    await recordGameinfoAudit({ gameId, area: "test-accounts", action: "delete", actor, before: removed.rows[0], after: null, client });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Each reveal is written to the game's audit log, so who looked at a test
// password, and when, is on record.
export async function revealGamelistTestAccount(gameId, accountId, actor = null) {
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT login, password_enc FROM gamelist_test_accounts WHERE id = $1 AND game_id = $2`,
    [accountId, gameId]
  );
  const row = result.rows[0];
  if (!row) throw createHttpError("ไม่พบบัญชีทดสอบ", 404);
  await recordGameinfoAudit({ gameId, area: "test-accounts", action: "reveal", actor, before: null, after: { accountId: String(accountId) } });
  return { login: row.login, password: row.password_enc ? decryptSecret(row.password_enc) : "" };
}

// Part of deleting a game (gameinfo-gamelist.js), inside its transaction.
export async function deleteGamelistGameSettingsForGame(gameId, client) {
  await getReadyPool(); // the tables may not exist yet on a database that never used them
  await client.query(`DELETE FROM gamelist_test_accounts WHERE game_id = $1`, [gameId]);
  await client.query(`DELETE FROM gamelist_game_settings WHERE game_id = $1`, [gameId]);
}
