// projectm_itune_entries lives in the "topup_inblackm" external connection
// (same pattern gameinfo-gamelist.js uses for its own "gameinfo" connection)
// rather than this app's own primary pool. Because that's a separate
// database, created_by_user_id can't carry a real FK to gamedb_users (cross-
// database foreign keys aren't possible in Postgres) — it's a plain integer,
// and usernames are resolved with a second lookup against the primary pool
// instead of a JOIN.
import { getPool, getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "topup_inblackm";

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function getItuneConnection() {
  const connections = await listConnections();
  const match = connections.find((c) => c.name.trim().toLowerCase() === CONNECTION_NAME);
  if (!match) return null;
  return findConnectionWithSecret(match.id);
}

// Columns a client is ever allowed to write. id/added_at/created_by_user_id
// are server-stamped at insert time. status/other_notes/amount_out columns
// still exist in the table (dropping them is a destructive migration this
// app avoids without an explicit ask) but are no longer surfaced anywhere in
// the app — removed from the editable set on purpose.
const EDITABLE_FIELDS = [
  "support",
  "email",
  "password",
  "currency",
  "supplier",
  "amount",
  "amountConfirmImage",
  "linkSms",
  "qna",
];

const FIELD_COLUMNS = {
  support: "support",
  email: "email",
  password: "password",
  currency: "currency",
  supplier: "supplier",
  amount: "amount",
  amountConfirmImage: "amount_confirm_image",
  linkSms: "link_sms",
  qna: "qna",
};

// pg returns TIMESTAMPTZ columns as JS Date objects; added_at is passed
// through as an ISO string for the countdown cell.
function toIsoString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapRow(row, usernamesById = {}) {
  if (!row) return null;
  return {
    id: row.id,
    addedAt: toIsoString(row.added_at),
    support: row.support || "",
    email: row.email || "",
    password: row.password || "",
    createdByUserId: row.created_by_user_id || null,
    createdByUsername: row.created_by_user_id
      ? usernamesById[row.created_by_user_id] || null
      : null,
    currency: row.currency || "",
    supplier: row.supplier || "",
    amount: row.amount === null ? 0 : Number(row.amount),
    amountConfirmImage: row.amount_confirm_image || "",
    linkSms: row.link_sms || "",
    qna: row.qna || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Resolves { userId: username } for whichever creators showed up in a batch
// of rows — a plain lookup against the primary pool since it can't be a JOIN
// across the two separate databases.
async function fetchUsernamesById(userIds) {
  const ids = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return {};
  const result = await getPool().query(
    `SELECT id, username FROM gamedb_users WHERE id = ANY($1)`,
    [ids]
  );
  return Object.fromEntries(result.rows.map((r) => [r.id, r.username]));
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
        CREATE TABLE IF NOT EXISTS projectm_itune_entries (
          id                   SERIAL PRIMARY KEY,
          added_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          sms_expiry           DATE NOT NULL DEFAULT CURRENT_DATE,
          status               TEXT,
          support              TEXT,
          email                TEXT,
          password             TEXT,
          created_by_user_id   INTEGER,
          currency             TEXT,
          supplier             TEXT,
          amount               NUMERIC(14,2) NOT NULL DEFAULT 0,
          amount_confirm_image TEXT,
          amount_out           NUMERIC(14,2) NOT NULL DEFAULT 0,
          link_sms             TEXT,
          qna                  TEXT,
          other_notes          TEXT,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // Added after the table already existed — safe to re-run, same
      // convention as gamedb_user_preferences in users-repository.js.
      await client.query(`
        ALTER TABLE projectm_itune_entries
        ADD COLUMN IF NOT EXISTS supplier TEXT
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
  const connection = await getItuneConnection();
  if (!connection) {
    throw createHttpError(
      `ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}" — เพิ่ม Connection ชื่อนี้ก่อนที่หน้า Connections`,
      503
    );
  }
  await ensureSchema(connection);
  return getPoolForConnection(connection);
}

export async function listItuneEntries() {
  const pool = await getReadyPool();
  const result = await pool.query(`SELECT * FROM projectm_itune_entries ORDER BY id ASC`);
  const usernamesById = await fetchUsernamesById(result.rows.map((r) => r.created_by_user_id));
  return result.rows.map((row) => mapRow(row, usernamesById));
}

export async function insertItuneEntry({ createdByUserId, addedAt, ...fields }) {
  const pool = await getReadyPool();
  // ID (col 1) always picks up right after the current highest id, not
  // whatever the table's own SERIAL sequence has drifted to — rows deleted
  // during testing/use otherwise leave the sequence way ahead of the real
  // row count. LOCK TABLE serializes this against any other concurrent
  // insert so two admins adding at once can't compute the same "next id".
  const columns = ["id", "created_by_user_id"];
  const placeholders = [
    "(SELECT COALESCE(MAX(id), 0) + 1 FROM projectm_itune_entries)",
    "$1",
  ];
  const values = [createdByUserId];
  let i = 2;

  // The countdown (col 2) starts ticking client-side the moment "เพิ่มรายการ"
  // is clicked, before the row is ever saved — so the timestamp that becomes
  // authoritative here is the one captured at that moment, not whenever the
  // save request happens to land. Falls back to the column's own NOW()
  // default if the client didn't send one.
  if (addedAt) {
    columns.push("added_at");
    placeholders.push(`$${i++}`);
    values.push(addedAt);
  }

  for (const key of EDITABLE_FIELDS) {
    if (fields[key] === undefined) continue;
    columns.push(FIELD_COLUMNS[key]);
    placeholders.push(`$${i++}`);
    values.push(fields[key]);
  }

  const client = await pool.connect();
  let insertedId;
  try {
    await client.query("BEGIN");
    await client.query(
      "LOCK TABLE projectm_itune_entries IN SHARE ROW EXCLUSIVE MODE"
    );
    const result = await client.query(
      `INSERT INTO projectm_itune_entries (${columns.join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING id`,
      values
    );
    insertedId = result.rows[0].id;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return findItuneEntryById(insertedId);
}

export async function findItuneEntryById(id) {
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT * FROM projectm_itune_entries WHERE id = $1`,
    [numeric]
  );
  const row = result.rows[0];
  if (!row) return null;
  const usernamesById = await fetchUsernamesById([row.created_by_user_id]);
  return mapRow(row, usernamesById);
}

export async function updateItuneEntry(id, fields) {
  const pool = await getReadyPool();
  const sets = [];
  const values = [];
  let i = 1;

  for (const key of EDITABLE_FIELDS) {
    if (fields[key] === undefined) continue;
    sets.push(`${FIELD_COLUMNS[key]} = $${i++}`);
    values.push(fields[key]);
  }

  if (!sets.length) return findItuneEntryById(id);

  sets.push("updated_at = NOW()");
  values.push(id);
  await pool.query(
    `UPDATE projectm_itune_entries SET ${sets.join(", ")} WHERE id = $${i}`,
    values
  );
  return findItuneEntryById(id);
}

export async function saveItuneEntryImage(id, imageUrl) {
  const pool = await getReadyPool();
  await pool.query(
    `UPDATE projectm_itune_entries
     SET amount_confirm_image = $1, updated_at = NOW()
     WHERE id = $2`,
    [imageUrl || null, id]
  );
  return findItuneEntryById(id);
}

export async function deleteItuneEntry(id) {
  const pool = await getReadyPool();
  await pool.query(`DELETE FROM projectm_itune_entries WHERE id = $1`, [id]);
}
