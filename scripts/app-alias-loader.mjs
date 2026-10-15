import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const root = path.resolve(fileURLToPath(new URL("../src/", import.meta.url)));
export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
  const name = specifier.slice(2);
  const target = path.resolve(root, name.endsWith(".js") ? name : `${name}.js`);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid application alias");
  return nextResolve(pathToFileURL(target).href, context);
}
