// Install links for the top-up apps (Cydia, BG, Sileo …) the 2.1 STOCK_ sheet
// keeps on its MAIN STOCK tab with "วันหมดอายุลิงค์". Each link has an expiry
// date; the Stock front page warns STOCK_LINK_WARN_DAYS before it runs out.
// Only a name, the link and its date: never a login or a password.
// Pure: the same rules run in the API and the tests.

export const STOCK_LINK_WARN_DAYS = 14;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** A link as typed → { link } ready to store, or { error } in Thai. */
export function validateStockAppLink(input) {
  const name = clean(input?.name, 120);
  if (!name) return { error: "ใส่ชื่อลิงก์ เช่น Cydia, BG, Sileo" };
  const url = clean(input?.url, 1000);
  if (!/^https:\/\/\S+$/i.test(url)) return { error: "ลิงก์ต้องขึ้นต้นด้วย https://" };
  const expiresOn = clean(input?.expiresOn, 10);
  if (!DATE.test(expiresOn) || Number.isNaN(Date.parse(`${expiresOn}T00:00:00Z`))) return { error: "ใส่วันหมดอายุของลิงก์" };
  return { link: { name, url, expiresOn, note: clean(input?.note, 300) } };
}

/** Whole days from `today` (YYYY-MM-DD) to the expiry date; 0 = expires today, below 0 = expired. */
export function stockAppLinkDaysLeft(expiresOn, today) {
  const end = Date.parse(`${expiresOn}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(end) || Number.isNaN(now)) return null;
  return Math.round((end - now) / 86400000);
}

/** "expired", "soon" (within STOCK_LINK_WARN_DAYS) or "ok". */
export function stockAppLinkTone(daysLeft) {
  if (daysLeft == null) return "ok";
  if (daysLeft < 0) return "expired";
  return daysLeft <= STOCK_LINK_WARN_DAYS ? "soon" : "ok";
}

/** Today in Bangkok as YYYY-MM-DD, the day a link's expiry is counted against. */
export function bangkokToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "เหลือ 9 วัน", "หมดวันนี้", "หมดแล้ว 3 วัน". */
export function stockAppLinkDaysText(daysLeft) {
  if (daysLeft == null) return "—";
  if (daysLeft < 0) return `หมดแล้ว ${-daysLeft} วัน`;
  return daysLeft === 0 ? "หมดวันนี้" : `เหลือ ${daysLeft} วัน`;
}
