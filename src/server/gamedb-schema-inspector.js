import { getPoolForConnection } from "@/lib/db";
import { getConnectionFlags } from "@/server/gamedb-side-tables";

const SCHEMA_SQL = `
  SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    c.relkind,
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
    NOT a.attnotnull AS nullable,
    a.attidentity <> '' AS identity_column,
    a.attgenerated <> '' AS generated_column,
    pg_catalog.has_column_privilege(c.oid, a.attnum, 'SELECT') AS can_select,
    pg_catalog.has_column_privilege(c.oid, a.attnum, 'UPDATE') AS can_update,
    COALESCE(pk.position, 0) AS primary_key_position
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_attribute a
    ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN LATERAL (
    SELECT key_position AS position
    FROM pg_catalog.pg_index i,
         unnest(i.indkey) WITH ORDINALITY AS keys(attnum, key_position)
    WHERE i.indrelid = c.oid
      AND i.indisprimary
      AND keys.attnum = a.attnum
  ) pk ON TRUE
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname !~ '^pg_toast'
    AND pg_catalog.has_table_privilege(c.oid, 'SELECT')
  ORDER BY n.nspname, c.relname, a.attnum
  LIMIT 5000
`;

const FOREIGN_KEY_SQL = `
  SELECT
    con.oid::text AS constraint_id,
    con.conname AS constraint_name,
    source_ns.nspname AS source_schema,
    source_table.relname AS source_table,
    source_column.attname AS source_column,
    target_ns.nspname AS target_schema,
    target_table.relname AS target_table,
    target_column.attname AS target_column,
    keys.position
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_class source_table ON source_table.oid = con.conrelid
  JOIN pg_catalog.pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
  JOIN pg_catalog.pg_class target_table ON target_table.oid = con.confrelid
  JOIN pg_catalog.pg_namespace target_ns ON target_ns.oid = target_table.relnamespace
  JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY
    AS keys(source_attnum, target_attnum, position) ON TRUE
  JOIN pg_catalog.pg_attribute source_column
    ON source_column.attrelid = source_table.oid AND source_column.attnum = keys.source_attnum
  JOIN pg_catalog.pg_attribute target_column
    ON target_column.attrelid = target_table.oid AND target_column.attnum = keys.target_attnum
  WHERE con.contype = 'f'
    AND source_ns.nspname NOT IN ('pg_catalog', 'information_schema')
    AND target_ns.nspname NOT IN ('pg_catalog', 'information_schema')
    AND pg_catalog.has_table_privilege(source_table.oid, 'SELECT')
    AND pg_catalog.has_table_privilege(target_table.oid, 'SELECT')
  ORDER BY con.oid, keys.position
  LIMIT 2000
`;

export function mapForeignKeyRows(rows) {
  const relationships = [];
  const byKey = new Map();
  for (const row of rows || []) {
    const key = String(row.constraint_id);
    let relationship = byKey.get(key);
    if (!relationship) {
      relationship = {
        key,
        name: row.constraint_name,
        fromTable: `${row.source_schema}.${row.source_table}`,
        toTable: `${row.target_schema}.${row.target_table}`,
        pairs: [],
      };
      byKey.set(key, relationship);
      relationships.push(relationship);
    }
    relationship.pairs.push({
      fromColumn: row.source_column,
      toColumn: row.target_column,
    });
  }
  return relationships;
}

export function mapSchemaRows(rows, allowWrite) {
  const tables = [];
  const byKey = new Map();

  for (const row of rows || []) {
    const key = `${row.schema_name}.${row.table_name}`;
    let table = byKey.get(key);
    if (!table) {
      table = {
        key,
        schema: row.schema_name,
        name: row.table_name,
        primaryKey: [],
        columns: [],
      };
      byKey.set(key, table);
      tables.push(table);
    }
    if (Number(row.primary_key_position) > 0) {
      table.primaryKey[Number(row.primary_key_position) - 1] = row.column_name;
    }
    table.columns.push({
      name: row.column_name,
      type: row.data_type,
      nullable: Boolean(row.nullable),
      identity: Boolean(row.identity_column),
      generated: Boolean(row.generated_column),
      canSelect: Boolean(row.can_select),
      databaseCanUpdate: Boolean(row.can_update),
    });
  }

  for (const table of tables) {
    table.primaryKey = table.primaryKey.filter(Boolean);
    const hasSingleKey = table.primaryKey.length === 1;
    for (const column of table.columns) {
      const isKey = table.primaryKey.includes(column.name);
      column.editable = Boolean(
        allowWrite &&
          hasSingleKey &&
          column.databaseCanUpdate &&
          !column.identity &&
          !column.generated &&
          !isKey
      );
      column.editReason = column.editable
        ? "แก้ไขได้"
        : !allowWrite
          ? "ฐานข้อมูลนี้เปิดโหมดอ่านอย่างเดียว"
          : !hasSingleKey
            ? "ตารางต้องมี Primary Key 1 คอลัมน์"
            : isKey
              ? "Primary Key ใช้ระบุแถว จึงไม่ให้แก้"
              : column.identity || column.generated
                ? "ฐานข้อมูลสร้างค่านี้ให้อัตโนมัติ"
                : !column.databaseCanUpdate
                  ? "ผู้ใช้ฐานข้อมูลไม่มีสิทธิ์ UPDATE"
                  : "อ่านอย่างเดียว";
    }
  }

  return tables;
}

export async function inspectDatabaseSchema(connection = null) {
  const flags = await getConnectionFlags(connection?.id ?? null);
  const pool = getPoolForConnection(connection);
  const [result, foreignKeys] = await Promise.all([
    pool.query(SCHEMA_SQL),
    pool.query(FOREIGN_KEY_SQL),
  ]);
  return {
    allowWrite: Boolean(flags.allowWrite),
    tables: mapSchemaRows(result.rows, Boolean(flags.allowWrite)),
    relationships: mapForeignKeyRows(foreignKeys.rows),
  };
}
