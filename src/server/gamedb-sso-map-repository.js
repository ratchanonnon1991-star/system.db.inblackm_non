import crypto from "crypto";
import { getPool } from "@/lib/db";
import { findUserByUsername, insertUser } from "@/server/users-repository";

// Maps a hiring admin's (OTP-verified) email to a gamedb username, so
// /api/sso/from-hiring knows which gamedb account to sign in as. Deliberately
// no FK to gamedb_users: that table may be owned by a DBA role the runtime
// account cannot declare a constraint against (see gamedb_user_preferences,
// which has the same gap for the same reason) -- existence is checked with
// findUserByUsername at the point this actually matters instead.
let schemaReady;

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    hiringEmail: row.hiring_email,
    gamedbUsername: row.gamedb_username,
    createdAt: row.created_at,
  };
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const client = await getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamedb_sso_map (
          id               SERIAL PRIMARY KEY,
          hiring_email     VARCHAR(255) NOT NULL UNIQUE,
          gamedb_username  VARCHAR(64) NOT NULL,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    } finally {
      client.release();
    }
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });

  return schemaReady;
}

export async function listSsoMappings() {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, hiring_email, gamedb_username, created_at
     FROM gamedb_sso_map ORDER BY hiring_email ASC`
  );
  return result.rows.map(mapRow);
}

export async function findGamedbUsernameByHiringEmail(email) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT gamedb_username FROM gamedb_sso_map WHERE LOWER(hiring_email) = LOWER($1)`,
    [String(email || "").trim()]
  );
  return result.rows[0]?.gamedb_username || null;
}

/** Re-linking an email that is already mapped replaces the old username
 * rather than erroring, so fixing a typo is one call, not delete-then-add. */
export async function upsertSsoMapping({ hiringEmail, gamedbUsername }) {
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO gamedb_sso_map (hiring_email, gamedb_username)
     VALUES ($1, $2)
     ON CONFLICT (hiring_email) DO UPDATE SET gamedb_username = EXCLUDED.gamedb_username
     RETURNING id, hiring_email, gamedb_username, created_at`,
    [String(hiringEmail).trim().toLowerCase(), String(gamedbUsername).trim()]
  );
  return mapRow(result.rows[0]);
}

export async function deleteSsoMapping(id) {
  await ensureSchema();
  await getPool().query(`DELETE FROM gamedb_sso_map WHERE id = $1`, [id]);
}

// Same 3-63 char alphabet the visual query builder already enforces on user
// accounts (see /api/users): letters, digits, dot, underscore, hyphen.
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/;

function usernameBaseFromEmail(email) {
  const local = String(email).split("@")[0] || "";
  const cleaned = local.toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  return (cleaned.length >= 3 ? cleaned : `${cleaned}usr`).slice(0, 28);
}

async function uniqueUsernameFromEmail(email) {
  const base = usernameBaseFromEmail(email);
  let candidate = base;
  let suffix = 1;
  // Bounded, not "while true": a username generator that can loop forever on
  // bad input is worse than one that gives up and reports why.
  while (suffix < 1000) {
    if (USERNAME_PATTERN.test(candidate) && !(await findUserByUsername(candidate))) {
      return candidate;
    }
    suffix += 1;
    candidate = `${base}${suffix}`.slice(0, 32);
  }
  throw new Error(`สร้างชื่อผู้ใช้จากอีเมล "${email}" ไม่สำเร็จ`);
}

/**
 * hiring already verified this person owns the email (its own login is
 * OTP-to-a-real-inbox) -- that is enough to hand them a gamedb account of
 * their own without an Admin pre-linking every hire by hand, but not enough
 * to hand them anything more than the least-privileged role. An Admin can
 * upgrade the account afterward from "จัดการสิทธิ์ผู้ใช้" the same as any
 * account created by hand.
 */
export async function provisionSsoUser(email) {
  const username = await uniqueUsernameFromEmail(email);
  const user = await insertUser({
    username,
    displayName: email,
    password: crypto.randomBytes(24).toString("base64url"),
    role: "user",
  });
  await upsertSsoMapping({ hiringEmail: email, gamedbUsername: user.username });
  return user;
}
