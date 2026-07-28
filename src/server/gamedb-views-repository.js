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
  schemaReady = getPool().query(`
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
  return {
    panels: panels
      .filter((panel) => panel && Number.isFinite(Number(panel.queryId)))
      .slice(0, MAX_PANELS)
      .map((panel) => ({
        queryId: Number(panel.queryId),
        width: Number.isFinite(Number(panel.width))
          ? Math.round(Math.min(4000, Math.max(280, Number(panel.width))))
          : null,
        height: Number.isFinite(Number(panel.height))
          ? Math.round(Math.min(1600, Math.max(140, Number(panel.height))))
          : 420,
        collapsed: Boolean(panel.collapsed),
        layout: panel.layout ? sanitizeLayout(panel.layout) : null,
      })),
  };
}

export function sanitizeSharedWith(raw) {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
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
           WHERE is_public = TRUE OR shared_with @> $1::jsonb
           ORDER BY name ASC`,
          [JSON.stringify([user.id])]
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
  return view.isPublic || view.sharedWith.includes(user.id);
}

export async function insertView(fields) {
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO gamedb_views (name, description, config, is_public, is_default, shared_with, created_by)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7)
     RETURNING id`,
    [
      fields.name,
      fields.description || "",
      JSON.stringify(sanitizeViewConfig(fields.config)),
      Boolean(fields.isPublic),
      Boolean(fields.isDefault),
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
  await getPool().query(`DELETE FROM gamedb_views WHERE id = $1`, [id]);
}
