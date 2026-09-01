export function gameinfoStableColorStyle(value) {
  const normalized = String(value || "").trim().toLocaleLowerCase("th");
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return { "--gameinfo-tag-hue": String((hash >>> 0) % 360) };
}

export function gameinfoDistinctColorStyleMap(values) {
  const uniqueValues = [...new Set((values || []).map((value) => String(value || "")).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  return new Map(uniqueValues.map((value, index) => [
    value,
    { "--gameinfo-tag-hue": String((31 + (index * 137.508)) % 360) },
  ]));
}
