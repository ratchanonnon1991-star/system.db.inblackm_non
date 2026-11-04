import { readInventoryPage } from "@/server/inventory-page";
import { requireAdmin } from "@/server/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { gamepointInventory } from "@/server/gamepoint-inventory";
import { gpCsv } from "@/lib/gamepoint-inventory";
export async function GET(request) {
  try {
    const actor = await requireAdmin(request), params = new URL(request.url).searchParams;
    const exportAll = params.get("format") === "csv";
    const result = !exportAll && params.has("pageSize")
      ? await readInventoryPage(request, actor, "gamepoint", () => gamepointInventory().list(actor, { ...Object.fromEntries(params), page: "1" }, { exportAll: true }))
      : await gamepointInventory().list(actor, Object.fromEntries(params), { exportAll });
    if (exportAll) return new Response(gpCsv(result.entries), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="gamepoint-${result.dateFrom}-${result.dateTo}.csv"`,
    } });
    const response = jsonOk(result); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (error) {
    if (error.status && error.status < 500) return jsonError(error.message, error.status);
    console.error("[gamepoint-inventory]", error.code || "INTERNAL_ERROR");
    return jsonError("โหลด Gamepoint ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อฐานข้อมูลแล้วลองใหม่", 503);
  }
}
