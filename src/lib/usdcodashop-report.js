import { inventoryError } from "@/lib/usdcodashop-inventory";
import { orderLink, sheetFigures } from "@/lib/usdcodashop-sheet";

export const CODA_EXPORT_LIMIT = 50000;
export const CODA_SHEET_HEADINGS = ["วันที่", "ลำดับคิว", "ยอดโอน (THB)", "ต้นทุน (THB)", "กำไร (THB)", "กำไร (%)", "USD เข้า", "USD ออก", "USD คงเหลือ", "คิวซ้ำ / ไม่ซ้ำ", "หมวดสินค้า", "ผู้เติม", "ชื่อลูกค้า", "ลิงก์", "เกม", "สิ่งที่ซื้อ", "transaction / UID", "เลขธุรกรรม", "ธุรกรรมซ้ำ / ไม่ซ้ำ", "ผู้บันทึก"];

function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000 || Number(value.slice(0, 4)) > 9998) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Inclusive calendar dates, converted once to [start, end) timestamps in Thailand.
export function codaDateBounds({ dateFrom = "", dateTo = "" } = {}) {
  const from = String(dateFrom ?? ""); const to = String(dateTo ?? "");
  if ((from && !validDay(from)) || (to && !validDay(to)) || (from && to && from > to)) {
    throw inventoryError("ช่วงวันที่ไม่ถูกต้อง กรุณาเลือกวันที่เริ่มต้นไม่เกินวันที่สิ้นสุด (ค.ศ.)");
  }
  return {
    start: from ? new Date(`${from}T00:00:00+07:00`).toISOString() : null,
    end: to ? new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86400000).toISOString() : null,
  };
}

export function codaPeriodDates(mode, value, endValue = "") {
  if (mode === "all") return { dateFrom: "", dateTo: "" };
  let dates;
  if (mode === "day") dates = { dateFrom: value, dateTo: value };
  else if (mode === "month" && /^\d{4}-\d{2}$/.test(value)) {
    const last = new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5)), 0)).getUTCDate();
    dates = { dateFrom: `${value}-01`, dateTo: `${value}-${last}` };
  } else if (mode === "year" && /^\d{4}$/.test(value)) dates = { dateFrom: `${value}-01-01`, dateTo: `${value}-12-31` };
  else if (mode === "range") dates = { dateFrom: value, dateTo: endValue };
  if (!dates || !dates.dateFrom || !dates.dateTo) throw inventoryError("กรุณาเลือกวันที่/เดือน/ปีให้ครบ");
  codaDateBounds(dates); return dates;
}

function csvCell(value, numeric = false) {
  let text = value == null ? "" : String(value);
  // Quoting alone does not prevent spreadsheet formula injection.
  if (!(numeric && /^-?\d+(?:\.\d+)?$/.test(text)) && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function codaReportCsv(entries) {
  const header = [...CODA_SHEET_HEADINGS, "หมายเหตุ", "ยอดโอนสกุลเดิม", "สกุลเงิน", "เรท THB", "แหล่งเรท", "วันที่เรท", "วันที่ล็อกเรท", "ประเภทเรท", "ต้นทุนเดิมจากฐานข้อมูล (THB)", "เรทต้นทุน USDTHB", "แหล่งเรทต้นทุน", "วันที่เรทต้นทุน", "ดึงเรทต้นทุนเมื่อ", "ฐานคำนวณต้นทุน"];
  const lines = [header.map((value) => csvCell(value)).join(",")];
  for (const row of entries) {
    const d = row.details || {}; const f = row.figures || sheetFigures(d); const deposit = row.kind === "deposit";
    const quote = d.saleConversion || {};
    const values = [
      new Date(row.occurredAt).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }), row.orderId,
      f.sale, f.cost, f.profit, f.margin, deposit ? row.amount : null, deposit ? null : row.amount, row.balance,
      deposit ? "" : row.orderDuplicate ? "พบคิวซ้ำ" : "ไม่ซ้ำ", d.category,
      d.sheetOperator || d.operator, d.customer, orderLink(d.link), d.game, d.pack, d.playerId, d.invoice,
      deposit || !d.invoice ? "" : row.transactionDuplicate ? "พบธุรกรรมซ้ำ" : "ไม่ซ้ำ", row.recordedBy,
      d.note, d.saleNative, d.saleCurrency, quote.rate, quote.source, quote.rateAt, quote.capturedAt,
      quote.kind ? "เรทอ้างอิง ณ ซิงก์ครั้งแรก ไม่ใช่เรทรับเงินจริงย้อนหลัง" : "",
      deposit ? null : d.costThb, d.costConversion?.rate, d.costConversion?.source, d.costConversion?.rateAt, d.costConversion?.fetchedAt,
      !deposit ? "USD ออก × เรท USDTHB อ้างอิงล่าสุด (ไม่ใช่ GOOGLEFINANCE โดยตรง)" : "",
    ];
    lines.push(values.map((value, index) => csvCell(value, (index >= 2 && index <= 8) || index === 21 || index === 23 || index === 28 || index === 29)).join(","));
  }
  // BOM makes Thai text readable when opened directly in Excel.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
