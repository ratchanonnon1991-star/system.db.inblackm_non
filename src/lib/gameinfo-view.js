// GameInfo has two views of the same data, open to everyone whatever their
// role: Topup (what the top-up team works from; columns hidden for it on
// the column settings page stay hidden) and Product (every column). Which
// one is chosen is remembered in a cookie; a ?view= in the URL wins over it
// so older links keep working. Editing is a separate matter: gameinfo.admin.
export const GAMEINFO_VIEWS = ["topup", "product"];
export const GAMEINFO_VIEW_COOKIE = "gameinfo-view";

export function normalizeGameinfoView(value) {
  const view = String(value || "").trim().toLowerCase();
  return GAMEINFO_VIEWS.includes(view) ? view : null;
}

/** The view to show: the URL's, else the remembered one, else Product for admins and Topup for everyone else. */
export function resolveGameinfoView({ param, cookie, isAdmin }) {
  return normalizeGameinfoView(param) || normalizeGameinfoView(cookie) || (isAdmin ? "product" : "topup");
}

/** Which column-visibility rule set a view uses (the rules are still stored under these keys). */
export function gameinfoViewColumnRole(view) {
  return view === "topup" ? "topup" : "admin";
}
