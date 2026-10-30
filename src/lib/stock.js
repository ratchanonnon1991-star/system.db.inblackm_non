// Stock: what was bought ahead of time for some games (sheet "2.1 STOCK_"),
// held per stock account ("pes1", "lastwar1"), one line per pack. Nothing is
// stored as a running total: every receipt, sale and correction is a move,
// and a pack's balance is the sum of its move lines — so a balance can never
// drift from its history the way a sheet's chained formula can.

export const STOCK_MOVE_KINDS = ["in", "out", "adjust"];
export const STOCK_MOVE_LABELS = { in: "รับเข้า", out: "ตัดออก", adjust: "ปรับยอด" };
export const STOCK_ACCOUNT_STATUSES = ["active", "check", "closed"];
export const STOCK_ACCOUNT_STATUS_LABELS = { active: "ปกติ", check: "ต้องตรวจ", closed: "ปิด" };
export const STOCK_DEFAULT_LOW_AT = 10;

/** "pes1" → "pes1": letters, digits, dot, dash and underscore, 2–32 long. */
export function normalizeStockCode(value) {
  const code = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{1,31}$/.test(code) ? code : "";
}

/** A money amount as a string with at most 2 decimals, or "" when blank or not a number ≥ 0. */
export function normalizeStockMoney(value) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return "";
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? String(Math.round(number * 100) / 100) : "";
}

/**
 * One pack's totals from its move lines ({ kind, qty } with qty signed:
 * in +, out −, adjust ±).
 */
export function summarizeStockLines(lines) {
  let received = 0;
  let used = 0;
  let adjusted = 0;
  for (const line of lines || []) {
    const qty = Number(line.qty) || 0;
    if (line.kind === "in") received += qty;
    else if (line.kind === "out") used -= qty;
    else adjusted += qty;
  }
  return { received, used, adjusted, left: received - used + adjusted };
}

/** "ok" | "low" | "empty" — low is under the pack's own threshold. */
export function stockTone(left, lowAt = STOCK_DEFAULT_LOW_AT) {
  if (left <= 0) return "empty";
  return left < lowAt ? "low" : "ok";
}

/**
 * A move as entered, checked against the account's balances (itemId → left).
 * Returns { lines } with each qty signed for storing, or { error } in Thai.
 */
export function validateStockMove({ kind, queue, note, lines }, balances = {}) {
  if (!STOCK_MOVE_KINDS.includes(kind)) return { error: "ประเภทรายการไม่ถูกต้อง" };
  const queueText = String(queue ?? "").trim();
  const noteText = String(note ?? "").trim();
  if (kind === "out" && !queueText) return { error: "ใส่เลขคิวของออเดอร์ที่ใช้ stock" };
  if (kind === "adjust" && !noteText) return { error: "ปรับยอดต้องใส่เหตุผล" };
  const seen = new Set();
  const signed = [];
  for (const line of lines || []) {
    const itemId = Number(line.itemId);
    const qty = Number(line.qty);
    if (!Number.isInteger(itemId) || itemId <= 0) return { error: "เลือกแพ็คให้ครบทุกแถว" };
    if (seen.has(itemId)) return { error: "แพ็คเดียวกันใส่ได้แถวเดียว" };
    seen.add(itemId);
    if (!Number.isInteger(qty) || qty === 0 || (kind !== "adjust" && qty < 0)) {
      return { error: kind === "adjust" ? "จำนวนที่ปรับต้องเป็นจำนวนเต็มที่ไม่ใช่ 0" : "จำนวนต้องเป็นจำนวนเต็มมากกว่า 0" };
    }
    const left = Number(balances[itemId] ?? 0);
    const delta = kind === "out" ? -qty : qty;
    if (left + delta < 0) {
      return { error: `${line.label || "แพ็คนี้"} เหลือ ${left} ตัดได้ไม่เกินนั้น` };
    }
    signed.push({ itemId, qty: delta, unitCost: kind === "in" ? normalizeStockMoney(line.unitCost) : "" });
  }
  if (!signed.length) return { error: "ใส่อย่างน้อยหนึ่งแพ็ค" };
  return { lines: signed, queue: queueText.slice(0, 64), note: noteText.slice(0, 500) };
}
