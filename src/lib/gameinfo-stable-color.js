export function gameinfoStableColorStyle(value) {
  const normalized = String(value || "").trim().toLocaleLowerCase("th");
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return { "--gameinfo-tag-hue": String((hash >>> 0) % 360) };
}
