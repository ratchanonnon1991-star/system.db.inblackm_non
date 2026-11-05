import { getPool } from "@/lib/db";
import { addressDecision, validateCryptoAddress } from "@/lib/stock-addresses";

// Saved crypto withdrawal addresses (src/lib/stock-addresses.js). Rows are never
// deleted: a wrong or changed address is retired, with who and why.
let schemaReady;

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function ensureAddressSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS stock_crypto_addresses (
        id              SERIAL PRIMARY KEY,
        recipient       VARCHAR(120) NOT NULL,
        coin            VARCHAR(10) NOT NULL,
        chain           VARCHAR(20) NOT NULL,
        address         VARCHAR(200) NOT NULL,
        memo            VARCHAR(120) NOT NULL DEFAULT '',
        note            TEXT NOT NULL DEFAULT '',
        status          VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'retired')),
        created_by_id   INTEGER,
        created_by      VARCHAR(255) NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        confirmed_by_id INTEGER,
        confirmed_by    VARCHAR(255) NOT NULL DEFAULT '',
        confirmed_at    TIMESTAMPTZ,
        retired_by      VARCHAR(255) NOT NULL DEFAULT '',
        retired_at      TIMESTAMPTZ,
        retired_reason  TEXT NOT NULL DEFAULT ''
      )
    `);
    // One live row per address and chain: the same address saved twice would hide which was checked.
    await getPool().query(`CREATE UNIQUE INDEX IF NOT EXISTS stock_crypto_addresses_live_idx
      ON stock_crypto_addresses (chain, address, memo) WHERE status <> 'retired'`);
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });
  return schemaReady;
}

const map = (row) => ({
  id: row.id, recipient: row.recipient, coin: row.coin, chain: row.chain, address: row.address, memo: row.memo, note: row.note,
  status: row.status, createdById: row.created_by_id, createdBy: row.created_by, createdAt: row.created_at,
  confirmedBy: row.confirmed_by, confirmedAt: row.confirmed_at, retiredBy: row.retired_by, retiredAt: row.retired_at, retiredReason: row.retired_reason,
});

/** Every saved address, live ones first, newest first. */
export async function listCryptoAddresses({ includeRetired = false } = {}) {
  await ensureAddressSchema();
  const result = await getPool().query(
    `SELECT * FROM stock_crypto_addresses WHERE ($1 OR status <> 'retired')
      ORDER BY (status = 'retired'), lower(recipient), coin, created_at DESC`,
    [Boolean(includeRetired)]
  );
  return result.rows.map(map);
}

export async function addCryptoAddress(input, actor) {
  await ensureAddressSchema();
  if (!actor?.id) throw createHttpError("ต้องเข้าสู่ระบบก่อน", 401);
  const checked = validateCryptoAddress(input);
  if (checked.error) throw createHttpError(checked.error, 400);
  const { recipient, coin, chain, address, memo, note } = checked.address;
  try {
    const result = await getPool().query(
      `INSERT INTO stock_crypto_addresses (recipient, coin, chain, address, memo, note, created_by_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [recipient, coin, chain, address, memo, note, actor.id, String(actor.name || "").slice(0, 255)]
    );
    return map(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") throw createHttpError("address นี้บน chain นี้บันทึกไว้แล้ว", 409);
    throw error;
  }
}

/** "confirm" (someone other than who added it) or "retire" (with a reason). */
export async function decideCryptoAddress(id, action, actor, reason = "") {
  await ensureAddressSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query(`SELECT * FROM stock_crypto_addresses WHERE id = $1 FOR UPDATE`, [Number(id)])).rows[0];
    if (!row) throw createHttpError("ไม่พบ address นี้", 404);
    const step = addressDecision(map(row), action, actor, reason);
    if (step.error) throw createHttpError(step.error, 400);
    const by = String(actor.name || "").slice(0, 255);
    const updated = step.status === "confirmed"
      ? await client.query(`UPDATE stock_crypto_addresses SET status = 'confirmed', confirmed_by_id = $2, confirmed_by = $3, confirmed_at = NOW() WHERE id = $1 RETURNING *`, [row.id, actor.id, by])
      : await client.query(`UPDATE stock_crypto_addresses SET status = 'retired', retired_by = $2, retired_at = NOW(), retired_reason = $3 WHERE id = $1 RETURNING *`, [row.id, by, String(reason).trim().slice(0, 500)]);
    await client.query("COMMIT");
    return map(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
