import { requireAdmin } from "@/server/auth";
import { canViewUsdInventory, canManageUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";
import { jsonOk, jsonError } from "@/lib/http";
import { inventoryAlerts } from "@/server/inventory-alerts";

async function handle(request, write) {
  try {
    const actor = await requireAdmin(request);
    if (!(write ? canManageUsdInventory(actor) : canViewUsdInventory(actor))) throw inventoryError("ไม่มีสิทธิ์จัดการแจ้งเตือน Inventory", 403);
    if (write) {
      if (request.headers.get("sec-fetch-site") === "cross-site") throw inventoryError("ไม่อนุญาตคำขอข้ามเว็บไซต์", 403);
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw inventoryError("ต้องส่งข้อมูล JSON");
      const reader = request.body?.getReader();
      if (!reader) throw inventoryError("ไม่พบข้อมูล");
      const chunks = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4096) { await reader.cancel(); throw inventoryError("ข้อมูลใหญ่เกินกำหนด", 413); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw inventoryError("รูปแบบข้อมูลไม่ถูกต้อง"); }
      await inventoryAlerts().save(body, actor);
      return jsonOk({ ok: true });
    }
    const response = jsonOk({ ...await inventoryAlerts().list(), canManage: canManageUsdInventory(actor) });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error.status && error.status < 500) return jsonError(error.message, error.status);
    console.error("[inventory-alerts]", error.code || "INTERNAL_ERROR");
    return jsonError("โหลดหรือบันทึกแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่", 503);
  }
}
export const GET = request => handle(request, false);
export const PUT = request => handle(request, true);
