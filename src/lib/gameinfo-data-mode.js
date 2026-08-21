export const GAMEINFO_DATA_MODES = ["uid", "idpass"];

export function normalizeGameinfoDataMode(value) {
  return String(value || "").trim().toLowerCase() === "idpass" ? "idpass" : "uid";
}

export function gameinfoModeQuery(mode) {
  return normalizeGameinfoDataMode(mode) === "idpass" ? "?mode=idpass" : "";
}

export function gameinfoListHref(lang, mode, manage = false) {
  return `/gameinfo/${lang}${manage ? "/manage" : ""}${gameinfoModeQuery(mode)}`;
}

export function gameinfoGameHref(lang, gameId, mode, manage = false) {
  return `/gameinfo/${lang}/${gameId}${manage ? "/manage" : ""}${gameinfoModeQuery(mode)}`;
}

export function gameinfoPacksHref(lang, gameId, mode) {
  return `/gameinfo/${lang}/${gameId}/packs${gameinfoModeQuery(mode)}`;
}
