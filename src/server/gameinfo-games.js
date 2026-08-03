import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";

async function getGameinfoConnection() {
  const connections = await listConnections();
  const match = connections.find(
    (c) => c.name.trim().toLowerCase() === CONNECTION_NAME
  );
  if (!match) return null;
  return findConnectionWithSecret(match.id);
}

function mapRow(row) {
  return {
    id: row.id,
    order: row.order,
    gameName: row.game_name,
    region: row.region,
    vpn: row.vpn,
    webTopup: row.web_topup,
    platform: row.platform,
    server: row.server,
    image: row.image,
    currencies: row.currencies || [],
    computedColumn: row.computed_column || null,
  };
}

/** Reads a single game (with its nested pack/currency JSON) from the shared
 * gameinfo Postgres connection, or null if that connection isn't configured
 * yet or the game doesn't exist. */
export async function getGameinfoGame(id) {
  const connection = await getGameinfoConnection();
  if (!connection) return null;

  const pool = getPoolForConnection(connection);
  const result = await pool.query(`SELECT * FROM games WHERE id = $1`, [id]);
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}
