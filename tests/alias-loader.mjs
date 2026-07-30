// Resolves the "@/..." specifiers the app uses so the suites can import the
// real modules rather than a copy that quietly falls behind them.
//
// Two of those modules reach the outside world, and the suites are meant to run
// with nothing but Node: the connection pool is replaced by a recorder that
// keeps every statement and its bound values, and the table that decides whether
// a connection may be written to is replaced by a switch a test can flip.
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STUBS = {
  "@/lib/db": "tests/stubs/db.js",
  "@/server/gamedb-side-tables": "tests/stubs/gamedb-side-tables.js",
};

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const bare = specifier.replace(/\.js$/, "");
    const target = STUBS[bare] || `src/${specifier.slice(2)}`;
    const file = path.join(root, target.endsWith(".js") ? target : `${target}.js`);
    return next(pathToFileURL(file).href, context);
  }
  return next(specifier, context);
}
