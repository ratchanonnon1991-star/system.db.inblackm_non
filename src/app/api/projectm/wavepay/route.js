import { requireAdmin } from "@/server/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { wavePayInventory } from "@/server/wavepay-inventory";

export async function GET(request) {
  try {
    const actor = await requireAdmin(request); const url = new URL(request.url); const p = url.searchParams;
    const result = await wavePayInventory().list(actor, { dateFrom: p.get("dateFrom"), dateTo: p.get("dateTo"),
      phone: p.get("phone"), search: p.get("search"), page: p.get("page") });
    const response = jsonOk(result); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (e) {
    // Do not return database errors/connection strings to the browser.
    if (e.status && e.status < 500) return jsonError(e.message, e.status);
    console.error("[wavepay-inventory]", e.code || "INTERNAL_ERROR");
    return jsonError("โหลดข้อมูล WavePay ไม่สำเร็จ กรุณาตรวจ PROFIT_DATABASE_URL และฐานข้อมูลของระบบ", 503);
  }
}
