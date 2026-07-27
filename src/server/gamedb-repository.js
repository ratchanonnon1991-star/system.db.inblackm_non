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
    connectionId: row.connection_id ?? null,
    connectionName: row.connection_name || null,
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

      // Same DDL as connections-repository so either module can run first;
      // the FK below needs this table to exist.
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamedb_connections (
          id           SERIAL PRIMARY KEY,
          name         VARCHAR(255) NOT NULL,
          host         VARCHAR(255) NOT NULL,
          port         INT NOT NULL DEFAULT 5432,
          database     VARCHAR(255) NOT NULL,
          username     VARCHAR(255) NOT NULL,
          password_enc TEXT,
          ssl          BOOLEAN NOT NULL DEFAULT FALSE,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // Postgres checks table ownership before it evaluates IF NOT EXISTS, so
      // an ALTER on every boot fails with 42501 whenever the app connects as a
      // role that only holds DML grants. Look the column up first and touch the
      // table only when the migration really has to run.
      const hasConnectionId = await client.query(`
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = to_regclass('gamedb_queries')
          AND attname = 'connection_id'
          AND NOT attisdropped
      `);
      if (hasConnectionId.rowCount === 0) {
        try {
          await client.query(`
            ALTER TABLE gamedb_queries
            ADD COLUMN IF NOT EXISTS connection_id INT REFERENCES gamedb_connections(id) ON DELETE SET NULL
          `);
        } catch (err) {
          if (err?.code === "42501") {
            throw new Error(
              "ตาราง gamedb_queries ยังไม่มีคอลัมน์ connection_id และ user ที่ service ใช้อยู่ไม่ได้เป็นเจ้าของตาราง " +
                "ให้เจ้าของตารางรัน: ALTER TABLE gamedb_queries ADD COLUMN connection_id INT REFERENCES gamedb_connections(id) ON DELETE SET NULL;"
            );
          }
          throw err;
        }
      }

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

const SELECT_QUERY = `
  SELECT q.id, q.name, q.description, q.sql_text, q.layout, q.sort_order,
         q.created_by, q.connection_id, c.name AS connection_name,
         q.created_at, q.updated_at
  FROM gamedb_queries q
  LEFT JOIN gamedb_connections c ON c.id = q.connection_id
`;

export async function listQueries() {
  await ensureSchema();
  const result = await getPool().query(
    `${SELECT_QUERY} ORDER BY q.sort_order ASC, q.id ASC`
  );
  return result.rows.map(mapRow);
}

export async function findQueryById(id) {
  await ensureSchema();
  const result = await getPool().query(`${SELECT_QUERY} WHERE q.id = $1`, [id]);
  return mapRow(result.rows[0]);
}

export async function insertQuery({ name, description, sqlText, createdBy, connectionId }) {
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO gamedb_queries (name, description, sql_text, sort_order, created_by, connection_id)
     VALUES (
       $1, $2, $3,
       COALESCE((SELECT MAX(sort_order) + 1 FROM gamedb_queries), 0),
       $4, $5
     )
     RETURNING id`,
    [name, description || "", sqlText, createdBy || "", connectionId ?? null]
  );
  return findQueryById(result.rows[0].id);
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
  if (fields.connectionId !== undefined) {
    sets.push(`connection_id = $${i++}`);
    values.push(fields.connectionId ?? null);
  }

  if (!sets.length) return findQueryById(id);

  sets.push(`updated_at = NOW()`);
  values.push(id);

  await getPool().query(
    `UPDATE gamedb_queries SET ${sets.join(", ")} WHERE id = $${i}`,
    values
  );
  return findQueryById(id);
}

export async function deleteQuery(id) {
  await ensureSchema();
  await getPool().query(`DELETE FROM gamedb_queries WHERE id = $1`, [id]);
}
