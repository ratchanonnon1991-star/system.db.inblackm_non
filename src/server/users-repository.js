import { getPool } from "@/lib/db";
import { hashPassword } from "@/server/passwords";

let schemaReady;

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    role: row.role,
    defaultViewId: row.default_view_id || null,
    // Only meaningful for role "staff" -- an admin already has every
    // capability these gate, and "user" is template-locked regardless of
    // what got stored here (see requireDataWriter/requireDataUpdater in
    // server/auth.js, which check role first).
    canWriteData: Boolean(row.can_write_data),
    canUpdateData: Boolean(row.can_update_data),
    // Independent of the GameDB role above: admin, topup, or no access.
    projectmRole: row.projectm_role || null,
    gameinfoRole: row.gameinfo_role || null,
    createdAt: row.created_at,
  };
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const client = await getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamedb_users (
          id            SERIAL PRIMARY KEY,
          username      VARCHAR(64) NOT NULL UNIQUE,
          display_name  VARCHAR(255),
          password_hash TEXT NOT NULL,
          role          VARCHAR(16) NOT NULL DEFAULT 'staff'
                        CHECK (role IN ('admin', 'staff', 'user')),
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // gamedb_users may be owned by a DBA role, so the runtime account must
      // never ALTER it just to store a UI preference. Keep preferences in a
      // service-owned side table instead.
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamedb_user_preferences (
          user_id         INTEGER PRIMARY KEY,
          default_view_id INTEGER,
          role_override   VARCHAR(16)
                          CHECK (role_override IS NULL OR role_override = 'user'),
          projectm_role   VARCHAR(16)
                          CHECK (projectm_role IS NULL OR projectm_role IN ('admin', 'topup')),
          gameinfo_role   VARCHAR(16)
                          CHECK (gameinfo_role IS NULL OR gameinfo_role IN ('admin', 'topup')),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // The previous failed startup may already have created this table before
      // it reached the owner-only ALTER on gamedb_users.
      await client.query(`
        ALTER TABLE gamedb_user_preferences
        ADD COLUMN IF NOT EXISTS role_override VARCHAR(16)
      `);
      // Per-account grants for a Staff account to reach the same "editable"
      // table capability an Admin has (inline cell edit / add-remove rows),
      // without becoming an Admin (no SQL editor, no user management). See
      // requireDataWriter/requireDataUpdater in server/auth.js.
      await client.query(`
        ALTER TABLE gamedb_user_preferences
        ADD COLUMN IF NOT EXISTS can_write_data BOOLEAN NOT NULL DEFAULT FALSE
      `);
      await client.query(`
        ALTER TABLE gamedb_user_preferences
        ADD COLUMN IF NOT EXISTS can_update_data BOOLEAN NOT NULL DEFAULT FALSE
      `);
      // Separate from the GameDB role entirely. NULL means no Projectm access.
      await client.query(`
        ALTER TABLE gamedb_user_preferences
        ADD COLUMN IF NOT EXISTS projectm_role VARCHAR(16)
      `);
      await client.query(`
        ALTER TABLE gamedb_user_preferences
        DROP CONSTRAINT IF EXISTS gamedb_user_preferences_projectm_role_check
      `);
      await client.query(`
        ALTER TABLE gamedb_user_preferences
        ADD CONSTRAINT gamedb_user_preferences_projectm_role_check
        CHECK (projectm_role IS NULL OR projectm_role IN ('admin', 'topup'))
      `);
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'gamedb_user_preferences'
              AND column_name = 'gameinfo_role'
          ) THEN
            ALTER TABLE gamedb_user_preferences ADD COLUMN gameinfo_role VARCHAR(16);
            UPDATE gamedb_user_preferences SET gameinfo_role = projectm_role;
          END IF;
        END $$
      `);
      await client.query(`
        ALTER TABLE gamedb_user_preferences
        DROP CONSTRAINT IF EXISTS gamedb_user_preferences_gameinfo_role_check
      `);
      await client.query(`
        ALTER TABLE gamedb_user_preferences
        ADD CONSTRAINT gamedb_user_preferences_gameinfo_role_check
        CHECK (gameinfo_role IS NULL OR gameinfo_role IN ('admin', 'topup'))
      `);

      // First-run seed: create the initial admin from env so no password
      // ever lives in the codebase. Only runs when the table is empty.
      const existing = await client.query(
        `SELECT COUNT(*)::int AS count FROM gamedb_users`
      );
      const seedUser = (process.env.GAMEDB_ADMIN_USERNAME || "").trim();
      const seedPass = process.env.GAMEDB_ADMIN_PASSWORD || "";
      if ((existing.rows[0]?.count || 0) === 0 && seedUser && seedPass) {
        await client.query(
          `INSERT INTO gamedb_users (username, display_name, password_hash, role)
           VALUES ($1, $1, $2, 'admin')
           ON CONFLICT (username) DO NOTHING`,
          [seedUser, hashPassword(seedPass)]
        );
      }
    } finally {
      client.release();
    }
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });

  return schemaReady;
}

export async function findUserByUsername(username) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT u.id, u.username, u.display_name, u.password_hash,
            COALESCE(p.role_override, u.role) AS role,
            p.default_view_id, p.can_write_data, p.can_update_data,
            p.projectm_role, p.gameinfo_role, u.created_at
     FROM gamedb_users u
     LEFT JOIN gamedb_user_preferences p ON p.user_id = u.id
     WHERE LOWER(u.username) = LOWER($1)`,
    [username]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...mapRow(row), passwordHash: row.password_hash };
}

export async function findUserById(id) {
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  await ensureSchema();
  const result = await getPool().query(
    `SELECT u.id, u.username, u.display_name,
            COALESCE(p.role_override, u.role) AS role,
            p.default_view_id, p.can_write_data, p.can_update_data,
            p.projectm_role, p.gameinfo_role, u.created_at
     FROM gamedb_users u
     LEFT JOIN gamedb_user_preferences p ON p.user_id = u.id
     WHERE u.id = $1`,
    [numeric]
  );
  return mapRow(result.rows[0]);
}

export async function listUsers() {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT u.id, u.username, u.display_name,
            COALESCE(p.role_override, u.role) AS role,
            p.default_view_id, p.can_write_data, p.can_update_data,
            p.projectm_role, p.gameinfo_role, u.created_at
     FROM gamedb_users u
     LEFT JOIN gamedb_user_preferences p ON p.user_id = u.id
     ORDER BY u.id ASC`
  );
  return result.rows.map(mapRow);
}

export async function countAdmins() {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT COUNT(*)::int AS count FROM gamedb_users WHERE role = 'admin'`
  );
  return result.rows[0]?.count || 0;
}

export async function insertUser({
  username,
  displayName,
  password,
  role,
  defaultViewId = null,
  canWriteData = false,
  canUpdateData = false,
  projectmRole = null,
  gameinfoRole = null,
}) {
  await ensureSchema();
  const client = await getPool().connect();
  let userId;
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO gamedb_users (username, display_name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        username,
        displayName || username,
        hashPassword(password),
        role === "user" ? "staff" : role,
      ]
    );
    userId = result.rows[0].id;
    // Only "staff" ever reads these -- requireDataWriter/requireDataUpdater
    // check role first, so storing true for another role is inert, but there
    // is no reason to store it either. System roles are independent of the
    // GameDB role and apply whatever that role is.
    const writeGrant = role === "staff" && Boolean(canWriteData);
    const updateGrant = role === "staff" && Boolean(canUpdateData);
    if (defaultViewId || role === "user" || writeGrant || updateGrant || projectmRole || gameinfoRole) {
      await client.query(
        `INSERT INTO gamedb_user_preferences
           (user_id, default_view_id, role_override, can_write_data, can_update_data,
            projectm_role, gameinfo_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO UPDATE
         SET default_view_id = EXCLUDED.default_view_id,
             role_override = EXCLUDED.role_override,
             can_write_data = EXCLUDED.can_write_data,
             can_update_data = EXCLUDED.can_update_data,
             projectm_role = EXCLUDED.projectm_role,
             gameinfo_role = EXCLUDED.gameinfo_role,
             updated_at = NOW()`,
        [
          userId,
          defaultViewId,
          role === "user" ? "user" : null,
          writeGrant,
          updateGrant,
          projectmRole || null,
          gameinfoRole || null,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return findUserById(userId);
}

export async function updateUser(id, fields) {
  await ensureSchema();
  const sets = [];
  const values = [];
  let i = 1;

  if (fields.displayName !== undefined) {
    sets.push(`display_name = $${i++}`);
    values.push(fields.displayName);
  }
  if (fields.role !== undefined) {
    sets.push(`role = $${i++}`);
    values.push(fields.role === "user" ? "staff" : fields.role);
  }
  if (fields.password) {
    sets.push(`password_hash = $${i++}`);
    values.push(hashPassword(fields.password));
  }

  const touchesPreferences =
    fields.defaultViewId !== undefined ||
    fields.role !== undefined ||
    fields.canWriteData !== undefined ||
    fields.canUpdateData !== undefined ||
    fields.projectmRole !== undefined ||
    fields.gameinfoRole !== undefined;

  if (!sets.length && !touchesPreferences) {
    return findUserById(id);
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (sets.length) {
      sets.push(`updated_at = NOW()`);
      values.push(id);
      await client.query(
        `UPDATE gamedb_users SET ${sets.join(", ")} WHERE id = $${i}`,
        values
      );
    }
    if (touchesPreferences) {
      const currentPreference = await client.query(
        `SELECT default_view_id, role_override, can_write_data, can_update_data,
                projectm_role, gameinfo_role
         FROM gamedb_user_preferences WHERE user_id = $1`,
        [id]
      );
      const current = currentPreference.rows[0] || {};
      const nextDefaultViewId =
        fields.defaultViewId !== undefined
          ? fields.defaultViewId
          : current.default_view_id || null;
      const nextRoleOverride =
        fields.role !== undefined
          ? fields.role === "user"
            ? "user"
            : null
          : current.role_override || null;
      // Inert unless the effective role ends up "staff" (see
      // requireDataWriter/requireDataUpdater), so no need to look up the
      // resulting role here just to gate storage.
      const nextWriteGrant =
        fields.canWriteData !== undefined
          ? Boolean(fields.canWriteData)
          : Boolean(current.can_write_data);
      const nextUpdateGrant =
        fields.canUpdateData !== undefined
          ? Boolean(fields.canUpdateData)
          : Boolean(current.can_update_data);
      const nextProjectmRole =
        fields.projectmRole !== undefined
          ? fields.projectmRole || null
          : current.projectm_role || null;
      const nextGameinfoRole =
        fields.gameinfoRole !== undefined
          ? fields.gameinfoRole || null
          : current.gameinfo_role || null;

      // With no preference set there is nothing to keep.
      if (
        nextDefaultViewId ||
        nextRoleOverride ||
        nextWriteGrant ||
        nextUpdateGrant ||
        nextProjectmRole ||
        nextGameinfoRole
      ) {
        await client.query(
          `INSERT INTO gamedb_user_preferences
             (user_id, default_view_id, role_override, can_write_data, can_update_data,
              projectm_role, gameinfo_role)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id) DO UPDATE
           SET default_view_id = EXCLUDED.default_view_id,
               role_override = EXCLUDED.role_override,
               can_write_data = EXCLUDED.can_write_data,
               can_update_data = EXCLUDED.can_update_data,
               projectm_role = EXCLUDED.projectm_role,
               gameinfo_role = EXCLUDED.gameinfo_role,
               updated_at = NOW()`,
          [
            id,
            nextDefaultViewId,
            nextRoleOverride,
            nextWriteGrant,
            nextUpdateGrant,
            nextProjectmRole,
            nextGameinfoRole,
          ]
        );
      } else {
        await client.query(
          `DELETE FROM gamedb_user_preferences WHERE user_id = $1`,
          [id]
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return findUserById(id);
}

export async function deleteUser(id) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM gamedb_user_preferences WHERE user_id = $1`,
      [id]
    );
    await client.query(`DELETE FROM gamedb_users WHERE id = $1`, [id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
