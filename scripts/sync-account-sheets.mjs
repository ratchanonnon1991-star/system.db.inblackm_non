// The account sheets, straight from the Drive folder "ข้อมูลบัญชี 2026" (shared with the
// service account in ITUNE_SHEETS_CREDENTIALS, Viewer is enough) → Stock, every step:
//   node scripts/sync-account-sheets.mjs              dry run: fetch and show what would come in
//   node scripts/sync-account-sheets.mjs --apply      fetch and import (each step replaces only
//                                                     its own rows; what people entered stays)
//   --from "<folder>"   use workbooks already on disk (the "ข้อมูลบัญชี M-YYYY" folders) instead of Drive
//   --run <id>          log into that account_sheet_sync_runs row (the page's ซิงค์ button starts it so)
// Apply: removes the old 2.1 STOCK_ import first (it would count twice), then
// import-account-sheets → import-sheet-inventory → link-stock-games (sure matches only).
// The workbooks are kept on disk only while the run lasts.
import "./register-app-alias.mjs";
import env from "@next/env";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("../", import.meta.url));
env.loadEnvConfig(appDir);
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const valueOf = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
const from = valueOf("--from");

const { getPool } = await import("../src/lib/db.js");
const { accountSheetsDriveFolder, ensureSyncSchema } = await import("../src/server/account-sheet-sync.js");
const drive = await import("../src/lib/account-sheet-drive.js");
const pool = getPool();
await ensureSyncSchema();

const runId = Number(valueOf("--run")) || (await pool.query(
  "INSERT INTO account_sheet_sync_runs (mode, actor_name) VALUES ($1, 'สคริปต์บนเซิร์ฟเวอร์') RETURNING id", [apply ? "apply" : "preview"]
)).rows[0].id;

// The log is the page's only view of the run: kept in the row, written every few seconds.
const lines = [];
let flushed = 0;
const flush = async () => {
  if (flushed === lines.length) return;
  flushed = lines.length;
  await pool.query("UPDATE account_sheet_sync_runs SET log = $2 WHERE id = $1", [runId, lines.slice(-600).join("\n")]);
};
const log = (line) => { lines.push(String(line)); console.log(line); };
const timer = setInterval(() => flush().catch(() => {}), 3000);

function runStep(title, script, args = []) {
  log(`\n── ${title}`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(appDir, "scripts", script), ...args], { cwd: appDir, env: process.env });
    let buffered = "";
    const take = (chunk) => {
      buffered += chunk.toString("utf8");
      const parts = buffered.split(/\r?\n/);
      buffered = parts.pop();
      for (const part of parts) log(part);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", reject);
    child.on("close", (code) => {
      if (buffered) log(buffered);
      if (code === 0) resolve();
      else reject(new Error(`${script} หยุดด้วย code ${code}`));
    });
  });
}

async function fetchFromDrive(target) {
  const { createGoogleReader } = await import("../src/server/google-sheets.js");
  const reader = createGoogleReader({ readOnly: true, exportAccess: true });
  const root = accountSheetsDriveFolder();
  log(`── โหลดจาก Drive (โฟลเดอร์ ${root})`);
  const months = drive.monthFolders(await reader.listFolder(root));
  if (!months.length) throw new Error("ไม่พบโฟลเดอร์ ข้อมูลบัญชี M-YYYY ใน Drive: แชร์โฟลเดอร์ให้ service account แล้วหรือยัง");
  let count = 0;
  for (const month of months) {
    const { fetch, skipped } = drive.filesToFetch(await reader.listFolder(month.id));
    const dir = path.join(target, drive.safeFileName(month.name));
    await mkdir(dir, { recursive: true });
    for (const file of fetch) {
      const bytes = file.how === "export" ? await reader.exportXlsx(file.id) : await reader.downloadFile(file.id);
      await writeFile(path.join(dir, file.fileName), bytes);
      count += 1;
    }
    log(`${month.period}: ${fetch.length} ไฟล์${skipped.length ? ` · ข้าม ${skipped.length} (ไม่ใช่ชีต)` : ""}`);
    await flush();
  }
  log(`โหลดแล้ว ${count} ไฟล์ จาก ${months.length} เดือน`);
}

const staging = from ? null : path.join(appDir, "data", "account-sheet-sync", `run-${runId}`);
let status = "failed";
try {
  log(`ซิงค์ชีตบัญชี · ${apply ? "นำเข้าจริง" : "ลองดู (ยังไม่เขียน)"}`);
  const folder = from ? path.resolve(from) : staging;
  if (staging) {
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    await fetchFromDrive(staging);
  }
  if (apply) {
    await runStep("ลบยอดคลังเก่าจากชีต 2.1 STOCK_ (ถ้ายังมี)", "stock-go-live-check.mjs", ["--clear-old-2-1"]);
    await runStep("ชีตบัญชี → ข้อมูลบัญชี, กระเป๋าเงิน, ค่าใช้จ่าย, คลังตามชีต", "import-account-sheets.mjs", [folder, "--apply"]);
    await runStep("ไอดี แพ็ค และใบสั่งซื้อจากชีต → คลัง, ใบสั่งซื้อ", "import-sheet-inventory.mjs", ["--apply"]);
    await runStep("ผูกไอดีกับเกมใน GameInfo (เฉพาะที่แน่ใจ)", "link-stock-games.mjs", ["--apply"]);
  } else {
    await runStep("สิ่งที่มีอยู่ตอนนี้", "stock-go-live-check.mjs");
    await runStep("ชีตบัญชีที่จะเข้ามา", "import-account-sheets.mjs", [folder]);
  }
  status = "done";
  log(`\n${apply ? "นำเข้าเสร็จ" : "ลองดูเสร็จ ถ้าถูกต้องกด ซิงค์และนำเข้า"}`);
} catch (error) {
  log(`\nไม่สำเร็จ: ${error instanceof Error ? error.message : error}`);
  // What each Google refusal usually means here, so the page says what to do.
  const hint = /credentials are not configured/.test(error?.message) ? "เซิร์ฟเวอร์ยังไม่ได้ตั้ง ITUNE_SHEETS_CREDENTIALS"
    : error?.status === 404 ? "ไม่พบโฟลเดอร์: แชร์โฟลเดอร์ ข้อมูลบัญชี 2026 ให้ email ของ service account ก่อน (ผู้มีสิทธิ์อ่านพอ)"
    : error?.status === 403 ? "Google ไม่ให้อ่าน: เปิด Google Drive API ใน project ของ service account และเช็คว่าแชร์โฟลเดอร์แล้ว"
    : /token request failed/.test(error?.message) ? "ไฟล์ key ของ service account ใช้ไม่ได้ (หมดอายุหรือถูกลบใน Google Cloud)" : "";
  if (hint) log(hint);
  process.exitCode = 1;
} finally {
  clearInterval(timer);
  if (staging) await rm(staging, { recursive: true, force: true }).catch(() => {});
  await flush().catch(() => {});
  await pool.query("UPDATE account_sheet_sync_runs SET status = $2, finished_at = NOW() WHERE id = $1", [runId, status]).catch(() => {});
  await pool.end().catch(() => {});
}
