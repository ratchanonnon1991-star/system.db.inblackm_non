import pg from "pg";

const { Pool } = pg;

let pool;

/** PostgreSQL กลางตัวเดียวกับ inblackm storefront (อ่าน users + เก็บ gamedb_queries) */
export function getPool() {
  if (!pool) {
    const host = process.env.PG_HOST;
    const database = process.env.PG_DATABASE;
    const user = process.env.PG_USER;
    if (!host || !database || !user) {
      throw new Error("Database is not configured (PG_HOST, PG_DATABASE, PG_USER).");
    }
    pool = new Pool({
      host,
      port: Number(process.env.PG_PORT || 5432),
      user,
      password: process.env.PG_PASSWORD,
      database,
      ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
  }
  return pool;
}
