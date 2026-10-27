export const GAMEINFO_DATA_MODES = ["uid", "idpass"];

export function normalizeGameinfoDataMode(value) {
  return String(value || "").trim().toLowerCase() === "idpass" ? "idpass" : "uid";
}

export function gameinfoModeQuery(mode) {
  return normalizeGameinfoDataMode(mode) === "idpass" ? "?mode=idpass" : "";
}

// The Topup / Product view is not part of these links: it is remembered in a
// cookie (gameinfo-view.js), and a ?view= carried along pinned it, so going
// back to a page could bring the other view back.
export function gameinfoListHref(lang, mode, manage = false) {
  const params = new URLSearchParams();
  if (normalizeGameinfoDataMode(mode) === "idpass") params.set("mode", "idpass");
  const query = params.toString();
  return `/gameinfo/${lang}${manage ? "/manage" : ""}${query ? `?${query}` : ""}`;
}

export function gameinfoGameHref(lang, gameId, mode, manage = false) {
  const params = new URLSearchParams();
  if (normalizeGameinfoDataMode(mode) === "idpass") params.set("mode", "idpass");
  const query = params.toString();
  return `/gameinfo/${lang}/${gameId}${manage ? "/manage" : ""}${query ? `?${query}` : ""}`;
}

export function gameinfoPacksHref(lang, gameId, mode) {
  return `/gameinfo/${lang}/${gameId}/packs${gameinfoModeQuery(mode)}`;
}
