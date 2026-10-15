import { requireAdmin } from "@/server/auth";
import { jsonOk, handleApiError } from "@/lib/http";
import { inventoryError } from "@/lib/usdcodashop-inventory";
import { usdInventoryRepository } from "@/server/usdcodashop-inventory";

async function readBody(request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") throw inventoryError("ไม่อนุญาตคำขอข้ามเว็บไซต์", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw inventoryError("ต้องส่งข้อมูล JSON");
  const reader = request.body?.getReader();
  if (!reader) throw inventoryError("ไม่พบข้อมูล");
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); throw inventoryError("ข้อมูลใหญ่เกินกำหนด", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw inventoryError("ข้อมูล JSON ไม่ถูกต้อง"); }
}
export async function GET(request) {
  try {
    const actor = await requireAdmin(request);
    const response = jsonOk(await usdInventoryRepository().list(actor));
    response.headers.set("Cache-Control", "no-store"); return response;
  } catch (error) { return handleApiError(error, "โหลด Inventory ไม่สำเร็จ"); }
}
export async function POST(request) {
  try {
    const actor = await requireAdmin(request);
    return jsonOk({ entry: await usdInventoryRepository().save(await readBody(request), actor) }, 201);
  } catch (error) { return handleApiError(error, "เพิ่มรายการไม่สำเร็จ"); }
}
export async function PATCH(request) {
  try {
    const actor = await requireAdmin(request); const body = await readBody(request);
    if (!body || !body.id) throw inventoryError("ระบุรหัสรายการ");
    return jsonOk({ entry: await usdInventoryRepository().save(body, actor, String(body.id)) });
  } catch (error) { return handleApiError(error, "แก้ไขรายการไม่สำเร็จ"); }
}
