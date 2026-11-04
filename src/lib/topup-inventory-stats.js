import { isLowStock } from "./inventory-alerts.js";

// The three counts at the top of the Topup Inventory home. They count the
// accounts the stock alerts read (GET /api/projectm/inventory-alerts): a
// wallet, phone, email or card each, by the service that holds it.
export const TOPUP_INVENTORY_STATS = [
  { key: "active", tone: "info", label: "บัญชีเปิดใช้งาน", description: "บัญชีที่ระบบอ่านยอดล่าสุดได้ตอนนี้ แยกตามบริการที่ถือบัญชีนั้น" },
  { key: "ready", tone: "ok", label: "บัญชีมียอดพร้อมใช้", description: "บัญชีที่ยอดคงเหลือล่าสุดมากกว่าศูนย์ พร้อมใช้เติม แยกตามบริการ" },
  { key: "low", tone: "warn", label: "บัญชีใกล้หมด", description: "บัญชีที่ยอดคงเหลือต่ำกว่าครึ่งของยอดที่ตั้งไว้ในหน้าแจ้งเตือนสต็อก ควรเติมหรือเตรียมบัญชีสำรอง" },
];

const positive = (balance) => balance != null && String(balance).trim() !== "" && Number(balance) > 0;

/**
 * { active, ready, low } as { total, byProvider: { [provider]: count } }, from
 * the alerts' channels. A channel listed only because a target was once saved
 * for it (source "unavailable") is not an active account. low.total is null
 * when no account has a target: "none are low" would claim more than is known.
 */
export function topupInventoryStats(channels = []) {
  const live = channels.filter((channel) => channel.source !== "unavailable");
  const count = (rows) => {
    const byProvider = {};
    for (const row of rows) byProvider[row.provider] = (byProvider[row.provider] || 0) + 1;
    return { total: rows.length, byProvider };
  };
  const low = count(live.filter((channel) => isLowStock(channel.balance, channel.target) === true));
  return {
    active: count(live),
    ready: count(live.filter((channel) => positive(channel.balance))),
    low: live.some((channel) => channel.target != null) ? low : { ...low, total: null },
  };
}
