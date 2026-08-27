export function packCompareStorageKey(name, provider, game) {
  return `gameinfo:${provider}-${name}:${game || "zepeto"}`;
}

export function togglePackCompareColumn(columns, column) {
  return columns.includes(column) ? columns.filter((item) => item !== column) : [...columns, column];
}
