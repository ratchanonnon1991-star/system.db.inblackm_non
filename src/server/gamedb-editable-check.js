import { getPoolForConnection } from "@/lib/db";
import { quoteIdentifier } from "@/lib/gamedb-identifier";
import { LOOKUP_LIMIT, realColumnOf, realPkOf, writeTargetFor } from "@/lib/gamedb-layout";
import { getConnectionFlags } from "@/server/gamedb-side-tables";

const STATEMENT_TIMEOUT_MS = 8000;

/**
 * The statements `updateCell` will issue for one column, built the same way it
 * builds them -- same quoting, same placeholders, same RETURNING -- so what is
 * shown is what will run rather than a description of it.
 */
export function buildUpdateSql(editable, column) {
  const writeTarget = writeTargetFor(editable, column);
  const table = quoteIdentifier(writeTarget.table);
  const pk = quoteIdentifier(realPkOf(writeTarget));
  const target = quoteIdentifier(realColumnOf(editable, column));
  return {
    column,
    table: writeTarget.table,
    realColumn: realColumnOf(editable, column),
    lock: `SELECT ${target} AS value FROM ${table} WHERE ${pk} = $1 FOR UPDATE`,
    update: `UPDATE ${table} SET ${target} = $1 WHERE ${pk} = $2 RETURNING ${target} AS value`,
  };
}

/**
 * Every statement this config can lead to, grouped by the action that issues it,
 * each built by the same code path the writer uses.
 *
 * INSERT is shown with all allowed columns present. The real statement leaves out
 * whatever was left blank, so column DEFAULTs still apply -- which is said here
 * rather than implied, because the shape changes per row.
 */
export function buildAllSql(editable) {
  const table = quoteIdentifier(editable.table);
  const pk = quoteIdentifier(realPkOf(editable));
  const columns = editable.columns || [];

  // A stacked query has no single table: which one a row belongs to is read
  // off the row itself, so the statement for one column is one statement per
  // half. Showing only the first would describe a write that never happens to
  // half the rows.
  const rows = editable.rowTargets;
  if (rows) {
    return [
      {
        action: "แก้ค่าในช่อง (UPDATE)",
        always: true,
        statements: columns.map((column) => ({
          label: column,
          sql: rows.branches
            .map((branch) => {
              const real = quoteIdentifier(branch.columnMap?.[column] || column);
              const branchTable = quoteIdentifier(branch.table);
              const branchPk = quoteIdentifier(branch.pkColumn);
              return (
                `-- เมื่อ ${rows.sourceColumn} = '${branch.table}'\n` +
                `UPDATE ${branchTable} SET ${real} = $1 WHERE ${branchPk} = $2 ` +
                `RETURNING ${real} AS value`
              );
            })
            .join("\n"),
        })),
        note:
          `$1 คือค่าใหม่ · $2 คือค่าจากคอลัมน์ "${rows.keyColumn}" ของแถวนั้น · ` +
          `ระบบเลือกคำสั่งจากค่าในคอลัมน์ "${rows.sourceColumn}" ของแถวนั้น ` +
          "ถ้าค่าไม่ตรงกับตารางไหนเลย จะไม่เขียนอะไรทั้งสิ้น",
      },
    ];
  }

  const groups = [
    {
      action: "แก้ค่าในช่อง (UPDATE)",
      always: true,
      statements: columns.map((column) => {
        const built = buildUpdateSql(editable, column);
        const renamed = built.realColumn === column ? "" : ` → ${built.realColumn}`;
        // Which table each column goes to is the whole point once a query
        // joins, so it is on the label rather than only inside the SQL.
        const elsewhere = built.table === editable.table ? "" : ` (ในตาราง ${built.table})`;
        return {
          label: `${column}${renamed}${elsewhere}`,
          sql: [built.lock, built.update].join("\n"),
        };
      }),
      note: "$1 คือค่าใหม่ · $2 คือค่า key ของแถวนั้น ในตารางของคอลัมน์นั้นเอง",
    },
  ];

  // Only the base table's own columns -- a joined table's column is editable
  // but has no place in an INSERT that adds a row to this one.
  const insertColumns = columns.filter(
    (column) => writeTargetFor(editable, column).table === editable.table
  );
  if (insertColumns.length > 0) {
    const real = insertColumns.map((column) => quoteIdentifier(realColumnOf(editable, column)));
    groups.push({
      action: "เพิ่มแถวใหม่ (INSERT)",
      always: Boolean(editable.allowInsert),
      statements: [
        {
          label: "ทุกคอลัมน์ที่อนุญาต",
          sql:
            `INSERT INTO ${table} (${real.join(", ")})\n` +
            `VALUES (${real.map((_, index) => `$${index + 1}`).join(", ")})\n` +
            `RETURNING ${pk} AS pk`,
        },
      ],
      note: "ช่องที่เว้นว่างจะถูกตัดออกจากคำสั่งไปเลย ไม่ได้ส่งเป็น NULL — คอลัมน์นั้นจึงใช้ DEFAULT ของตารางตามปกติ",
    });
  }

  groups.push({
    action: "ลบแถว (DELETE)",
    always: Boolean(editable.allowDelete),
    statements: [
      {
        label: "อ่านไว้ลง log ก่อน แล้วจึงลบ",
        sql: [
          `SELECT * FROM ${table} WHERE ${pk} = $1 FOR UPDATE`,
          `DELETE FROM ${table} WHERE ${pk} = $1`,
        ].join("\n"),
      },
    ],
    note: "ถ้า key ตรงกับ 0 แถวหรือมากกว่า 1 แถว จะไม่ลบและ rollback",
  });

  const lookups = (editable.inputs || []).filter(
    (input) => input.widget === "lookup" && input.lookup
  );
  if (lookups.length > 0) {
    groups.push({
      action: "อ่านรายการ dropdown (SELECT)",
      always: true,
      statements: lookups.map((input) => ({
        label: input.column,
        sql:
          `SELECT ${quoteIdentifier(input.lookup.valueColumn)} AS value, ` +
          `${quoteIdentifier(input.lookup.labelColumn)} AS label\n` +
          `FROM ${quoteIdentifier(input.lookup.table)}\n` +
          `WHERE ${quoteIdentifier(input.lookup.valueColumn)} IS NOT NULL\n` +
          `ORDER BY ${quoteIdentifier(input.lookup.labelColumn)}\n` +
          `LIMIT ${LOOKUP_LIMIT}`,
      })),
      note: "อ่านครั้งเดียวต่อการเปิดตาราง ไม่ผูกค่าอะไรเข้าไป",
    });
  }

  return groups.filter((group) => group.statements.length > 0);
}

// No schema given means "whatever the search_path would have picked", which is
// what the unqualified name in the config will resolve to.
const FIND_TABLE_SQL = `
  SELECT c.relname AS table, n.nspname AS schema
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relname = $1
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND (CASE
            WHEN $2::text IS NULL THEN pg_catalog.pg_table_is_visible(c.oid)
            ELSE n.nspname = $2
          END)
   LIMIT 2`;

const TABLE_COLUMNS_SQL = `
  SELECT a.attname AS name,
         pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
         a.attnotnull AS not_null,
         pg_get_expr(d.adbin, d.adrelid) IS NOT NULL AS has_default
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE c.relname = $1 AND n.nspname = $2 AND a.attnum > 0 AND NOT a.attisdropped`;

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

    const found = await client.query(FIND_TABLE_SQL, [table, schema]);
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

    const columns = await client.query(TABLE_COLUMNS_SQL, [found.rows[0].table, resolvedSchema]);
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
        // Same conditions the schema reader uses to call a column a row
        // identity: one key column, no expression, and no WHERE -- a partial
        // unique index only promises uniqueness among the rows it covers, so
        // it is not a promise about the row being written.
        `SELECT 1
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = $1 AND n.nspname = $2
            AND i.indisunique
            AND i.indisvalid
            AND i.indnkeyatts = 1
            AND i.indexprs IS NULL
            AND i.indpred IS NULL
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

    // Only the columns that write back to *this* table -- a joined table's
    // columns are checked against their own table further down, and reporting
    // them as missing here would be a false alarm on a correct config.
    const baseColumns = editable.columns.filter(
      (column) => writeTargetFor(editable, column).table === editable.table
    );
    const missing = [];
    const resolved = [];
    for (const column of baseColumns) {
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
    if (baseColumns.length > 0) {
      checks.push(
        missing.length === 0
          ? { ok: true, label: "คอลัมน์ที่อนุญาตให้แก้มีครบ", detail: resolved.join(" · ") }
          : {
              ok: false,
              label: `ไม่พบในตาราง ${missing.length} คอลัมน์`,
              detail: `${missing.join(", ")} — คอลัมน์ที่มาจากการคำนวณเขียนกลับไม่ได้`,
            }
      );
    }

    // Every half of a stacked query gets the same two questions the base
    // table did, against its own names for the shared columns.
    for (const branch of editable.rowTargets?.branches || []) {
      const where = splitTable(branch.table);
      const branchFound = await client.query(FIND_TABLE_SQL, [where.table, where.schema]);
      if (branchFound.rowCount === 0) {
        checks.push({
          ok: false,
          label: `ไม่พบตาราง "${branch.table}"`,
          detail: `เป็นหนึ่งในตารางที่ UNION นี้ดึงมา`,
        });
        continue;
      }
      const branchColumns = await client.query(TABLE_COLUMNS_SQL, [
        branchFound.rows[0].table,
        branchFound.rows[0].schema,
      ]);
      const present = new Set(branchColumns.rows.map((row) => row.name));
      const wanted = [
        branch.pkColumn,
        ...editable.columns.map((name) => branch.columnMap?.[name] || name),
      ];
      const absent = wanted.filter(
        (name, index, all) => !present.has(name) && all.indexOf(name) === index
      );
      checks.push(
        absent.length === 0
          ? {
              ok: true,
              label: `เขียนกลับตาราง "${branch.table}" ได้`,
              detail: `ระบุแถวด้วย ${branch.pkColumn} · ${editable.columns
                .map((name) =>
                  branch.columnMap?.[name] && branch.columnMap[name] !== name
                    ? `${name} → ${branch.columnMap[name]}`
                    : name
                )
                .join(", ")}`,
            }
          : {
              ok: false,
              label: `ตาราง "${branch.table}" ไม่มีคอลัมน์ ${absent.join(", ")}`,
              detail: `ตารางนี้มี: ${branchColumns.rows
                .map((row) => row.name)
                .slice(0, 25)
                .join(", ")}`,
            }
      );
    }

    // Each joined table gets the same two questions the base table did: is it
    // there, and does it really own the columns and the key this config says
    // it does. Nothing here is built from the config -- every value is bound.
    for (const target of editable.targets || []) {
      const targetColumns = target.columns.filter((name) => editable.columns.includes(name));
      if (targetColumns.length === 0) continue;
      const targetPk = target.pkColumn || target.pk;
      const where = splitTable(target.table);
      const targetFound = await client.query(FIND_TABLE_SQL, [where.table, where.schema]);
      if (targetFound.rowCount === 0) {
        checks.push({
          ok: false,
          label: `ไม่พบตาราง "${target.table}"`,
          detail: `ตั้งไว้ให้คอลัมน์ ${targetColumns.join(", ")} เขียนกลับไปที่ตารางนี้`,
        });
        continue;
      }
      const targetColumnRows = await client.query(TABLE_COLUMNS_SQL, [
        targetFound.rows[0].table,
        targetFound.rows[0].schema,
      ]);
      const present = new Set(targetColumnRows.rows.map((row) => row.name));
      const absent = [
        targetPk,
        ...targetColumns.map((name) => realColumnOf(editable, name)),
      ].filter((name, index, all) => !present.has(name) && all.indexOf(name) === index);
      checks.push(
        absent.length === 0
          ? {
              ok: true,
              label: `เขียนกลับตาราง "${target.table}" ได้`,
              detail: `ระบุแถวด้วย ${targetPk} · ${targetColumns.join(", ")}`,
            }
          : {
              ok: false,
              label: `ตาราง "${target.table}" ไม่มีคอลัมน์ ${absent.join(", ")}`,
              detail: `ตารางนี้มี: ${targetColumnRows.rows
                .map((row) => row.name)
                .slice(0, 25)
                .join(", ")}`,
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

    // A few real rows so an admin can see what they are about to let Staff
    // write to before turning the write on -- read-only, same LIMIT 3 whether
    // the config is otherwise clean or not, so it still shows the table even
    // when a column is misconfigured.
    let sample = null;
    if (pkInfo) {
      try {
        const sampleColumns = [pkColumn, ...(resolved.length ? baseColumns : [])]
          .map((column) => (column === pkColumn ? pkColumn : realColumnOf(editable, column)))
          .filter((real, index, all) => byName.has(real) && all.indexOf(real) === index)
          .slice(0, 6);
        const selectList = sampleColumns.map((real) => quoteIdentifier(real)).join(", ");
        const preview = await client.query(
          `SELECT ${selectList} FROM ${quoteIdentifier(editable.table)}
            ORDER BY ${quoteIdentifier(pkColumn)} DESC LIMIT 3`,
          []
        );
        sample = { columns: sampleColumns, rows: preview.rows };
      } catch {
        // Preview only -- if it fails for any reason, the checks above still
        // stand on their own.
      }
    }

    const sql = editable.columns.map((column) => buildUpdateSql(editable, column));
    return { checks, sql, sample };
  } catch (err) {
    checks.push({ ok: false, label: "ตรวจสอบไม่สำเร็จ", detail: err.message });
    return { checks, sql: [], sample: null };
  } finally {
    client.release();
  }
}
