// Storage for "which pack columns does this role see".
//
// Rules live next to the column registry in the gameinfo database and are read
// on every pack page, so reads are one small query with no joins. Only rules
// that hide something are kept: a column nobody has ruled on is visible, which
// means a newly registered column never disappears for anyone by accident.
import {
  GAMEINFO_COLUMN_ROLES,
  GAMEINFO_COLUMN_ROLE_ALL_GAMES,
} from "@/lib/gameinfo-column-roles";
import { getGameinfoPool } from "@/server/gameinfo-gamelist-packs";

function mapRule(row) {
  return {
    role: row.role,
    gameId: Number(row.game_id),
    columnKey: row.column_key,
    visible: row.visible !== false,
  };
}

/** Every rule. Small enough to read whole — one row per hidden column. */
export async function listGameinfoColumnRoleRules(transactionClient = null) {
  const client = transactionClient || (await getGameinfoPool());
  const result = await client.query(
    `SELECT role, game_id, column_key, visible
     FROM gamelist_pack_column_roles
     ORDER BY role, game_id, column_key`
  );
  return result.rows.map(mapRule);
}

/**
 * Replace the rules for one (role, game) pair.
 *
 * `hiddenColumnKeys` is the whole answer for that pair, not a delta, so the
 * admin screen can send what it shows and never has to work out which rules to
 * delete. Rows that would say "visible" are simply not written, except in a
 * game that needs to overrule a hide that applies to every game.
 */
export async function saveGameinfoColumnRoleRules({
  role,
  gameId = GAMEINFO_COLUMN_ROLE_ALL_GAMES,
  hiddenColumnKeys = [],
  shownColumnKeys = [],
  transactionClient = null,
}) {
  if (!GAMEINFO_COLUMN_ROLES.includes(role)) {
    const error = new Error("role ไม่ถูกต้อง");
    error.status = 400;
    throw error;
  }
  const client = transactionClient || (await getGameinfoPool());
  const scope = Number(gameId) || GAMEINFO_COLUMN_ROLE_ALL_GAMES;
  await client.query(
    `DELETE FROM gamelist_pack_column_roles WHERE role = $1 AND game_id = $2`,
    [role, scope]
  );
  const rows = [
    ...hiddenColumnKeys.map((columnKey) => ({ columnKey, visible: false })),
    // Only meaningful for a real game: it is how one game opts back into a
    // column that is hidden everywhere else.
    ...(scope === GAMEINFO_COLUMN_ROLE_ALL_GAMES
      ? []
      : shownColumnKeys.map((columnKey) => ({ columnKey, visible: true }))),
  ];
  for (const row of rows) {
    await client.query(
      `INSERT INTO gamelist_pack_column_roles (role, game_id, column_key, visible)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (role, game_id, column_key) DO UPDATE
         SET visible = EXCLUDED.visible, updated_at = NOW()`,
      [role, scope, String(row.columnKey).slice(0, 64), row.visible]
    );
  }
  return listGameinfoColumnRoleRules(transactionClient);
}
