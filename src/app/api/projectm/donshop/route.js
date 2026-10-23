import { requireAdmin } from "@/server/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { donshopInventory } from "@/server/donshop-inventory";
import { dsCsv } from "@/lib/donshop-inventory";
export async function GET(request) {
  try {
    const actor = await requireAdmin(request), params = new URL(request.url).searchParams;
    const exportAll = params.get("format") === "csv";
    const result = await donshopInventory().list(actor, Object.fromEntries(params), { exportAll });
    if (exportAll) return new Response(dsCsv(result.entries), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="donshop-${result.dateFrom}-${result.dateTo}.csv"`,
    } });
    const response = jsonOk(result); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (error) {
    if (error.status && error.status < 500) return jsonError(error.message, error.status);
    console.error("[donshop-inventory]", error.code || "INTERNAL_ERROR");
    return jsonError("โหลด Donshop ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อฐานข้อมูลแล้วลองใหม่", 503);
  }
}
