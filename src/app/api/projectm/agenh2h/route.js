import { readInventoryPage } from "@/server/inventory-page";
import { requireAdmin } from "@/server/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { agenh2hInventory } from "@/server/agenh2h-inventory";
import { ahCsv } from "@/lib/agenh2h-inventory";
export async function GET(request) {
  try {
    const actor = await requireAdmin(request), params = new URL(request.url).searchParams;
    const exportAll = params.get("format") === "csv";
    const result = !exportAll && params.has("pageSize")
      ? await readInventoryPage(request, actor, "agenh2h", () => agenh2hInventory().list(actor, { ...Object.fromEntries(params), page: "1" }, { exportAll: true }))
      : await agenh2hInventory().list(actor, Object.fromEntries(params), { exportAll });
    if (exportAll) return new Response(ahCsv(result.entries), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="agenh2h-${result.dateFrom}-${result.dateTo}.csv"`,
    } });
    const response = jsonOk(result); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (error) {
    if (error.status && error.status < 500) return jsonError(error.message, error.status);
    console.error("[agenh2h-inventory]", error.code || "INTERNAL_ERROR");
    return jsonError("โหลด AgenH2H ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อฐานข้อมูลแล้วลองใหม่", 503);
  }
}
