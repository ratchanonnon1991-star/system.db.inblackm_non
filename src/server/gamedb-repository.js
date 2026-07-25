import { getPool } from "@/lib/db";

let schemaReady;

const SEED_QUERIES = [
  {
    name: "ออเดอร์รายวัน (30 วันล่าสุด)",
    description: "จำนวนออเดอร์และยอดขายรวมต่อวัน จากตาราง orders",
    sql_text: `SELECT
  DATE(created_at) AS "วันที่",
  COUNT(*) AS "จำนวนออเดอร์",
  SUM(price) AS "ยอดขายรวม"
FROM orders
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY "วันที่" DESC`,
  },
  {
    name: "สต็อกคงเหลือรายแพ็ก",
    description: "ยอดคงเหลือปัจจุบันจาก stock_levels + ชื่อแพ็กจาก packages",
    sql_text: `SELECT
  p.id AS "package_id",
  g.name AS "เกม",
  p.label AS "แพ็ก",
  sl.current_qty AS "คงเหลือ",
  p.price AS "ราคาขาย",
  p.cost AS "ต้นทุน",
  sl.expires_at AS "หมดอายุ"
FROM stock_levels sl
JOIN packages p ON p.id = sl.package_id
JOIN games g ON g.id = p.game_id
ORDER BY sl.current_qty ASC`,
  },
  {
    name: "การเคลื่อนไหวสต็อกล่าสุด",
    description: "รายการเข้า/ออก 200 รายการล่าสุด จาก stock_movements",
    sql_text: `SELECT
  sm.occurred_at AS "เวลา",
  p.label AS "แพ็ก",
  sm.movement_type AS "ประเภท",
  sm.quantity_delta AS "จำนวน",
  sm.balance_after AS "คงเหลือหลังทำ",
  sm.unit_cost AS "ต้นทุน/หน่วย",
  sm.actor_name AS "ผู้ทำรายการ"
FROM stock_movements sm
JOIN packages p ON p.id = sm.package_id
ORDER BY sm.occurred_at DESC
LIMIT 200`,
  },
];

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    sqlText: row.sql_text,
    layout: row.layout || {},
    sortOrder: row.sort_order,
    createdBy: row.created_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const client = await getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamedb_queries (
          id          SERIAL PRIMARY KEY,
          name        VARCHAR(255) NOT NULL,
          description TEXT,
          sql_text    TEXT NOT NULL,
          layout      JSONB NOT NULL DEFAULT '{}'::jsonb,
          sort_order  INT NOT NULL DEFAULT 0,
          created_by  VARCHAR(255),
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      const existing = await client.query(
        `SELECT COUNT(*)::int AS count FROM gamedb_queries`
      );
      if ((existing.rows[0]?.count || 0) === 0) {
        for (let i = 0; i < SEED_QUERIES.length; i += 1) {
          const seed = SEED_QUERIES[i];
          await client.query(
            `INSERT INTO gamedb_queries (name, description, sql_text, sort_order, created_by)
             VALUES ($1, $2, $3, $4, 'system-seed')`,
            [seed.name, seed.description, seed.sql_text, i]
          );
        }
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

export async function listQueries() {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, name, description, sql_text, layout, sort_order, created_by, created_at, updated_at
     FROM gamedb_queries
     ORDER BY sort_order ASC, id ASC`
  );
  return result.rows.map(mapRow);
}

export async function findQueryById(id) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, name, description, sql_text, layout, sort_order, created_by, created_at, updated_at
     FROM gamedb_queries WHERE id = $1`,
    [id]
  );
  return mapRow(result.rows[0]);
}

export async function insertQuery({ name, description, sqlText, createdBy }) {
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO gamedb_queries (name, description, sql_text, sort_order, created_by)
     VALUES (
       $1, $2, $3,
       COALESCE((SELECT MAX(sort_order) + 1 FROM gamedb_queries), 0),
       $4
     )
     RETURNING id, name, description, sql_text, layout, sort_order, created_by, created_at, updated_at`,
    [name, description || "", sqlText, createdBy || ""]
  );
  return mapRow(result.rows[0]);
}

export async function updateQuery(id, fields) {
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
  if (fields.sqlText !== undefined) {
    sets.push(`sql_text = $${i++}`);
    values.push(fields.sqlText);
  }
  if (fields.layout !== undefined) {
    sets.push(`layout = $${i++}::jsonb`);
    values.push(JSON.stringify(fields.layout));
  }
  if (fields.sortOrder !== undefined) {
    sets.push(`sort_order = $${i++}`);
    values.push(fields.sortOrder);
  }

  if (!sets.length) return findQueryById(id);

  sets.push(`updated_at = NOW()`);
  values.push(id);

  const result = await getPool().query(
    `UPDATE gamedb_queries SET ${sets.join(", ")}
     WHERE id = $${i}
     RETURNING id, name, description, sql_text, layout, sort_order, created_by, created_at, updated_at`,
    values
  );
  return mapRow(result.rows[0]);
}

export async function deleteQuery(id) {
  await ensureSchema();
  await getPool().query(`DELETE FROM gamedb_queries WHERE id = $1`, [id]);
}
