export const GAMEINFO_DATA_MODES = ["uid", "idpass"];

export function normalizeGameinfoDataMode(value) {
  return String(value || "").trim().toLowerCase() === "idpass" ? "idpass" : "uid";
}

export function gameinfoModeQuery(mode) {
  return normalizeGameinfoDataMode(mode) === "idpass" ? "?mode=idpass" : "";
}

export function gameinfoListHref(lang, mode, manage = false, topupView = false) {
  const params = new URLSearchParams();
  if (normalizeGameinfoDataMode(mode) === "idpass") params.set("mode", "idpass");
  if (topupView && !manage) params.set("view", "topup");
  const query = params.toString();
  return `/gameinfo/${lang}${manage ? "/manage" : ""}${query ? `?${query}` : ""}`;
}

export function gameinfoGameHref(lang, gameId, mode, manage = false, topupView = false) {
  const params = new URLSearchParams();
  if (normalizeGameinfoDataMode(mode) === "idpass") params.set("mode", "idpass");
  if (topupView && !manage) params.set("view", "topup");
  const query = params.toString();
  return `/gameinfo/${lang}/${gameId}${manage ? "/manage" : ""}${query ? `?${query}` : ""}`;
}

export function gameinfoPacksHref(lang, gameId, mode) {
  return `/gameinfo/${lang}/${gameId}/packs${gameinfoModeQuery(mode)}`;
}
