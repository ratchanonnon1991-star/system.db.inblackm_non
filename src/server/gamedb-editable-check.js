import { getPoolForConnection } from "@/lib/db";
import { quoteIdentifier } from "@/lib/gamedb-identifier";
import { realColumnOf, realPkOf } from "@/lib/gamedb-layout";
import { getConnectionFlags } from "@/server/gamedb-side-tables";

const STATEMENT_TIMEOUT_MS = 8000;

/**
 * The statements `updateCell` will issue for one column, built the same way it
 * builds them -- same quoting, same placeholders, same RETURNING -- so what is
 * shown is what will run rather than a description of it.
 */
export function buildUpdateSql(editable, column) {
  const table = quoteIdentifier(editable.table);
  const pk = quoteIdentifier(realPkOf(editable));
  const target = quoteIdentifier(realColumnOf(editable, column));
  return {
    column,
    realColumn: realColumnOf(editable, column),
    lock: `SELECT ${target} AS value FROM ${table} WHERE ${pk} = $1 FOR UPDATE`,
    update: `UPDATE ${table} SET ${target} = $1 WHERE ${pk} = $2 RETURNING ${target} AS value`,
  };
}

function splitTable(name) {
  const parts = String(name).split(".");
  return parts.length === 2
    ? { schema: parts[0], table: parts[1] }
    : { schema: null, table: parts[0] };
}

/**
 * Answers "would a write work?" without writing anything.
 *
 * Every probe reads the catalog with bound parameters. Nothing here builds a
 * statement out of the config being tested, so a config that is wrong is
 * reported rather than executed -- which is the point of testing it before it
 * is saved.
 */
export async function checkEditable({ editable, connection }) {
  const checks = [];
  const { schema, table } = splitTable(editable.table);
  const pkColumn = realPkOf(editable);

  const flags = await getConnectionFlags(connection?.id ?? null);
  const dbName = connection ? connection.name : "หลัก (inblackm)";
  checks.push(
    flags.allowWrite
      ? { ok: true, label: "ฐานข้อมูลเปิดให้เขียน", detail: dbName }
      : {
          ok: false,
          label: "ฐานข้อมูลยังไม่เปิดให้เขียน",
          detail: `ไปติ๊ก "อนุญาตให้แก้ไขข้อมูล" ของ ${dbName} ที่หน้าจัดการฐานข้อมูลก่อน`,
        }
  );

  let client;
  try {
    client = await getPoolForConnection(connection).connect();
  } catch (err) {
    checks.push({ ok: false, label: "เชื่อมต่อฐานข้อมูลไม่ได้", detail: err.message });
    return { checks, sql: [] };
  }

  try {
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

    const found = await client.query(
      // No schema given means "whatever the search_path would have picked",
      // which is what the unqualified name in the config will resolve to.
      `SELECT c.relname AS table, n.nspname AS schema
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = $1
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND (CASE
                 WHEN $2::text IS NULL THEN pg_catalog.pg_table_is_visible(c.oid)
                 ELSE n.nspname = $2
               END)
        LIMIT 2`,
      [table, schema]
    );
    if (found.rowCount === 0) {
      checks.push({
        ok: false,
        label: "ไม่พบตารางนี้",
        detail: `${editable.table} — ตรวจชื่อ หรือใส่ schema นำหน้า เช่น public.${table}`,
      });
      return { checks, sql: [] };
    }
    const resolvedSchema = found.rows[0].schema;
    checks.push({
      ok: true,
      label: "พบตาราง",
      detail: `${resolvedSchema}.${found.rows[0].table}`,
    });

    const columns = await client.query(
      `SELECT a.attname AS name,
              pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
              a.attnotnull AS not_null,
              pg_get_expr(d.adbin, d.adrelid) IS NOT NULL AS has_default
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE c.relname = $1 AND n.nspname = $2 AND a.attnum > 0 AND NOT a.attisdropped`,
      [found.rows[0].table, resolvedSchema]
    );
    const byName = new Map(columns.rows.map((row) => [row.name, row]));

    const pkInfo = byName.get(pkColumn);
    checks.push(
      pkInfo
        ? { ok: true, label: `คอลัมน์ key "${pkColumn}"`, detail: pkInfo.type }
        : {
            ok: false,
            label: `ไม่พบคอลัมน์ key "${pkColumn}" ในตาราง`,
            detail: `ถ้า Query ตั้ง alias ไว้ ให้กรอก "ชื่อจริงในตาราง" ด้วย · ตารางนี้มี: ${columns.rows
              .map((row) => row.name)
              .slice(0, 25)
              .join(", ")}`,
          }
    );

    // The writer refuses to touch more than one row, so a key without a unique
    // index is the thing that turns an edit into a 409 at the worst moment.
    if (pkInfo) {
      const unique = await client.query(
        `SELECT 1
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = $1 AND n.nspname = $2
            AND i.indisunique
            AND i.indnatts = 1
            AND i.indkey[0] = (SELECT attnum FROM pg_attribute
                                WHERE attrelid = c.oid AND attname = $3)
          LIMIT 1`,
        [found.rows[0].table, resolvedSchema, pkColumn]
      );
      checks.push(
        unique.rowCount > 0
          ? { ok: true, label: `"${pkColumn}" เป็นค่าไม่ซ้ำ (มี unique index)`, detail: "" }
          : {
              ok: false,
              label: `"${pkColumn}" ไม่มี unique index`,
              detail: "ถ้าค่าซ้ำกัน การแก้ไขจะถูกปฏิเสธตอนเจอมากกว่า 1 แถว",
            }
      );
    }

    const missing = [];
    const resolved = [];
    for (const column of editable.columns) {
      const real = realColumnOf(editable, column);
      const info = byName.get(real);
      if (info) {
        resolved.push(
          `${column}${real === column ? "" : ` → ${real}`} (${info.type}${
            info.not_null && !info.has_default ? ", ต้องมีค่า" : ""
          })`
        );
      } else {
        missing.push(`${column}${real === column ? "" : ` → ${real}`}`);
      }
    }
    if (editable.columns.length > 0) {
      checks.push(
        missing.length === 0
          ? { ok: true, label: "คอลัมน์ที่อนุญาตให้แก้มีครบ", detail: resolved.join(" · ") }
          : {
              ok: false,
              label: `ไม่พบในตาราง ${missing.length} คอลัมน์`,
              detail: `${missing.join(", ")} — คอลัมน์ที่มาจากการคำนวณหรือ JOIN เขียนกลับไม่ได้`,
            }
      );
    }

    for (const input of editable.inputs || []) {
      if (input.widget !== "lookup" || !input.lookup) continue;
      const lookup = splitTable(input.lookup.table);
      const ok = await client.query(
        `SELECT a.attname AS name
           FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = $1
            AND ($2::text IS NULL OR n.nspname = $2)
            AND a.attname = ANY($3::text[])
            AND a.attnum > 0 AND NOT a.attisdropped`,
        [lookup.table, lookup.schema, [input.lookup.valueColumn, input.lookup.labelColumn]]
      );
      const seen = new Set(ok.rows.map((row) => row.name));
      const absent = [input.lookup.valueColumn, input.lookup.labelColumn].filter(
        (name) => !seen.has(name)
      );
      checks.push(
        absent.length === 0
          ? {
              ok: true,
              label: `ตัวเลือกของ "${input.column}"`,
              detail: `${input.lookup.table}: แสดง ${input.lookup.labelColumn} เก็บ ${input.lookup.valueColumn}`,
            }
          : {
              ok: false,
              label: `ตัวเลือกของ "${input.column}" ใช้ไม่ได้`,
              detail: `${input.lookup.table} ไม่มีคอลัมน์ ${absent.join(", ")}`,
            }
      );
    }

    const sql = editable.columns.map((column) => buildUpdateSql(editable, column));
    return { checks, sql };
  } catch (err) {
    checks.push({ ok: false, label: "ตรวจสอบไม่สำเร็จ", detail: err.message });
    return { checks, sql: [] };
  } finally {
    client.release();
  }
}
