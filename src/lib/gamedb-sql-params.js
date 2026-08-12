// Named parameters for saved queries: `WHERE created_at >= :from` becomes a
// real bound $1 before it reaches Postgres, so values never touch the SQL text.
//
// The scanner walks the statement instead of running a regex over it, because
// a bare regex would also rewrite `::int` casts and anything that merely looks
// like a placeholder inside a string literal, a quoted identifier (Thai column
// aliases are full of those) or a comment.

// Letters from any script, for the same reason quoteIdentifier takes them: the
// people writing these queries name things in Thai, and :ชื่อเกม is the name
// they will reach for. A placeholder never reaches Postgres — it is replaced by
// $n first — so nothing here depends on what Postgres accepts as an identifier.
const NAME_START = /[\p{L}\p{M}_]/u;
const NAME_CHAR = /[\p{L}\p{M}\p{N}_]/u;

// A dollar-quoted body may carry a tag: $$...$$ but also $body$...$body$.
// A digit cannot start a tag, which is what keeps $1 a placeholder.
const DOLLAR_TAG = /^\$\$|^\$[\p{L}_][\p{L}\p{N}_]*\$/u;

function scan(sql, onParam, maskLiterals = false) {
  const src = String(sql || "");
  let out = "";
  let i = 0;

  // Literals and comments are either copied through or blanked out, keeping the
  // length so positions still line up with the original statement.
  const emit = (chunk) => {
    out += maskLiterals ? " ".repeat(chunk.length) : chunk;
  };

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === "-" && next === "-") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      emit(src.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      emit(src.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === quote) {
          if (src[j + 1] === quote) {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      emit(src.slice(i, j));
      i = j;
      continue;
    }
    if (ch === "$") {
      const tag = DOLLAR_TAG.exec(src.slice(i))?.[0];
      if (tag) {
        const end = src.indexOf(tag, i + tag.length);
        const stop = end === -1 ? src.length : end + tag.length;
        emit(src.slice(i, stop));
        i = stop;
        continue;
      }
    }
    if (ch === ":" && next === ":") {
      out += "::";
      i += 2;
      continue;
    }
    if (ch === ":" && next && NAME_START.test(next)) {
      let j = i + 1;
      while (j < src.length && NAME_CHAR.test(src[j])) j += 1;
      const name = src.slice(i + 1, j);
      out += onParam(name);
      i = j;
      continue;
    }
    out += ch;
    i += 1;
  }

  return out;
}

/**
 * The statement with the contents of strings, quoted identifiers and comments
 * blanked out, same length as the original.
 *
 * Checks that look for keywords or statement separators have to run over this
 * rather than the raw text: `WHERE status = 'update'` is an ordinary read, and
 * a `;` inside a LIKE pattern is not a second statement.
 */
export function stripSqlLiterals(sql) {
  return scan(sql, (name) => `:${name}`, true);
}

/** Placeholder names in the order they first appear. */
export function extractSqlParams(sql) {
  const names = [];
  scan(sql, (name) => {
    if (!names.includes(name)) names.push(name);
    return "";
  });
  return names;
}

// Matches one `SELECT` list item that is a plain column reference aliased
// with AS -- `is_repeatable AS "ซ้ำ/ไม่ซ้ำ"` or `g.name AS "Name"`. Anything
// else (a JOIN expression, CASE, a function call, no alias at all) does not
// match and is left alone -- there is no real column to point back to.
const ALIAS_ITEM =
  /^([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?\s+AS\s+"([^"]+)"$/i;

/**
 * The query text itself already says which real column an aliased result
 * column came from -- `is_repeatable AS "ซ้ำ/ไม่ซ้ำ"` means exactly that, no
 * guessing against a live schema needed. Returns { alias: realColumnName }
 * for every SELECT-list item shaped that way; anything computed or joined in
 * is simply absent from the map rather than guessed at.
 */
export function parseSelectAliases(sql) {
  const src = String(sql || "");
  const masked = stripSqlLiterals(src);
  const lower = masked.toLowerCase();
  const selectAt = lower.indexOf("select");
  if (selectAt === -1) return {};

  // The first top-level FROM after SELECT -- depth tracked over the masked
  // text so a FROM inside a subquery's parens does not end the list early.
  let depth = 0;
  let fromAt = -1;
  for (let i = selectAt + 6; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (depth === 0 && lower.startsWith("from", i)) {
      const before = lower[i - 1];
      const after = lower[i + 4];
      if ((!before || /\s/.test(before)) && (!after || /\s/.test(after))) {
        fromAt = i;
        break;
      }
    }
  }
  if (fromAt === -1) return {};

  const listMasked = masked.slice(selectAt + 6, fromAt);
  const listSrc = src.slice(selectAt + 6, fromAt);

  // Split on top-level commas -- same depth tracking, since a function call
  // in the list (e.g. rpad(repeat(...), 3, '')) has commas of its own.
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

  const map = {};
  for (const item of items) {
    const match = ALIAS_ITEM.exec(item.trim());
    if (match) map[match[3]] = match[2] || match[1];
  }
  return map;
}

/**
 * Rewrites `:name` to positional placeholders.
 * Returns { text, values, missing } — missing lists names with no value, which
 * the caller reports rather than silently binding to null.
 */
export function bindSqlParams(sql, params = {}) {
  const values = [];
  const positions = new Map();
  const missing = [];

  const text = scan(sql, (name) => {
    if (!positions.has(name)) {
      const value = params?.[name];
      if (value === undefined || value === null || value === "") {
        if (!missing.includes(name)) missing.push(name);
      }
      values.push(value === undefined || value === "" ? null : value);
      positions.set(name, values.length);
    }
    return `$${positions.get(name)}`;
  });

  return { text, values, missing };
}
