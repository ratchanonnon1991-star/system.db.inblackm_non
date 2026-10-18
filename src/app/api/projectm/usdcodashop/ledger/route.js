import { requireAdmin } from "@/server/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { codaLedgerRepository } from "@/server/usdcodashop-ledger";
import { inventoryError } from "@/lib/usdcodashop-inventory";
import { codaReportCsv } from "@/lib/usdcodashop-report";

async function bodyOf(request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") throw inventoryError("ไม่อนุญาตคำขอข้ามเว็บไซต์", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw inventoryError("ต้องส่งข้อมูล JSON");
  const reader = request.body?.getReader();
  if (!reader) throw inventoryError("ไม่พบข้อมูล");
  let size = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw inventoryError("ข้อมูลใหญ่เกินกำหนด", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw inventoryError("JSON ไม่ถูกต้อง"); }
}
function failure(e) {
  // Do not return database errors/connection strings to the browser.
  if (e.status && e.status < 500) return jsonError(e.message, e.status);
  console.error("[coda-ledger]", e.code || "INTERNAL_ERROR");
  return jsonError("เชื่อมต่อประวัติไม่สำเร็จ กรุณาตรวจ PROFIT_DATABASE_URL และฐานข้อมูลของระบบ", 503);
}
export async function GET(request) {
  try {
    const actor = await requireAdmin(request); const url = new URL(request.url);
    const exportAll = url.searchParams.get("format") === "csv";
    const dateFrom = url.searchParams.get("dateFrom"); const dateTo = url.searchParams.get("dateTo");
    const result = await codaLedgerRepository().list(actor, { search: url.searchParams.get("search"), page: url.searchParams.get("page"), dateFrom, dateTo, exportAll, kind: url.searchParams.get("kind"),
      profitStatus: url.searchParams.get("profitStatus"), profitUnit: url.searchParams.get("profitUnit"),
      profitMin: url.searchParams.get("profitMin"), profitMax: url.searchParams.get("profitMax") });
    if (exportAll) {
      if (!result.configured) throw inventoryError("กรุณาตั้งค่าบัญชีก่อน Export", 409);
      return new Response(codaReportCsv(result.entries), { headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="usdcodashop-${dateFrom || "all"}-${dateTo || "all"}.csv"`,
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      } });
    }
    const response = jsonOk(result); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (e) { return failure(e); }
}
export async function POST(request) {
  try {
    const actor = await requireAdmin(request); const body = await bodyOf(request); const repo = codaLedgerRepository();
    if (body?.action === "setup") return jsonOk(await repo.setup(body, actor));
    if (body?.action === "sync") return jsonOk(await repo.sync(actor));
    if (body?.action === "deposit") return jsonOk(await repo.deposit(body, actor));
    throw inventoryError("คำสั่งไม่ถูกต้อง");
  } catch (e) { return failure(e); }
}
