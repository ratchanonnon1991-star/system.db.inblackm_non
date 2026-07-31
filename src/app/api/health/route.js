import { getPool, getPoolForConnection } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { listConnections, findConnectionWithSecret } from "@/server/connections-repository";
import { getConnectionFlags } from "@/server/gamedb-side-tables";

// The checks a human otherwise has to run by hand in psql after hitting a
// permission error. Everything here is metadata — no table contents are read.
const OBJECT_SQL = `
  SELECT c.relname AS name,
         CASE c.relkind WHEN 'r' THEN 'table' WHEN 'S' THEN 'sequence' ELSE c.relkind::text END AS kind,
         pg_get_userbyid(c.relowner) AS owner,
         pg_has_role(current_user, c.relowner, 'USAGE') AS owned_by_me,
         CASE WHEN c.relkind = 'r' THEN has_table_privilege(current_user, c.oid, 'SELECT') END AS can_select,
         CASE WHEN c.relkind = 'r' THEN has_table_privilege(current_user, c.oid, 'INSERT') END AS can_insert,
         CASE WHEN c.relkind = 'r' THEN has_table_privilege(current_user, c.oid, 'UPDATE') END AS can_update,
         CASE WHEN c.relkind = 'r' THEN has_table_privilege(current_user, c.oid, 'DELETE') END AS can_delete,
         CASE WHEN c.relkind = 'S' THEN has_sequence_privilege(current_user, c.oid, 'USAGE') END AS can_use
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname LIKE 'gamedb\\_%'
    AND c.relkind IN ('r', 'S')
  ORDER BY c.relkind DESC, c.relname
`;

function buildFixes(objects, currentUser) {
  const fixes = [];
  for (const object of objects) {
    if (object.kind === "sequence" && object.canUse === false) {
      fixes.push(`GRANT USAGE, SELECT ON SEQUENCE ${object.name} TO ${currentUser};`);
    }
    if (object.kind === "table") {
      const missing = ["SELECT", "INSERT", "UPDATE", "DELETE"].filter(
        (privilege) => object[`can${privilege[0]}${privilege.slice(1).toLowerCase()}`] === false
      );
      if (missing.length) {
        fixes.push(`GRANT ${missing.join(", ")} ON TABLE ${object.name} TO ${currentUser};`);
      }
    }
  }
  return fixes;
}

/**
 * The saved connections, checked the way a query would use them.
 *
 * A connection that cannot be reached is not visible anywhere else until
 * someone opens a table built on it and gets an error, so each one is dialled
 * here and its own failure is reported rather than taking the whole check down
 * with it. Nothing but metadata is read, and the password never leaves this
 * function.
 */
async function checkConnections() {
  const saved = await listConnections();
  return Promise.all(
    saved.map(async (summary) => {
      const startedAt = Date.now();
      const base = { id: summary.id, name: summary.name, database: summary.database };
      try {
        const [connection, flags] = await Promise.all([
          findConnectionWithSecret(summary.id),
          getConnectionFlags(summary.id),
        ]);
        if (!connection) return { ...base, ok: false, error: "อ่านค่าเชื่อมต่อไม่ได้" };
        const result = await getPoolForConnection(connection).query(
          `SELECT current_user AS "user", current_database() AS database,
                  current_schema() AS schema`
        );
        return {
          ...base,
          ok: true,
          user: result.rows[0].user,
          database: result.rows[0].database,
          schema: result.rows[0].schema,
          allowWrite: flags.allowWrite,
          durationMs: Date.now() - startedAt,
        };
      } catch (err) {
        return { ...base, ok: false, error: err.message, durationMs: Date.now() - startedAt };
      }
    })
  );
}

export async function GET(request) {
  try {
    await requireSuperAdmin(request);
    const pool = getPool();

    const identity = await pool.query(
      `SELECT current_user AS "user", current_database() AS database,
              current_schema() AS schema, version() AS version`
    );
    const objects = (await pool.query(OBJECT_SQL)).rows.map((row) => ({
      name: row.name,
      kind: row.kind,
      owner: row.owner,
      ownedByMe: row.owned_by_me,
      canSelect: row.can_select,
      canInsert: row.can_insert,
      canUpdate: row.can_update,
      canDelete: row.can_delete,
      canUse: row.can_use,
    }));

    const expected = [
      "gamedb_queries",
      "gamedb_connections",
      "gamedb_users",
      "gamedb_views",
      "gamedb_user_layouts",
      "gamedb_connection_flags",
      "gamedb_edit_log",
      "gamedb_snapshots",
    ];
    const present = new Set(objects.map((object) => object.name));
    const missingTables = expected.filter((name) => !present.has(name));

    // Settings that look fine from the outside but are not: without these the
    // service still answers every request, it just does so unsafely.
    const env = {
      sessionSecret: Boolean(process.env.SESSION_SECRET || process.env.OTP_SECRET),
      encryptionKey: Boolean(process.env.GAMEDB_ENC_KEY),
    };

    return jsonOk({
      identity: identity.rows[0],
      connections: await checkConnections(),
      objects,
      missingTables,
      env,
      fixes: buildFixes(objects, identity.rows[0].user),
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return handleApiError(err, "ตรวจสุขภาพระบบไม่สำเร็จ");
  }
}
