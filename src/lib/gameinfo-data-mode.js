export const GAMEINFO_DATA_MODES = ["uid", "idpass"];

export function normalizeGameinfoDataMode(value) {
  return String(value || "").trim().toLowerCase() === "idpass" ? "idpass" : "uid";
}

export function gameinfoModeQuery(mode) {
  return normalizeGameinfoDataMode(mode) === "idpass" ? "?mode=idpass" : "";
}
