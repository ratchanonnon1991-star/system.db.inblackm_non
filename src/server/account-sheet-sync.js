import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPool } from "@/lib/db";
import { ACCOUNT_SHEETS_DRIVE_FOLDER, driveFolderId, SYNC_MODES } from "@/lib/account-sheet-drive";

// The account sheets are pulled from Drive by scripts/sync-account-sheets.mjs, in its own
// process (parsing ten months of workbooks takes ~0.5 GB): this module starts it and keeps
// one row per run so the page can show how it went, even after a restart.
const RUN_STALE_MINUTES = 30;
let schemaReady = null;

export function ensureSyncSchema() {
  schemaReady ||= getPool().query(`
    CREATE TABLE IF NOT EXISTS account_sheet_sync_runs (
      id           SERIAL PRIMARY KEY,
      mode         VARCHAR(16) NOT NULL CHECK (mode IN ('preview', 'apply')),
      status       VARCHAR(16) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
      actor_id     INTEGER,
      actor_name   VARCHAR(255) NOT NULL DEFAULT '',
      log          TEXT NOT NULL DEFAULT '',
      started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at  TIMESTAMPTZ
    )`).catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}

export function accountSheetsDriveFolder() {
  return driveFolderId(process.env.ACCOUNT_SHEETS_DRIVE_FOLDER) || ACCOUNT_SHEETS_DRIVE_FOLDER;
}

/** The e-mail the Drive folder must be shared with, or null when no key is set up. */
export async function syncServiceAccount() {
  const keyFile = process.env.ITUNE_SHEETS_CREDENTIALS;
  if (!keyFile) return null;
  try {
    return JSON.parse(await readFile(keyFile, "utf8")).client_email || null;
  } catch {
    return null;
  }
}

const mapRun = (row) => row && ({
  id: row.id, mode: row.mode, status: row.status, actorName: row.actor_name, log: row.log,
  startedAt: row.started_at?.toISOString?.() ?? row.started_at, finishedAt: row.finished_at?.toISOString?.() ?? row.finished_at ?? null,
});

export async function listSyncRuns(limit = 5) {
  await ensureSyncSchema();
  // A run whose process died (a restart mid-way) would stay "running" for ever: call it failed.
  await getPool().query(`UPDATE account_sheet_sync_runs SET status = 'failed', finished_at = NOW(),
      log = log || E'\\nหยุดไปกลางทาง (เซิร์ฟเวอร์รีสตาร์ตหรือ process ถูกปิด) ซิงค์ใหม่ได้เลย'
    WHERE status = 'running' AND started_at < NOW() - make_interval(mins => $1)`, [RUN_STALE_MINUTES]);
  const result = await getPool().query("SELECT * FROM account_sheet_sync_runs ORDER BY id DESC LIMIT $1", [limit]);
  return result.rows.map(mapRun);
}

export async function getSyncRun(id) {
  await ensureSyncSchema();
  return mapRun((await getPool().query("SELECT * FROM account_sheet_sync_runs WHERE id = $1", [Number(id)])).rows[0]) || null;
}

/** Starts a run in the background; refuses while another is going. */
export async function startSync({ mode, actor }, { spawnImpl = spawn } = {}) {
  if (!SYNC_MODES.includes(mode)) throw Object.assign(new Error("โหมดซิงค์ไม่ถูกต้อง"), { status: 400 });
  await listSyncRuns(1); // expires a stale "running" row first
  const client = await getPool().connect();
  let run;
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE account_sheet_sync_runs IN EXCLUSIVE MODE");
    const busy = (await client.query("SELECT id FROM account_sheet_sync_runs WHERE status = 'running' LIMIT 1")).rows[0];
    if (busy) throw Object.assign(new Error("มีการซิงค์ที่ยังไม่เสร็จอยู่ รอให้เสร็จก่อน"), { status: 409 });
    run = (await client.query(
      "INSERT INTO account_sheet_sync_runs (mode, actor_id, actor_name) VALUES ($1, $2, $3) RETURNING *",
      [mode, actor?.id ?? null, String(actor?.name || "").slice(0, 255)]
    )).rows[0];
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  const script = path.join(process.cwd(), "scripts", "sync-account-sheets.mjs");
  const args = [script, "--run", String(run.id), ...(mode === "apply" ? ["--apply"] : [])];
  const child = spawnImpl(process.execPath, args, { cwd: process.cwd(), detached: true, stdio: "ignore", env: process.env });
  child.on?.("error", (error) => {
    getPool().query("UPDATE account_sheet_sync_runs SET status = 'failed', finished_at = NOW(), log = $2 WHERE id = $1 AND status = 'running'",
      [run.id, `เริ่มสคริปต์ซิงค์ไม่ได้: ${error.message}`]).catch(() => {});
  });
  child.unref?.();
  return mapRun(run);
}
