// Which pack columns a role sees.
//
// Columns are shared by every game, so a role that only ever works with a few
// of them would otherwise face all of them in every game. Rules are stored per
// column and apply to every game, because that is how they are almost always
// meant; a rule naming one game overrides the global rule for that game alone.
//
// This hides columns on screen. It is not a data boundary: the pack API still
// returns every column, so treat it as arranging the screen rather than
// keeping a secret. Enforcing it server-side would go here too, and the shape
// below is what that would read.
import { GAMEINFO_PACK_PINNED_COLUMN_ID } from "@/lib/gameinfo-pack-columns";

export const GAMEINFO_COLUMN_ROLES = Object.freeze(["admin", "topup"]);
export const GAMEINFO_COLUMN_ROLE_ALL_GAMES = 0;

/**
 * Rules -> the column keys this role must not see in this game.
 *
 * A rule for the game beats the every-game rule, and only rules that hide
 * something are stored, so a column nobody has ruled on stays visible.
 */
export function hiddenGameinfoColumnKeys(rules, role, gameId) {
  const global = new Map();
  const perGame = new Map();
  for (const rule of rules || []) {
    if (rule.role !== role) continue;
    const ruleGameId = Number(rule.gameId);
    const visible = rule.visible !== false;
    if (ruleGameId === Number(gameId)) perGame.set(rule.columnKey, visible);
    else if (ruleGameId === GAMEINFO_COLUMN_ROLE_ALL_GAMES) global.set(rule.columnKey, visible);
    // Any other game's rule is none of this game's business.
  }
  const hidden = new Set();
  for (const [columnKey, visible] of global) if (!visible) hidden.add(columnKey);
  for (const [columnKey, visible] of perGame) {
    if (visible) hidden.delete(columnKey);
    else hidden.add(columnKey);
  }
  return hidden;
}

/** Drop the columns this role must not see, keeping the pinned one. */
export function filterGameinfoColumnsForRole(columns, hiddenKeys) {
  if (!hiddenKeys?.size) return columns || [];
  return (columns || []).filter((column) => {
    if (column.id === GAMEINFO_PACK_PINNED_COLUMN_ID) return true;
    // Only user-made columns can be hidden by role; the built-in ones are the
    // pack itself — a table without a price is not a table.
    if (column.kind !== "computed") return true;
    return !hiddenKeys.has(column.computed?.key);
  });
}
