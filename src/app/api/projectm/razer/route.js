import { requireAdmin } from "@/server/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { razerInventory } from "@/server/razer-inventory";
import { razerCsv } from "@/lib/razer-inventory";
export async function GET(request) {
  try {
    const actor = await requireAdmin(request), params = new URL(request.url).searchParams;
    const exportAll = params.get("format") === "csv";
    const result = await razerInventory().list(actor, Object.fromEntries(params), { exportAll });
    if (exportAll) return new Response(razerCsv(result.entries), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="razer-${result.dateFrom}-${result.dateTo}.csv"`,
    } });
    const response = jsonOk(result); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (error) {
    if (error.status && error.status < 500) return jsonError(error.message, error.status);
    console.error("[razer-inventory]", error.code || "INTERNAL_ERROR");
    return jsonError("โหลด Razer Inventory ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อฐานข้อมูลแล้วลองใหม่", 503);
  }
}
