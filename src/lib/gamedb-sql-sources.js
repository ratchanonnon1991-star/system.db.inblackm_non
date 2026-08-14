// Working out, from the query text alone, which real table each result column
// came from -- so "ตั้งค่าการแก้ไขข้อมูล" can propose the answer instead of
// asking an admin to supply it.
//
// Setting up an editable table used to mean knowing three things by heart:
// which table to write back to, which result column identifies a row, and what
// that column is really called in the table. For `SELECT a.x, b.y FROM a JOIN
// b` none of those is obvious, and picking the wrong one silently writes to
// the wrong table. But the SQL already says all of it: the FROM/JOIN list
// names the tables, the SELECT list says which table each column came from,
// and the schema knows each table's primary key.
//
// Everything here is a *proposal*. Nothing is applied without the admin
// confirming, and anything ambiguous (a bare column name when two joined
// tables both have one by that name, an expression with no single source
// column) is reported as unknown rather than guessed at -- being confidently
// wrong about where a write lands is far worse than asking.
import { stripSqlLiterals } from "@/lib/gamedb-sql-params";

const NAME_CHAR = /[\p{L}\p{M}\p{N}_$]/u;

// Words that can follow a table reference but are never an alias for it.
const NOT_AN_ALIAS = new Set([
  "on", "using", "where", "group", "order", "limit", "having", "window",
  "offset", "fetch", "union", "intersect", "except", "join", "inner", "left",
  "right", "full", "cross", "outer", "natural", "lateral", "for", "returning",
]);

function skipSpace(src, i) {
  let j = i;
  while (j < src.length && /\s/.test(src[j])) j += 1;
  return j;
}

/**
 * One identifier, quoted or bare. Returns null when there isn't one.
 *
 * `quoted` matters: Postgres folds an unquoted identifier to lower case, so
 * `SELECT O.Id` comes back in a column called `id`, while `AS "Id"` comes
 * back as `Id`. The editable config is matched against those result names,
 * so getting this wrong produces settings that silently never match.
 */
function readNamePart(src, i) {
  if (src[i] === '"') {
    const end = src.indexOf('"', i + 1);
    if (end === -1) return null;
    return { value: src.slice(i + 1, end), next: end + 1, quoted: true };
  }
  let j = i;
  while (j < src.length && NAME_CHAR.test(src[j])) j += 1;
  if (j === i) return null;
  return { value: src.slice(i, j), next: j, quoted: false };
}

/** The name a result column comes back under, applying Postgres's folding. */
function resultName(part) {
  if (!part) return "";
  return part.quoted ? part.value : part.value.toLowerCase();
}

/** `name`, `schema.name`, or `alias.*` -- `allowStar` covers the SELECT list. */
function readQualifiedName(src, i, allowStar = false) {
  const first = readNamePart(src, i);
  if (!first) return null;
  if (src[first.next] === ".") {
    if (allowStar && src[first.next + 1] === "*") {
      return { qualifier: first.value, name: "*", next: first.next + 2, part: null };
    }
    const second = readNamePart(src, first.next + 1);
    if (second) {
      return {
        qualifier: first.value,
        name: second.value,
        next: second.next,
        part: second,
      };
    }
  }
  return { qualifier: "", name: first.value, next: first.next, part: first };
}

// A keyword match that isn't just the start of a longer identifier.
function wordAt(lower, i, len) {
  const before = lower[i - 1];
  const after = lower[i + len];
  return (!before || /[\s(,]/.test(before)) && (!after || /[\s("]/.test(after));
}

/**
 * Every table named in a FROM or JOIN at the top level, with its alias.
 *
 * Reads keywords from the literal-masked copy (so a `'from'` inside a string
 * is not mistaken for the clause) but names from the original text, since
 * masking blanks out the contents of quoted identifiers. Subqueries and
 * anything at paren depth > 0 are skipped -- a derived table has no primary
 * key to write back through.
 */
export function parseFromTables(sql) {
  const src = String(sql || "");
  const masked = stripSqlLiterals(src);
  const lower = masked.toLowerCase();
  const found = [];
  let depth = 0;

  for (let i = 0; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      continue;
    }
    if (depth !== 0) continue;

    let keywordLength = 0;
    if (lower.startsWith("from", i) && wordAt(lower, i, 4)) keywordLength = 4;
    else if (lower.startsWith("join", i) && wordAt(lower, i, 4)) keywordLength = 4;
    if (!keywordLength) continue;

    let j = skipSpace(src, i + keywordLength);
    // `FROM (SELECT ...) AS x` -- a derived table, nothing to write back to.
    // Resume ON the paren rather than past it: written without a space,
    // `FROM(SELECT ...)`, skipping it would leave the subquery's contents
    // being read at depth 0 and its closing paren pushing the depth
    // negative, losing every table joined after it.
    if (src[j] === "(") {
      i = j - 1;
      continue;
    }
    const qualified = readQualifiedName(src, j);
    if (!qualified) {
      i = j - 1;
      continue;
    }

    let alias = "";
    let after = skipSpace(src, qualified.next);
    if (lower.startsWith("as", after) && wordAt(lower, after, 2)) {
      const aliasPart = readNamePart(src, skipSpace(src, after + 2));
      if (aliasPart) alias = aliasPart.value;
    } else {
      const aliasPart = readNamePart(src, after);
      if (aliasPart && !NOT_AN_ALIAS.has(aliasPart.value.toLowerCase())) {
        alias = aliasPart.value;
      }
    }

    found.push({
      schema: qualified.qualifier,
      name: qualified.name,
      alias: alias || qualified.name,
    });
    i = qualified.next - 1;
  }

  return found;
}

/**
 * The outer SELECT list, split into items, with the source of each.
 *
 * `{ result, qualifier, column }` -- `result` is the name the row comes back
 * under, `qualifier`/`column` where it came from. An item that is an
 * expression, a function call or a CASE has no single source column, so it
 * comes back with an empty `column` rather than a guess.
 */
export function parseSelectSources(sql) {
  const src = String(sql || "");
  const masked = stripSqlLiterals(src);
  const lower = masked.toLowerCase();

  // The outer SELECT, not a CTE's -- same depth-from-the-start scan
  // parseSelectAliases uses, for the same reason.
  let depth = 0;
  let selectAt = -1;
  for (let i = 0; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (depth === 0 && lower.startsWith("select", i) && wordAt(lower, i, 6)) {
      selectAt = i;
      break;
    }
  }
  if (selectAt === -1) return [];

  let fromAt = -1;
  for (let i = selectAt + 6; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (depth === 0 && lower.startsWith("from", i) && wordAt(lower, i, 4)) {
      fromAt = i;
      break;
    }
  }
  if (fromAt === -1) return [];

  const listMasked = masked.slice(selectAt + 6, fromAt);
  const listSrc = src.slice(selectAt + 6, fromAt);

  const items = [];
  let start = 0;
  let itemDepth = 0;
  for (let i = 0; i < listMasked.length; i += 1) {
    const ch = listMasked[i];
    if (ch === "(") itemDepth += 1;
    else if (ch === ")") itemDepth -= 1;
    else if (ch === "," && itemDepth === 0) {
      items.push(listSrc.slice(start, i));
      start = i + 1;
    }
  }
  items.push(listSrc.slice(start));

  return items.map((raw) => parseSelectItem(raw)).filter(Boolean);
}

function parseSelectItem(raw) {
  const item = raw.trim();
  if (!item) return null;

  if (item === "*") return { result: "*", qualifier: "", column: "*" };

  // Take a trailing `AS alias` off first, whatever the item turns out to be.
  // Found at paren depth 0, so the AS in `CAST(x AS int)` or a function call
  // is not mistaken for the result alias.
  const lower = item.toLowerCase();
  let alias = "";
  let head = item;
  let depth = 0;
  for (let i = 0; i < item.length; i += 1) {
    const ch = item[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (depth === 0 && lower.startsWith("as", i) && wordAt(lower, i, 2)) {
      const aliasPart = readNamePart(item, skipSpace(item, i + 2));
      if (aliasPart && skipSpace(item, aliasPart.next) >= item.length) {
        alias = resultName(aliasPart);
        head = item.slice(0, i).trim();
        break;
      }
    }
  }

  const qualified = readQualifiedName(head, 0, true);
  if (!qualified) return null;

  // A plain column reference is one that accounts for the whole head.
  if (skipSpace(head, qualified.next) >= head.length) {
    return {
      result: alias || (qualified.part ? resultName(qualified.part) : qualified.name),
      qualifier: qualified.qualifier,
      column: qualified.name,
    };
  }

  // `a.col alias` -- an alias with the AS left out.
  if (!alias) {
    const aliasPart = readNamePart(head, skipSpace(head, qualified.next));
    if (aliasPart && skipSpace(head, aliasPart.next) >= head.length) {
      return {
        result: resultName(aliasPart),
        qualifier: qualified.qualifier,
        column: qualified.name,
      };
    }
  }

  // An expression: `price * 2`, `count(*)`, a CASE, a cast. It still has a
  // result name when it was aliased, but no single column behind it.
  return { result: alias, qualifier: "", column: "" };
}

/**
 * The column as the table really spells it, given the name as written in the
 * SQL. Postgres folds an unquoted identifier to lower case, so `O.Amount`
 * really does mean the column `amount` -- storing what was typed instead
 * would produce a column map pointing at something that does not exist, and
 * the write would only fail later, at the point someone edits a cell.
 *
 * Falls back to a case-insensitive match only when exactly one column
 * answers to it; a table holding both "Amount" and "amount" is left alone
 * rather than resolved by coin flip.
 */
function findColumn(table, name) {
  const exact = table.columns.find((column) => column.name === name);
  if (exact) return exact.name;
  const lower = String(name || "").toLowerCase();
  const matches = table.columns.filter((column) => column.name.toLowerCase() === lower);
  return matches.length === 1 ? matches[0].name : "";
}

function findTable(tables, schema, name) {
  const lowerName = String(name || "").toLowerCase();
  if (schema) {
    return (
      tables.find(
        (table) =>
          table.schema.toLowerCase() === String(schema).toLowerCase() &&
          table.name.toLowerCase() === lowerName
      ) || null
    );
  }
  // An unqualified name is only usable if exactly one table answers to it --
  // two schemas holding an "orders" each must not silently resolve to one.
  const matches = tables.filter((table) => table.name.toLowerCase() === lowerName);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Which tables this query's rows could be written back to, and how.
 *
 * One entry per real table the SELECT list draws from, each carrying the
 * result columns that came from it, that table's primary key, and which
 * result column exposes that key (empty when the query does not select it --
 * without it there is no way to identify the row to update, which the UI
 * reports rather than working around).
 *
 * Ordered by how much of the result each table accounts for, so the table the
 * query is mostly about is offered first.
 */
export function detectEditableTargets({ sql, tables }) {
  const schemaTables = Array.isArray(tables) ? tables : [];
  if (schemaTables.length === 0) return [];

  const froms = parseFromTables(sql);
  if (froms.length === 0) return [];

  // alias (and bare table name) -> the real table it stands for
  const byAlias = new Map();
  const resolved = [];
  for (const from of froms) {
    const table = findTable(schemaTables, from.schema, from.name);
    if (!table) continue;
    resolved.push({ from, table });
    byAlias.set(from.alias.toLowerCase(), table);
    if (!byAlias.has(from.name.toLowerCase())) {
      byAlias.set(from.name.toLowerCase(), table);
    }
  }
  if (resolved.length === 0) return [];

  const items = parseSelectSources(sql);
  const columnsByTableKey = new Map();
  const addColumn = (table, result, column) => {
    if (!table || !result || !column) return;
    const existing = columnsByTableKey.get(table.key) || [];
    if (existing.some((entry) => entry.result === result)) return;
    existing.push({ result, column });
    columnsByTableKey.set(table.key, existing);
  };

  for (const item of items) {
    // `*` / `a.*` -- expand from the schema, since that is exactly what
    // Postgres will return and it is a very common way to write these.
    if (item.column === "*") {
      const targets = item.qualifier
        ? [byAlias.get(item.qualifier.toLowerCase())].filter(Boolean)
        : resolved.map((entry) => entry.table);
      for (const table of targets) {
        for (const column of table.columns) addColumn(table, column.name, column.name);
      }
      continue;
    }
    if (!item.column) continue;

    if (item.qualifier) {
      const table = byAlias.get(item.qualifier.toLowerCase());
      if (table) addColumn(table, item.result, findColumn(table, item.column));
      continue;
    }
    // Unqualified: only safe when exactly one joined table has a column by
    // that name. `SELECT id FROM a JOIN b` where both have an `id` is
    // genuinely ambiguous -- Postgres itself would reject it.
    const owners = resolved.filter((entry) => findColumn(entry.table, item.column));
    if (owners.length === 1) {
      addColumn(owners[0].table, item.result, findColumn(owners[0].table, item.column));
    }
  }

  return resolved
    .map(({ from, table }) => {
      const columns = columnsByTableKey.get(table.key) || [];
      const primaryKey = table.primaryKey?.length === 1 ? table.primaryKey[0] : "";
      const pkEntry = primaryKey
        ? columns.find((entry) => entry.column === primaryKey)
        : null;
      return {
        key: table.key,
        schema: table.schema,
        table: table.name,
        alias: from.alias,
        primaryKey,
        pkResultColumn: pkEntry?.result || "",
        compositeKey: (table.primaryKey?.length || 0) > 1,
        columns,
      };
    })
    .filter((target) => target.columns.length > 0)
    .sort((a, b) => b.columns.length - a.columns.length);
}
