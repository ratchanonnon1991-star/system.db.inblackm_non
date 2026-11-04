// Pure: the "หน้ารวมเมล ITUNES" tab of the 2.2 ITUNES workbook -> iTune mails still usable.
// Kept: balance left > 0, Status not Complete, no problem in Notice. This is the only import
// allowed to read the password column (the iTune system stores each mail's password).
import { sheetDay } from "./inventory-sheet-import.mjs";

const clean = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OK_NOTICE = new Set(["", "ยังไม่พบปัญหา"]);

/**
 * @param sheet  { cells: [{row, col, text}] } of "หน้ารวมเมล ITUNES"
 * @returns {{ mails: {email,password,currency,supplier,amount,linkSms,addedAt}[], skipped: {row, reason}[] }}
 */
export function parseItuneMailTab(sheet) {
  const byRow = new Map();
  for (const c of sheet.cells) {
    if (!byRow.has(c.row)) byRow.set(c.row, new Map());
    byRow.get(c.row).set(c.col, clean(c.text));
  }
  const header = byRow.get(1) ?? new Map(), rows = [...byRow.keys()].filter((r) => r > 1).sort((a, b) => a - b);
  const byName = (name) => [...header].find(([, t]) => t === name)?.[0];
  // The header row is shifted against the data for the mail itself: find it by content.
  const emailCol = [...new Set(rows.flatMap((r) => [...byRow.get(r).keys()]))]
    .map((col) => [col, rows.filter((r) => EMAIL.test(byRow.get(r).get(col) ?? "")).length])
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  const col = { password: byName("PASS"), status: byName("Status"), currency: byName("เมล"), supplier: byName("Supplier"),
    balance: byName("คงเหลือ"), link: byName("LINK SMS"), notice: byName("Notice"), bought: byName("วันที่สั่งซื้อ") };
  if (!emailCol || !col.password || !col.currency || !col.balance) throw new Error("ไม่พบคอลัมน์เมล / PASS / สกุลเงิน / คงเหลือ ในแท็บนี้");
  const mails = [], skipped = [], seen = new Set();
  for (const r of rows) {
    const get = (c) => (c ? byRow.get(r).get(c) ?? "" : ""), email = get(emailCol).toLowerCase();
    if (!EMAIL.test(email)) continue; // blank and note rows
    const amount = Number(get(col.balance).replaceAll(",", ""));
    const reason = !(amount > 0) ? "ไม่มียอดคงเหลือ"
      : /complete/i.test(get(col.status)) ? "Status Complete"
      : !OK_NOTICE.has(get(col.notice)) ? `มีปัญหา (${get(col.notice).slice(0, 40)})`
      : !get(col.password) ? "ไม่มีรหัสผ่าน"
      : !/^[A-Z]{2,5}$/.test(get(col.currency)) ? `สกุลเงินไม่ชัด (${get(col.currency).slice(0, 10)})`
      : seen.has(email) ? "เมลซ้ำในชีต" : null;
    if (reason) { skipped.push({ row: r, reason }); continue; }
    seen.add(email);
    const day = sheetDay(get(col.bought)), link = get(col.link);
    mails.push({
      email, password: get(col.password), currency: get(col.currency), supplier: get(col.supplier).slice(0, 120),
      amount: amount.toFixed(2), linkSms: /^https?:\/\//i.test(link) ? link.slice(0, 500) : "",
      addedAt: day ? `${day}T00:00:00+07:00` : null,
    });
  }
  return { mails, skipped };
}
