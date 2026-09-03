// Which game each CSV row belongs to, when the file does not say.
//
// The importer used to require a game_id on every row and skip the rest. A
// file exported from a spreadsheet rarely has one, so rows may now identify
// their game by name: a name that matches an existing game fills that game in,
// and one that matches nothing proposes a new game for the user to confirm.
// Nothing is created without that confirmation — a typo'd name is otherwise
// indistinguishable from a new game, and creating one is not undoable.
import { gameNameKey, suggestSimilarNames } from "@/lib/text-distance";

const norm = (value) => (typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim());

function rowHasData(row) {
  return Object.values(row || {}).some((value) => norm(value) !== "");
}

/**
 * rows + the games that exist -> which rows go where.
 *
 * Returns `existing` (rows landing in a game that already exists), `created`
 * (names to create, each with the rows waiting on it), `errors` (rows that
 * cannot be placed at all) and `warnings` (names close enough to an existing
 * game to be worth a second look before creating them).
 */
export function resolveGameinfoCsvGames(rows, existingGames = []) {
  const byId = new Map((existingGames || []).map((game) => [Number(game.id), game]));
  const byName = new Map(
    (existingGames || []).map((game) => [gameNameKey(game.game), game])
  );
  const existingNames = (existingGames || []).map((game) => game.game);

  const existing = new Map();
  const created = new Map();
  const errors = [];
  const warnings = [];

  (rows || []).forEach((row, index) => {
    if (!rowHasData(row)) return;
    // Spreadsheet line number: the header is row 1, so data row 0 is row 2.
    const line = index + 2;
    const idRaw = norm(row.game_id);
    const name = norm(row.game_name);

    if (idRaw) {
      const gameId = parseInt(idRaw, 10);
      if (Number.isNaN(gameId) || gameId <= 0) {
        errors.push(`แถวที่ ${line}: game_id "${idRaw}" ไม่ถูกต้อง`);
        return;
      }
      if (!byId.has(gameId)) {
        errors.push(`แถวที่ ${line}: ไม่พบเกม game_id ${gameId}`);
        return;
      }
      const bucket = existing.get(gameId) || { gameId, gameName: byId.get(gameId).game, rows: [] };
      bucket.rows.push(row);
      existing.set(gameId, bucket);
      return;
    }

    if (!name) {
      errors.push(`แถวที่ ${line}: ไม่มีทั้ง game_id และ game_name จึงไม่รู้ว่าเป็นเกมไหน`);
      return;
    }

    // An exact name match is the game itself, not a second game with the same
    // name — that is how a file of nothing but new columns attaches to games
    // it never had ids for. Creating a duplicate name is what is refused.
    const match = byName.get(gameNameKey(name));
    if (match) {
      const bucket = existing.get(Number(match.id)) || {
        gameId: Number(match.id),
        gameName: match.game,
        matchedByName: true,
        rows: [],
      };
      bucket.rows.push(row);
      existing.set(Number(match.id), bucket);
      return;
    }

    const key = gameNameKey(name);
    const bucket = created.get(key) || { gameName: name, rows: [], similar: [] };
    bucket.rows.push(row);
    created.set(key, bucket);
  });

  for (const bucket of created.values()) {
    bucket.similar = suggestSimilarNames(bucket.gameName, existingNames, 3);
    if (bucket.similar.length) {
      warnings.push(
        `เกมใหม่ "${bucket.gameName}" ชื่อคล้ายกับ ${bucket.similar
          .map((name) => `"${name}"`)
          .join(", ")} — เกมเดียวกันหรือเปล่า?`
      );
    }
  }

  return {
    existing: [...existing.values()],
    created: [...created.values()],
    errors,
    warnings,
  };
}

/** Names the user ticked, so apply creates exactly what the preview offered. */
export function confirmedGameinfoCsvGames(created, confirmedNames) {
  const wanted = new Set((confirmedNames || []).map(gameNameKey));
  const confirmed = [];
  const skipped = [];
  for (const bucket of created || []) {
    if (wanted.has(gameNameKey(bucket.gameName))) confirmed.push(bucket);
    else skipped.push(bucket);
  }
  return { confirmed, skipped };
}
