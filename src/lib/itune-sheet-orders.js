// iTunes orders topped up by staff live only in the order sheets (bot orders are in the database).
// A row is an iTunes order when its status is "รอเติม" and its email column holds the iTune email
// that paid, and the row is only moved once its time cell is filled.
// Columns follow auto-balance's README for each source (sale/customer/link/game/pack/uid are the
// columns it copies into the Codashop sheet); time and email columns are from the team.
export const ITUNE_SHEET_START_DATE = "2026-10-18";
export const ITUNE_SHEET_SOURCES = {
  // Russia's THB sale (K) is a formula over E; E stays empty until F is pasted into it (see russiaFill).
  russia: { label: "Order Russia", order: "I", channel: "Y", status: "Z", amount: "T", time: "W", email: "AA",
    sale: "K", customer: "N", link: "O", game: "P", pack: "Q", uid: "R", filePrefix: "0.1 Order Russia Reseller " },
  marketplace: { label: "Marketplace", order: "D", channel: "T", status: "U", amount: "O", time: "R", email: "V",
    sale: "G", customer: "I", link: "J", game: "K", pack: "L", uid: "N" },
  page: { label: "Order Page", order: "C", channel: "S", status: "Q", amount: "N", time: "M", email: "U",
    sale: "F", customer: "H", link: "I", game: "J", pack: "K", uid: "L" },
  inblackm: { label: "Order inblackm", order: "C", channel: "S", status: "Q", amount: "N", time: "M", email: "U",
    sale: "F", customer: "H", link: "I", game: "J", pack: "K", uid: "L", filePrefix: "0.5 Order inblackm " },
};
export const itunesSourceLabel = (key) => ITUNE_SHEET_SOURCES[key]?.label || (key === "manual" ? "เพิ่มเอง" : key);
export const ITUNE_WAITING_STATUS = "รอเติม";

export function columnIndex(letters) {
  return [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

// d/m/yyyy as the sheets write it → yyyy-mm-dd, or null.
export function sheetDate(text) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(String(text ?? "").trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

// "0.1 Order Russia Reseller 18/10/2026 Bot2" → 2026-10-18 (the work tab has the file's name).
export function dailyFileDate(name, prefix) {
  const title = String(name ?? "");
  if (!title.startsWith(prefix)) return null;
  const bot = title.lastIndexOf(" Bot");
  return bot < 0 ? null : sheetDate(title.slice(prefix.length, bot));
}

// "itunes de" / "de" / "ITUNES(DE)" → DE, "itunes usd" / "usd" / "ITUNES (USD)" → USD
// (the iTune entries' own currency labels).
export function itunesCurrency(channel) {
  const m = /^(?:itunes?\s*)?\(?\s*(de|usd)\s*\)?$/i.exec(String(channel ?? "").trim().replace(/\s+/g, " "));
  return m ? m[1].toUpperCase() : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "12.50", "1,234.5", "$12.50" → "12.50" (2 dp, half-up); anything else → null.
export function sheetAmount(text) {
  const cleaned = String(text ?? "").replace(/[^\d.,-]/g, "").replaceAll(",", "");
  if (!/^\d{1,9}(\.\d+)?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  let cents = BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0")) + (Number(fraction[2] || 0) >= 5 ? 1n : 0n);
  if (cents <= 0n) return null;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

// Every iTunes row waiting in one tab, plus the rows that look like iTunes but cannot be used.
// Rows whose time cell is still empty are only counted: staff have not finished them yet.
export function extractItunesRows(sourceKey, rows, { sheetDate: date, tab }) {
  const src = ITUNE_SHEET_SOURCES[sourceKey];
  const at = (row, letter) => String(row[columnIndex(letter)] ?? "").trim();
  const seen = new Map(); const orders = []; const issues = []; let withoutTime = 0;
  rows.forEach((row, index) => {
    const orderId = at(row, src.order);
    // Occurrence among all rows of the same order in this tab, so a multi-pack order's rows stay
    // distinct and a sibling changing status does not shift the others' keys.
    const occurrence = orderId ? (seen.get(orderId) || 0) + 1 : 0;
    if (orderId) seen.set(orderId, occurrence);
    const email = at(row, src.email).toLowerCase();
    if (at(row, src.status) !== ITUNE_WAITING_STATUS || !EMAIL.test(email)) return;
    const base = { source: sourceKey, sheetDate: date, tab, row: index + 1, orderId, email, channel: at(row, src.channel) };
    const currency = itunesCurrency(base.channel); const amount = sheetAmount(at(row, src.amount));
    if (!orderId) return issues.push({ ...base, reason: "ไม่มีเลขออเดอร์" });
    if (!currency) return issues.push({ ...base, reason: `ช่องทาง "${base.channel}" ไม่ใช่ iTunes DE/USD` });
    if (!amount) return issues.push({ ...base, reason: `ยอดออกคอลัมน์ ${src.amount} ไม่ใช่ตัวเลข` });
    const time = at(row, src.time);
    if (!time) { withoutTime++; return; }
    const text = (letter, max) => at(row, letter).slice(0, max);
    const details = { saleThb: sheetAmount(at(row, src.sale)), customer: text(src.customer, 200), link: text(src.link, 500),
      game: text(src.game, 200), pack: text(src.pack, 300), playerId: text(src.uid, 200) };
    const order = { ...base, currency, amount, time: time.slice(0, 32), details, key: `${sourceKey}|${date}|${orderId}|${occurrence}` };
    // Same step auto-balance takes for its rows: K stays 0 until F's displayed value is in E.
    if (sourceKey === "russia" && !details.saleThb && at(row, "F") && !at(row, "E")) order.fillE = at(row, "F");
    orders.push(order);
  });
  return { orders, issues, withoutTime };
}

// Today and yesterday are read every pass; older days since the start date only every 30 minutes.
export function daysToRead(today, { includeOlder }) {
  const days = [];
  for (let d = today; d >= ITUNE_SHEET_START_DATE; d = new Date(new Date(`${d}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)) {
    if (!includeOlder && days.length >= 2) break;
    days.push(d);
  }
  return days;
}

// cost (THB) = amount × multiplier, half-up to satang; null when no multiplier is set.
export function costThb(amount, rate) {
  if (amount == null || rate == null) return null;
  const scale = (v) => { const [w, f = ""] = String(v).split("."); return { units: BigInt(w + f), scale: 10n ** BigInt(f.length) }; };
  const a = scale(amount); const r = scale(rate); const den = a.scale * r.scale;
  const cents = (a.units * r.units * 100n + den / 2n) / den;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

// Amount-log rows written by sheet imports, manual adds and order deletes. The orders table already
// shows these, so the topup card's balance history leaves them out (they stay in the database).
export function isOrderAmountLog(log) {
  return /^(ชีท |เพิ่มเองโดย |ลบออเดอร์ )/.test(String(log?.changedByUsername || ""));
}
