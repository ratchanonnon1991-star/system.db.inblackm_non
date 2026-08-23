// Stub for @/server/connections-repository — hands any gameinfo server
// module (e.g. gameinfo-gamelist-packs.js) a fixed fake "gameinfo" connection
// so its SQL can be exercised against the @/lib/db stub's recording client
// without a real gamedb_connections table.
const FAKE_CONNECTION = {
  id: 1,
  name: "gameinfo",
  host: "localhost",
  port: 5432,
  database: "gameinfo",
  username: "test",
  password: "",
  ssl: false,
  updatedAt: "v1",
};

const FAKE_TOPUP_CONNECTION = {
  ...FAKE_CONNECTION,
  id: 2,
  name: "topup_inblackm",
  database: "topup_inblackm",
};

const FAKE_CONNECTIONS = [FAKE_CONNECTION, FAKE_TOPUP_CONNECTION];

export async function listConnections() {
  return FAKE_CONNECTIONS;
}

export async function findConnectionById(id) {
  return FAKE_CONNECTIONS.find((connection) => connection.id === id) || null;
}

export async function findConnectionWithSecret(id) {
  return FAKE_CONNECTIONS.find((connection) => connection.id === id) || null;
}
