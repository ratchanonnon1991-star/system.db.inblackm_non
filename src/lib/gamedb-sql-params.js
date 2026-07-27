// Named parameters for saved queries: `WHERE created_at >= :from` becomes a
// real bound $1 before it reaches Postgres, so values never touch the SQL text.
//
// The scanner walks the statement instead of running a regex over it, because
// a bare regex would also rewrite `::int` casts and anything that merely looks
// like a placeholder inside a string literal, a quoted identifier (Thai column
// aliases are full of those) or a comment.

const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_]/;

function scan(sql, onParam) {
  const src = String(sql || "");
  let out = "";
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === "-" && next === "-") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop);
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
      out += src.slice(i, j);
      i = j;
      continue;
    }
    if (ch === "$" && next === "$") {
      const end = src.indexOf("$$", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop);
      i = stop;
      continue;
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

/** Placeholder names in the order they first appear. */
export function extractSqlParams(sql) {
  const names = [];
  scan(sql, (name) => {
    if (!names.includes(name)) names.push(name);
    return "";
  });
  return names;
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
