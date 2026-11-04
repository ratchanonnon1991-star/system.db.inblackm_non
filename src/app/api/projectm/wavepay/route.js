import { readInventoryPage } from "@/server/inventory-page";
import { requireAdmin } from "@/server/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { wavePayInventory } from "@/server/wavepay-inventory";

export async function GET(request) {
  const start = performance.now(); const timing = [];
  const measure = (name, duration) => timing.push(`${name};dur=${duration.toFixed(1)}`);
  const finish = (response) => { measure("total", performance.now() - start); response.headers.set("Server-Timing", timing.join(", ")); response.headers.set("Cache-Control", "no-store"); return response; };
  try {
    const actor = await requireAdmin(request); const url = new URL(request.url); const p = url.searchParams;
    measure("auth", performance.now() - start);
    const query = { dateFrom: p.get("dateFrom"), dateTo: p.get("dateTo"), phone: p.get("phone"), search: p.get("search"), page: p.get("page") };
    const result = p.has("pageSize")
      ? await readInventoryPage(request, actor, "wavepay", () => wavePayInventory().list(actor, { ...query, page: "1" }, { onTiming: measure, exportAll: true }))
      : await wavePayInventory().list(actor, query, { onTiming: measure });
    return finish(jsonOk(result));
  } catch (e) {
    // Do not return database errors/connection strings to the browser.
    if (e.status && e.status < 500) return finish(jsonError(e.message, e.status));
    console.error("[wavepay-inventory]", e.code || "INTERNAL_ERROR");
    return finish(jsonError("โหลดข้อมูล WavePay ไม่สำเร็จ กรุณาตรวจ PROFIT_DATABASE_URL และฐานข้อมูลของระบบ", 503));
  }
}
