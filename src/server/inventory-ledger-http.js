// Shared request handling for the debit page API routes.
import { jsonError } from "@/lib/http";
import { ledgerError } from "@/lib/inventory-ledger";

export function ledgerFailure(e, label) {
  if (e.status && e.status < 500) return jsonError(e.message, e.status);
  console.error(`[inventory-ledger:${label}]`, e.code || e.message || "INTERNAL_ERROR");
  return jsonError("บันทึกหรือโหลดไม่สำเร็จ กรุณาโหลดรายการล่าสุดก่อนกดบันทึกซ้ำ (รายการที่บันทึกแล้วจะไม่ซ้ำ)", 503);
}

/** Same-site JSON only, size-capped before parsing. */
export async function readLedgerJson(request, maxBytes = 65536) {
  if (request.headers.get("sec-fetch-site") === "cross-site") throw ledgerError("ไม่อนุญาตคำขอข้ามเว็บไซต์", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw ledgerError("ต้องส่ง JSON");
  const reader = request.body?.getReader();
  if (!reader) throw ledgerError("ไม่พบข้อมูล");
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw ledgerError("ข้อมูลใหญ่เกินกำหนด", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw ledgerError("JSON ไม่ถูกต้อง"); }
}

/** Bangkok calendar day -> [start, end) instants. */
export function bangkokDayBounds(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day ?? ""))) throw ledgerError("วันที่ไม่ถูกต้อง");
  const start = new Date(`${day}T00:00:00+07:00`);
  if (!Number.isFinite(start.getTime())) throw ledgerError("วันที่ไม่ถูกต้อง");
  return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
}
