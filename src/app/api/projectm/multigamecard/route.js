import { requireAdmin } from "@/server/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { multigamecardInventory } from "@/server/multigamecard-inventory";
import { inventoryError, canManageUsdInventory } from "@/lib/usdcodashop-inventory";
import { mgcCsv } from "@/lib/multigamecard-inventory";

function failure(e) {
  if (e.status && e.status < 500) return jsonError(e.message, e.status);
  console.error("[mgc-inventory]", e.code || "INTERNAL_ERROR");
  return jsonError("โหลดหรือบันทึก Multigamecard ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อฐานข้อมูลแล้วโหลดประวัติก่อนบันทึกซ้ำ", 503);
}
export async function GET(request) {
  try {
    const actor = await requireAdmin(request), p = new URL(request.url).searchParams;
    const exportAll = p.get("format") === "csv";
    const result = await multigamecardInventory().list(actor, Object.fromEntries(p), { exportAll });
    if (exportAll) return new Response(mgcCsv(result.entries), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="multigamecard-${result.mode}-${result.dateFrom}-${result.dateTo}.csv"`,
    } });
    const response = jsonOk(result); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (e) { return failure(e); }
}
export async function POST(request) {
  try {
    const actor = await requireAdmin(request);
    if (!canManageUsdInventory(actor)) throw inventoryError("เฉพาะ Projectm Admin จึงบันทึกข้อมูลหรือเปลี่ยนเรทได้", 403);
    if (request.headers.get("sec-fetch-site") === "cross-site") throw inventoryError("ไม่อนุญาตคำขอข้ามเว็บไซต์", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw inventoryError("ต้องส่ง JSON");
    const reader = request.body?.getReader(); if (!reader) throw inventoryError("ไม่พบข้อมูล");
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 8192) { await reader.cancel(); throw inventoryError("ข้อมูลใหญ่เกินกำหนด", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw inventoryError("JSON ไม่ถูกต้อง"); }
    return jsonOk(await multigamecardInventory().save(body, actor), 201);
  } catch (e) { return failure(e); }
}
