// One-off: pack columns used to be defined per game, in the `columns` array of
// each game's __computed__ sentinel row in gamelist_packs. The definition now
// lives once in gamelist_pack_column_registry and every game sees every column
// (see src/lib/gameinfo-column-registry.js). This reads every game's columns,
// merges the ones that are the same column into one registry row, and leaves
// each game only what is genuinely its own under `columnOverrides`.
//
// Columns are matched by label, not key: the same column created by hand in
// two games has two different `col_<timestamp>` keys but one name, and the
// point of the registry is that those become one column. The first key seen
// wins so formulas that reference a column by label keep resolving.
//
// No game's numbers change. Where games disagreed about a formula, the most
// common one becomes the shared formula and every game that used a different
// one keeps its own as a per-game formula.
//
// Also covers idpass mode, whose packs and columns live in a separate store
// (gameinfo_mode_data.data.packs), not in gamelist_packs.
//
// Safe to re-run: it rebuilds the registry from what is on disk each time.
//
// Usage:  node scripts/backfill-pack-column-registry.mjs [--dry-run]
import { readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
// Imported by relative path, not the "@/" alias: this runs as a plain script
// with no bundler. gameinfo-column-registry.js has no imports of its own,
// which is what makes that possible — keep it that way.
import { pickSharedGameinfoFormula } from "../src/lib/gameinfo-column-registry.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const COMPUTED_SENTINEL = "__computed__";
const DRY_RUN = process.argv.includes("--dry-run");

function loadEnv() {
  let text;
  try {
    text = readFileSync(path.join(REPO_ROOT, ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

function decryptSecret(payload) {
  const source =
    process.env.GAMEDB_ENC_KEY || process.env.SESSION_SECRET || process.env.OTP_SECRET;
  const key = crypto.createHash("sha256").update(source || "gamedb-dev-secret").digest();
  const [iv, tag, data] = String(payload || "").split(".");
  if (!iv || !tag || !data) throw new Error("รูปแบบรหัสผ่านที่เข้ารหัสไม่ถูกต้อง");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function connectGameinfo() {
  const mainPool = new pg.Pool({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const { rows } = await mainPool.query(
    `SELECT host, port, database, username, password_enc, ssl
     FROM gamedb_connections WHERE LOWER(name) = 'gameinfo' LIMIT 1`
  );
  await mainPool.end();
  const conn = rows[0];
  if (!conn) {
    console.error('ไม่พบ connection ชื่อ "gameinfo"');
    process.exit(1);
  }
  return new pg.Pool({
    host: conn.host,
    port: conn.port,
    user: conn.username,
    password: conn.password_enc ? decryptSecret(conn.password_enc) : undefined,
    database: conn.database,
    ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
  });
}

// The registry key is the column's identity across games. Market columns
// already share a stable key (market_<market>); everything else is matched by
// label, which is also what formulas reference.
function identityOf(column) {
  return column.kind === "market" ? `market:${column.marketKey}` : `label:${column.label}`;
}

/** Every game's columns -> one registry row per distinct column. */
function buildRegistry(gameColumns) {
  const groups = new Map();
  for (const { columns } of gameColumns) {
    for (const column of columns) {
      const identity = identityOf(column);
      if (!groups.has(identity)) groups.set(identity, { first: column, all: [] });
      groups.get(identity).all.push(column);
    }
  }
  const registry = [];
  let sortOrder = 0;
  for (const { first, all } of groups.values()) {
    const sharedFormula = pickSharedGameinfoFormula(all.map((column) => column.formula));
    registry.push({
      columnKey: first.key,
      label: first.label,
      sortOrder: sortOrder++,
      data: {
        formula: sharedFormula,
        entryMode: first.entryMode,
        kind: first.kind,
        marketKey: first.marketKey,
        type: first.type,
        symbol: first.symbol,
        scopeMode: first.scopeMode,
      },
    });
  }
  return registry;
}

/** One game's columns -> what that game keeps once the definition is shared. */
function buildOverrides(columns, registryByIdentity) {
  const overrides = {};
  for (const column of columns) {
    const row = registryByIdentity.get(identityOf(column));
    if (!row) continue;
    const override = {};
    const formula = typeof column.formula === "string" ? column.formula : "";
    // Only a game that computed this column differently keeps its own formula.
    if (formula.trim() && formula !== row.data.formula) override.gameFormula = formula;
    if (Object.keys(column.categoryFormulas || {}).length) {
      override.categoryFormulas = column.categoryFormulas;
    }
    if (Object.keys(column.rowOverrides || {}).length) {
      override.rowOverrides = column.rowOverrides;
    }
    // A market column defaults to off in every game, so a game that had it
    // switched on has to say so explicitly or it would lose the column.
    if (column.kind === "market" && column.enabled !== false) override.enabled = true;
    if (Object.keys(override).length) overrides[row.columnKey] = override;
  }
  return overrides;
}

async function main() {
  loadEnv();
  const pool = await connectGameinfo();
  const client = await pool.connect();
  try {
    // --- read both stores ------------------------------------------------
    const uid = await client.query(
      `SELECT game_id, data FROM gamelist_packs WHERE pack_id = $1 ORDER BY game_id`,
      [COMPUTED_SENTINEL]
    );
    const uidGames = uid.rows.map((row) => ({
      gameId: row.game_id,
      data: row.data || {},
      columns: Array.isArray(row.data?.columns) ? row.data.columns : [],
    }));

    let idpassGames = [];
    const hasModeData = await client.query(`SELECT to_regclass('gameinfo_mode_data') AS t`);
    if (hasModeData.rows[0]?.t) {
      const idpass = await client.query(
        `SELECT game_id, data_mode, data FROM gameinfo_mode_data ORDER BY game_id, data_mode`
      );
      idpassGames = idpass.rows
        .map((row) => ({
          gameId: row.game_id,
          dataMode: row.data_mode,
          data: row.data || {},
          columns: Array.isArray(row.data?.packs?.computedColumns)
            ? row.data.packs.computedColumns
            : [],
        }))
        .filter((entry) => entry.columns.length);
    }

    const all = [...uidGames, ...idpassGames].filter((entry) => entry.columns.length);
    if (!all.length) {
      console.log("ไม่พบคอลัมน์สูตรในเกมใดเลย — ไม่มีอะไรต้อง backfill");
      return;
    }

    const registry = buildRegistry(all);
    const registryByIdentity = new Map();
    for (const row of registry) {
      registryByIdentity.set(
        row.data.kind === "market" ? `market:${row.data.marketKey}` : `label:${row.label}`,
        row
      );
    }

    console.log(
      `พบคอลัมน์ ${all.reduce((sum, e) => sum + e.columns.length, 0)} ตัว จาก ${all.length} เกม/โหมด` +
        ` → รวมเหลือ ${registry.length} คอลัมน์กลาง`
    );
    for (const row of registry) {
      console.log(`  • ${row.label} (${row.columnKey}) สูตรกลาง: ${row.data.formula || "(ว่าง)"}`);
    }

    const plan = all.map((entry) => ({
      ...entry,
      overrides: buildOverrides(entry.columns, registryByIdentity),
    }));
    for (const entry of plan) {
      const keys = Object.keys(entry.overrides);
      if (!keys.length) continue;
      const where = entry.dataMode ? `เกม ${entry.gameId} (${entry.dataMode})` : `เกม ${entry.gameId}`;
      console.log(`  ${where}: เก็บค่าเฉพาะเกมไว้ ${keys.length} คอลัมน์ — ${keys.join(", ")}`);
    }

    if (DRY_RUN) {
      console.log("\n--dry-run: ไม่ได้เขียนอะไรลงฐานข้อมูล");
      return;
    }

    // --- write -------------------------------------------------------------
    await client.query("BEGIN");
    for (const row of registry) {
      await client.query(
        `INSERT INTO gamelist_pack_column_registry (column_key, label, sort_order, data)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (column_key) DO UPDATE
           SET label = EXCLUDED.label,
               sort_order = EXCLUDED.sort_order,
               data = EXCLUDED.data,
               updated_at = NOW()`,
        [row.columnKey, row.label, row.sortOrder, JSON.stringify(row.data)]
      );
    }
    for (const entry of plan) {
      // `columns` is deliberately left untouched: it is the rollback copy, and
      // it already holds each game's own formulas.
      if (entry.dataMode) {
        await client.query(
          `UPDATE gameinfo_mode_data
           SET data = jsonb_set(data, '{packs,columnOverrides}', $3::jsonb, true)
           WHERE game_id = $1 AND data_mode = $2`,
          [entry.gameId, entry.dataMode, JSON.stringify(entry.overrides)]
        );
      } else {
        await client.query(
          `UPDATE gamelist_packs
           SET data = jsonb_set(
                 jsonb_set(data, '{columnOverrides}', $2::jsonb, true),
                 '{schemaVersion}', '3'::jsonb, true
               ),
               updated_at = NOW()
           WHERE game_id = $1 AND pack_id = $3`,
          [entry.gameId, JSON.stringify(entry.overrides), COMPUTED_SENTINEL]
        );
      }
    }
    await client.query("COMMIT");
    console.log(`\nเขียนคอลัมน์กลาง ${registry.length} ตัว และค่าเฉพาะเกม ${plan.length} รายการแล้ว`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
