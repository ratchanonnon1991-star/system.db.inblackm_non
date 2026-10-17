import { usdCents, centsUsd, inventoryError } from "./usdcodashop-inventory.js";

export const CODA_BOUNDARY = "K7306171";
export const CODA_OPENING = "9373.17";
export const CODA_METHOD = "CodashopUSD";
export const signedUsd = (n) => n < 0n ? `-${centsUsd(-n)}` : centsUsd(n);
export const validRequestId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || "");

// Unknown is not zero. Accept exact cents (including DB trailing zeroes), never guess/round.
export function providerUsd(value) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim().replace(/(\.\d{2})0+$/, "$1");
  try {
    const negative = text.startsWith("-");
    const cents = usdCents(negative ? text.slice(1) : text);
    return signedUsd(negative ? -cents : cents);
  } catch { return null; }
}

// Cost is charged only from one unambiguous wallet transaction, never pack_price.
export function normalizeCodaOrder(row) {
  const label = row.sale_order_id || row.source_order_id || row.id;
  const fail = () => { throw inventoryError(`Order ${label}: ยอดตัด USD ไม่ครบหรือมีหลายธุรกรรม กรุณาตรวจสอบต้นทางก่อนซิงก์`, 409); };
  if (row.payment_method !== CODA_METHOD || row.status !== "completed" || !/^[1-9]\d*$/.test(String(row.id))) fail();
  if (Number(row.transaction_count) !== 1) fail();
  let amount;
  try { amount = usdCents(row.amount_used); } catch { fail(); }
  if (amount <= 0n || !row.occurred_at || !Number.isFinite(new Date(row.occurred_at).getTime())) fail();
  return {
    sourceId: String(row.id), orderId: String(label).slice(0, 200), amount: centsUsd(amount),
    occurredAt: new Date(row.occurred_at).toISOString(),
    details: {
      paymentMethod: CODA_METHOD, status: "completed", game: String(row.game_name || "").slice(0, 200),
      pack: String(row.pack_name || "").slice(0, 300), operator: String(row.operator || "Bot").slice(0, 160),
      invoice: String(row.invoice_number || "").slice(0, 1000),
      // Source wallet balance is authoritative; no invented exchange rate/profit.
      costThb: row.cost_thb == null ? null : String(row.cost_thb),
      providerBalance: providerUsd(row.balance_after),
      source: String(row.source || "").slice(0, 80),
      ...(row.sheet_fields || {}),
    },
  };
}

export function depositInput(body) {
  if (!validRequestId(body?.requestId)) throw inventoryError("รหัสคำขอไม่ถูกต้อง");
  const amount = usdCents(body.amount);
  if (!amount) throw inventoryError("ยอดเติมต้องมากกว่า 0 USD");
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!note || note.length > 300) throw inventoryError("ระบุหมายเหตุ/เลขอ้างอิง ไม่เกิน 300 ตัวอักษร");
  return { amount: centsUsd(amount), note };
}
