import { getPool } from "@/lib/db";
import { sanitizeLayout } from "@/server/gamedb-layout-sanitizer";

let schemaReady;

const MAX_PANELS = 24;

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    config: row.config || { panels: [] },
    isPublic: row.is_public,
    isDefault: row.is_default,
    // Locks layout AND data edits for whoever has this template open,
    // Admin included -- see layoutLocked in gamedb-workspace.js.
    isReadOnly: Boolean(row.is_read_only),
    sharedWith: Array.isArray(row.shared_with) ? row.shared_with : [],
    createdBy: row.created_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  // Created by the service's own role, so this table and its sequence are
  // owned by it — no GRANT needed the way there is for the older tables.
  schemaReady = (async () => {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS gamedb_views (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        description TEXT,
        config      JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_public   BOOLEAN NOT NULL DEFAULT FALSE,
        is_default  BOOLEAN NOT NULL DEFAULT FALSE,
        shared_with JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_by  VARCHAR(255),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // gamedb_views is created (and owned) by this service's own role, unlike
    // gamedb_users, so a plain ALTER is fine here.
    await getPool().query(`
      ALTER TABLE gamedb_views
      ADD COLUMN IF NOT EXISTS is_read_only BOOLEAN NOT NULL DEFAULT FALSE
    `);
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });
  return schemaReady;
}

/**
 * A template stores the panels of a screen: which query, how big, and an
 * optional layout snapshot so the recipient sees the columns/rules/chart the
 * author arranged, without changing the query's own saved layout.
 */
export function sanitizeViewConfig(raw) {
  const config = raw && typeof raw === "object" ? raw : {};
  const panels = Array.isArray(config.panels) ? config.panels : [];
  const seenQueryIds = new Set();
  const sanitizedPanels = [];

  for (const panel of panels) {
    const queryId = Number(panel?.queryId);
    if (
      !panel ||
      !Number.isInteger(queryId) ||
      queryId <= 0 ||
      seenQueryIds.has(queryId)
    ) {
      continue;
    }
    seenQueryIds.add(queryId);
    sanitizedPanels.push({
      queryId,
      x: panel.x !== null && panel.x !== undefined && Number.isFinite(Number(panel.x))
        ? Math.round(Math.min(8000, Math.max(0, Number(panel.x))))
        : null,
      y: panel.y !== null && panel.y !== undefined && Number.isFinite(Number(panel.y))
        ? Math.round(Math.min(20000, Math.max(0, Number(panel.y))))
        : null,
      width: Number.isFinite(Number(panel.width))
        ? Math.round(Math.min(4000, Math.max(280, Number(panel.width))))
        : null,
      height: Number.isFinite(Number(panel.height))
        ? Math.round(Math.min(1600, Math.max(140, Number(panel.height))))
        : 420,
      collapsed: Boolean(panel.collapsed),
      layout: panel.layout ? sanitizeLayout(panel.layout) : null,
    });
    if (sanitizedPanels.length >= MAX_PANELS) break;
  }

  return {
    panels: sanitizedPanels,
  };
}

export function sanitizeSharedWith(raw) {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    ),
  ].slice(0, 500);
}

/** Admins see every template; everyone else sees public ones and their own. */
export async function listViewsFor(user) {
  await ensureSchema();
  const result =
    user.role === "admin"
      ? await getPool().query(`SELECT * FROM gamedb_views ORDER BY name ASC`)
      : await getPool().query(
          `SELECT * FROM gamedb_views
           WHERE id = $2 OR is_public = TRUE OR shared_with @> $1::jsonb
           ORDER BY name ASC`,
          [JSON.stringify([user.id]), user.defaultViewId || 0]
        );
  return result.rows.map(mapRow);
}

export async function findViewById(id) {
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  await ensureSchema();
  const result = await getPool().query(`SELECT * FROM gamedb_views WHERE id = $1`, [numeric]);
  return mapRow(result.rows[0]);
}

export function canUseView(view, user) {
  if (!view) return false;
  if (user.role === "admin") return true;
  return (
    Number(view.id) === Number(user.defaultViewId) ||
    view.isPublic ||
    view.sharedWith.some((id) => Number(id) === Number(user.id))
  );
}

export async function insertView(fields) {
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO gamedb_views
       (name, description, config, is_public, is_default, is_read_only, shared_with, created_by)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb, $8)
     RETURNING id`,
    [
      fields.name,
      fields.description || "",
      JSON.stringify(sanitizeViewConfig(fields.config)),
      Boolean(fields.isPublic),
      Boolean(fields.isDefault),
      Boolean(fields.isReadOnly),
      JSON.stringify(sanitizeSharedWith(fields.sharedWith)),
      fields.createdBy || "",
    ]
  );
  return findViewById(result.rows[0].id);
}

export async function updateView(id, fields) {
  await ensureSchema();
  const sets = [];
  const values = [];
  let i = 1;

  if (fields.name !== undefined) {
    sets.push(`name = $${i++}`);
    values.push(fields.name);
  }
  if (fields.description !== undefined) {
    sets.push(`description = $${i++}`);
    values.push(fields.description);
  }
  if (fields.config !== undefined) {
    sets.push(`config = $${i++}::jsonb`);
    values.push(JSON.stringify(sanitizeViewConfig(fields.config)));
  }
  if (fields.isPublic !== undefined) {
    sets.push(`is_public = $${i++}`);
    values.push(Boolean(fields.isPublic));
  }
  if (fields.isDefault !== undefined) {
    sets.push(`is_default = $${i++}`);
    values.push(Boolean(fields.isDefault));
  }
  if (fields.isReadOnly !== undefined) {
    sets.push(`is_read_only = $${i++}`);
    values.push(Boolean(fields.isReadOnly));
  }
  if (fields.sharedWith !== undefined) {
    sets.push(`shared_with = $${i++}::jsonb`);
    values.push(JSON.stringify(sanitizeSharedWith(fields.sharedWith)));
  }

  if (!sets.length) return findViewById(id);
  sets.push(`updated_at = NOW()`);
  values.push(id);

  await getPool().query(
    `UPDATE gamedb_views SET ${sets.join(", ")} WHERE id = $${i}`,
    values
  );
  return findViewById(id);
}

export async function deleteView(id) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE gamedb_user_preferences
       SET default_view_id = NULL, updated_at = NOW()
       WHERE default_view_id = $1`,
      [id]
    );
    await client.query(`DELETE FROM gamedb_views WHERE id = $1`, [id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
