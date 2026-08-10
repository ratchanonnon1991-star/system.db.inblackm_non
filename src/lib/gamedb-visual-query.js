import { quoteIdentifier } from "@/lib/gamedb-identifier";

export function buildVisualSelect({ schema, table, columns }) {
  const selected = [...new Set((columns || []).map(String))];
  if (!schema || !table || selected.length === 0) return "";

  return `SELECT\n  ${selected.map((column) => quoteIdentifier(column)).join(",\n  ")}\nFROM ${quoteIdentifier(`${schema}.${table}`)}`;
}

export function buildVisualLayout({ baseLayout, schema, table, primaryKey, editableColumns }) {
  const columns = [...new Set((editableColumns || []).map(String))];
  const editable =
    schema && table && primaryKey && columns.length > 0
      ? {
          table: `${schema}.${table}`,
          pk: primaryKey,
          pkColumn: primaryKey,
          columns,
          columnMap: {},
          allowInsert: false,
          allowDelete: false,
          inputs: [],
        }
      : null;

  return { ...(baseLayout || {}), editable };
}
