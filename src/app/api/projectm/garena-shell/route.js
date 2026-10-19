import { requireAdmin } from "@/server/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { garenaShellInventory } from "@/server/garena-shell-inventory";
import { shellCsv } from "@/lib/garena-shell-inventory";

export async function GET(request) {
  try {
    const actor = await requireAdmin(request);
    const params = new URL(request.url).searchParams;
    const exportAll = params.get("format") === "csv";
    const result = await garenaShellInventory().list(actor, Object.fromEntries(params), { exportAll });
    if (exportAll) return new Response(shellCsv(result.entries), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="garena-shell-${result.dateFrom}-${result.dateTo}.csv"`,
    } });
    const response = jsonOk(result);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error.status && error.status < 500) return jsonError(error.message, error.status);
    console.error("[garena-shell-inventory]", error.code || "INTERNAL_ERROR");
    return jsonError("โหลด Garena Shell ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อฐานข้อมูลแล้วลองใหม่", 503);
  }
}
