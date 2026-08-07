// Stub for @/server/connections-repository — hands gameinfo-games.js a fixed
// fake "gameinfo" connection so its SQL can be exercised against the @/lib/db
// stub's recording client without a real gamedb_connections table.
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

export async function listConnections() {
  return [FAKE_CONNECTION];
}

export async function findConnectionById(id) {
  return id === FAKE_CONNECTION.id ? FAKE_CONNECTION : null;
}

export async function findConnectionWithSecret(id) {
  return id === FAKE_CONNECTION.id ? FAKE_CONNECTION : null;
}
