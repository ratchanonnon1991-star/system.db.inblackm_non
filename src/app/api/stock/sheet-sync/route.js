import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { accountSheetsDriveFolder, getSyncRun, listSyncRuns, startSync, syncServiceAccount } from "@/server/account-sheet-sync";

export const dynamic = "force-dynamic";

// The account sheets pulled from Drive (scripts/sync-account-sheets.mjs), for Stock admins.
// GET: the folder, the e-mail to share it with and the last runs; ?run=<id> one run with its log.
// POST { mode: "preview" | "apply" }: starts a run in the background (202).
export async function GET(request) {
  try {
    await requireStockEditor(request);
    const runId = Number(new URL(request.url).searchParams.get("run"));
    if (runId) {
      const run = await getSyncRun(runId);
      return run ? jsonOk({ run }) : jsonError("ไม่พบรอบซิงค์นี้", 404);
    }
    const [runs, serviceAccount] = await Promise.all([listSyncRuns(5), syncServiceAccount()]);
    return jsonOk({ folderId: accountSheetsDriveFolder(), serviceAccount, runs: runs.map(({ log, ...run }) => run) });
  } catch (error) {
    return handleApiError(error, "อ่านสถานะซิงค์ไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    const user = await requireStockEditor(request);
    if (request.headers.get("sec-fetch-site") === "cross-site") return jsonError("ไม่อนุญาตคำขอข้ามเว็บไซต์", 403);
    const body = await request.json().catch(() => ({}));
    if (!(await syncServiceAccount())) return jsonError("เซิร์ฟเวอร์ยังไม่ได้ตั้ง ITUNE_SHEETS_CREDENTIALS (ไฟล์ key ของ service account) จึงอ่าน Drive ไม่ได้", 400);
    const run = await startSync({ mode: body?.mode, actor: { id: user.id, name: user.displayName || user.username } });
    return jsonOk({ run }, 202);
  } catch (error) {
    return handleApiError(error, "เริ่มซิงค์ไม่สำเร็จ");
  }
}
