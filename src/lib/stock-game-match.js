// Which GameInfo game a stock account is for, guessed from what the sheets and
// the account already say: its game name (the 1.1 purchase lists' GAME), the
// game the sheets file its code under, or the letters of the code itself.
// Pure: the linking script and the tests share it. A guess is only "sure" when
// exactly one game matches by name; anything else is left for a person to pick.
import { SHEET_GAMES } from "@/lib/sheet-inventory";

/** Codes whose game the sheets do not name: the letters → words in the game's name. */
export const STOCK_CODE_GAME_HINTS = {
  delta: ["delta force"],
  fc: ["fc mobile", "fc"],
  pes: ["efootball"],
  pokemon: ["pokemon tcg", "pokemon"],
};

export const flatGameName = (value) => String(value ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "");
const codeLetters = (code) => String(code || "").toLowerCase().replace(/[^a-z]+/g, "");

/** The names to look for, best first. */
export function stockGameHints(account) {
  const hints = [];
  if (account.gameName) hints.push(account.gameName);
  const sheet = SHEET_GAMES.find((entry) => entry.code === String(account.code || "").toLowerCase());
  if (sheet) hints.push(sheet.game);
  hints.push(...(STOCK_CODE_GAME_HINTS[codeLetters(account.code)] || []));
  return [...new Set(hints.map((hint) => hint.trim()).filter(Boolean))];
}

/**
 * account { code, gameName }, games [{ id, name }] →
 *   { game, sure: true }                 one game's name equals a hint
 *   { game: null, candidates: [...] }    none or several: a person picks
 */
export function matchStockGame(account, games) {
  const named = games.map((game) => ({ game, key: flatGameName(game.name) })).filter((entry) => entry.key);
  for (const hint of stockGameHints(account).map(flatGameName).filter(Boolean)) {
    const exact = named.filter((entry) => entry.key === hint);
    if (exact.length === 1) return { game: exact[0].game, sure: true, hint };
    const close = named.filter((entry) => entry.key.includes(hint) || hint.includes(entry.key));
    if (close.length) return { game: null, sure: false, hint, candidates: close.map((entry) => entry.game) };
  }
  const letters = codeLetters(account.code);
  const byCode = letters.length >= 2 ? named.filter((entry) => entry.key.startsWith(letters)) : [];
  return { game: null, sure: false, hint: letters, candidates: byCode.map((entry) => entry.game) };
}
