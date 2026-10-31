// The order pack columns start in, set by an admin: one list for every game
// (game_id 0, as with the column role rules) and optionally one per game. A
// list holds column ids; a column it does not name follows the ones it does.
import { GAMEINFO_COLUMN_ROLE_ALL_GAMES } from "@/lib/gameinfo-column-roles";
import { getGameinfoPool } from "@/server/gameinfo-gamelist-packs";

const MAX_COLUMNS = 200;

/** { [gameId]: [columnId] } — read whole; there is one row per ordered game. */
export async function listGameinfoColumnOrders() {
  const pool = await getGameinfoPool();
  const result = await pool.query(`SELECT game_id, column_ids FROM gamelist_pack_column_order`);
  return Object.fromEntries(result.rows.map((row) => [Number(row.game_id), row.column_ids]));
}

/** An empty list clears that order: the game goes back to the shared one, the shared one to the default. */
export async function saveGameinfoColumnOrder({ gameId = GAMEINFO_COLUMN_ROLE_ALL_GAMES, columnIds = [] }) {
  const pool = await getGameinfoPool();
  const ids = [...new Set(columnIds.map((id) => String(id).slice(0, 80)))].slice(0, MAX_COLUMNS);
  if (ids.length) {
    await pool.query(
      `INSERT INTO gamelist_pack_column_order (game_id, column_ids, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (game_id) DO UPDATE SET column_ids = EXCLUDED.column_ids, updated_at = NOW()`,
      [gameId, JSON.stringify(ids)]
    );
  } else {
    await pool.query(`DELETE FROM gamelist_pack_column_order WHERE game_id = $1`, [gameId]);
  }
  return listGameinfoColumnOrders();
}
