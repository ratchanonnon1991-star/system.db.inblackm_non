import { inventoryError, usdCents, centsUsd } from "./usdcodashop-inventory.js";
import { codaDateBounds } from "./usdcodashop-report.js";
import { sheetFigures, orderLink } from "./usdcodashop-sheet.js";

export const MGC_PAGE_SIZE = 100;
export const MGC_MAX_ORDERS = 20000;
export const MGC_LOW_POINTS = 50000n * 100n; // Reference: ตรวจสอบMultiGame Card!H4/T4.
export function mgcPoints(value) {
  if (value == null || String(value).trim() === "") return null;
  try { return centsUsd(usdCents(String(value).trim())); } catch { return null; }
}
export function mgcStatus(balance) {
  const points = mgcPoints(balance);
  if (points == null) return "ไม่ทราบยอด";
  const n = usdCents(points);
  return n === 0n ? "หมดแล้ว" : n < MGC_LOW_POINTS ? "เศษ" : "ปกติ";
}
export function mgcSerial(value) {
  const serial = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(serial)) throw inventoryError("Serial ต้องมี 3–80 ตัว ใช้ตัวอักษรอังกฤษ ตัวเลข - หรือ _");
  return serial;
}
export function mgcFilters(query = {}) {
  const mode = query.mode || "bot";
  if (!["bot", "manual"].includes(mode)) throw inventoryError("ประเภท Multigamecard ไม่ถูกต้อง");
  if (!query.dateFrom || !query.dateTo) throw inventoryError("กรุณาเลือกช่วงวันที่ให้ครบ");
  const bounds = codaDateBounds(query);
  if (new Date(bounds.end) - new Date(bounds.start) > 93 * 86400000) throw inventoryError("เลือกช่วงวันที่ได้ไม่เกิน 93 วัน");
  return { mode, bounds, dateFrom: query.dateFrom, dateTo: query.dateTo,
    serial: query.serial ? mgcSerial(query.serial) : "", search: String(query.search || "").trim().slice(0, 200),
    page: Math.max(1, Math.min(10000, Number.parseInt(query.page, 10) || 1)) };
}
const text = (value, max = 300) => String(value ?? "").trim().slice(0, max);
const optionalMoney = value => value == null || String(value).trim() === "" ? null : centsUsd(usdCents(value));
export function mgcManualInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw inventoryError("ข้อมูลไม่ถูกต้อง");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId || "")) throw inventoryError("รหัสคำขอไม่ถูกต้อง กรุณาโหลดใหม่");
  if (!["card", "deposit", "use"].includes(body.action)) throw inventoryError("รายการไม่ถูกต้อง");
  const amount = centsUsd(usdCents(body.amount));
  if (body.action !== "card" && usdCents(amount) === 0n) throw inventoryError("จำนวนแต้มต้องมากกว่า 0");
  const note = text(body.note);
  if (!note) throw inventoryError("กรุณาระบุหมายเหตุหรือหลักฐานอ้างอิง");
  const common = { action: body.action, requestId: body.requestId.toLowerCase(), amount, note };
  if (body.action === "card") {
    const owner = text(body.owner, 160);
    if (!owner) throw inventoryError("กรุณาระบุผู้ใช้งานบัตร");
    return { ...common, serial: mgcSerial(body.serial), owner };
  }
  if (!/^[1-9]\d{0,15}$/.test(String(body.cardId))) throw inventoryError("กรุณาเลือกบัตร Manual");
  if (body.action === "deposit") return { ...common, cardId: String(body.cardId), details: {} };
  const orderId = text(body.orderId, 200);
  if (!orderId) throw inventoryError("กรุณาระบุ Order ที่ใช้บัตร");
  const details = { saleThb: optionalMoney(body.saleThb), costThb: optionalMoney(body.costThb),
    game: text(body.game, 200), pack: text(body.pack), customer: text(body.customer, 200),
    playerId: text(body.playerId, 200), invoice: text(body.invoice, 200), operator: text(body.operator, 160) };
  return { ...common, cardId: String(body.cardId), orderId, details };
}
export function mgcOrder(row) {
  const details = { ...(row.sheet_fields || {}), game: text(row.game_name, 200), pack: text(row.pack_name),
    operator: text(row.operator || "Bot", 160), invoice: text(row.invoice_number, 1000),
    costThb: Number(row.transaction_count) === 1 ? mgcPoints(row.cost_thb) : null };
  return { id: String(row.id), serial: text(row.card_serial, 80), kind: "use",
    orderId: text(row.sale_order_id || row.source_order_id || row.id, 200),
    amount: mgcPoints(row.redeem_points), balance: mgcPoints(row.remaining_points),
    occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
    details, figures: sheetFigures(details), recordedBy: details.operator };
}
export function mgcMatches(entry, filter) {
  return (!filter.serial || entry.serial === filter.serial) && (!filter.search ||
    [entry.orderId, entry.serial, ...Object.values(entry.details || {}), entry.recordedBy]
      .filter(v => typeof v === "string").join(" ").toLowerCase().includes(filter.search.toLowerCase()));
}
export function mgcSummary(entries) {
  const uses = entries.filter(e => e.kind === "use");
  const sum = key => {
    let total = 0n;
    for (const e of uses) {
      const v = e.figures[key]; if (v == null) return null;
      total += String(v).startsWith("-") ? -usdCents(String(v).slice(1)) : usdCents(v);
    }
    return `${total < 0n ? "-" : ""}${centsUsd(total < 0n ? -total : total)}`;
  };
  return { orders: uses.length, sale: sum("sale"), cost: sum("cost"), profit: sum("profit"),
    missingSales: uses.filter(e => e.figures.sale == null).length, missingCosts: uses.filter(e => e.figures.cost == null).length };
}
export function mgcCsv(entries) {
  const cell = (v, numeric = false) => {
    let s = v == null ? "" : String(v);
    if (!(numeric && /^-?\d+(?:\.\d+)?$/.test(s)) && /^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const headers = ["วันที่ (ไทย)", "Order / รายการ", "Serial", "ประเภท", "ยอดโอน (THB)", "ต้นทุน (THB)", "กำไร (THB)", "กำไร (%)", "แต้มเข้า", "แต้มออก", "แต้มคงเหลือหลังรายการ", "ผู้เติม", "ลูกค้า", "เกม", "แพ็ก", "UID", "ธุรกรรม", "ลิงก์", "หมายเหตุ", "ผู้บันทึก"];
  return "\uFEFF" + [headers.map(x => cell(x)).join(","), ...entries.map(e => {
    const d = e.details, f = e.figures;
    return [e.occurredAt ? new Date(e.occurredAt).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }) : "", e.orderId, e.serial, e.kind,
      f.sale, f.cost, f.profit, f.margin, e.kind === "use" ? null : e.amount, e.kind === "use" ? e.amount : null, e.balance,
      d.sheetOperator || d.operator, d.customer, d.game, d.pack, d.playerId, d.invoice, orderLink(d.link), d.note, e.recordedBy]
      .map((v, i) => cell(v, i >= 4 && i <= 10)).join(",");
  })].join("\r\n") + "\r\n";
}
