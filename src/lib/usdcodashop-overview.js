import { inventoryError } from "@/lib/usdcodashop-inventory";
import { sheetFigures } from "@/lib/usdcodashop-sheet";

export function codaEntryKind(value) {
  const kind = value == null || value === "" ? "all" : String(value);
  if (!["all", "order", "deposit"].includes(kind)) throw inventoryError("ประเภทประวัติไม่ถูกต้อง");
  return kind;
}

export function codaQuickDates(preset, now = new Date()) {
  const today = new Date(now).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  if (preset === "today") return { dateFrom: today, dateTo: today };
  if (preset === "yesterday") {
    const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
    return { dateFrom: yesterday, dateTo: yesterday };
  }
  if (preset === "month") return { dateFrom: `${today.slice(0, 7)}-01`, dateTo: today };
  throw inventoryError("ตัวกรองด่วนไม่ถูกต้อง");
}

export function codaEntryWarnings(row) {
  if (row.kind === "deposit") return [];
  const figures = row.figures || sheetFigures(row.details);
  return [row.orderDuplicate && "คิวซ้ำ", row.transactionDuplicate && "ธุรกรรมซ้ำ",
    figures.sale == null && "ยอดโอนไม่ครบ", figures.cost == null && "ต้นทุนไม่ครบ",
    row.balance == null && "ไม่มียอดบอท"].filter(Boolean);
}
