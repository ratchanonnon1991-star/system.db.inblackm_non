import { inventoryError, usdCents, centsUsd } from "./usdcodashop-inventory.js";

export function alertTarget(value) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw inventoryError("ยอดเป้าหมายต้องเป็นตัวเลข");
  const cents = usdCents(value);
  if (cents <= 0n) throw inventoryError("ยอดเป้าหมายต้องมากกว่าศูนย์ หรือเว้นว่างเพื่อปิด");
  return centsUsd(cents);
}

export function isLowStock(balance, target) {
  if (balance == null || target == null) return null;
  try { return usdCents(balance) * 2n < usdCents(target); }
  catch { return null; }
}

export function stockAlertText(channel, target) {
  return ["⚠️ Topup Inventory: สต็อกต่ำกว่า 50%", channel.label,
    `คงเหลือ: ${channel.balance} ${channel.currency}`,
    `ยอดที่ตั้งไว้: ${target} ${channel.currency}`,
    `ข้อมูลยอดล่าสุด: ${channel.balanceAt || "ไม่ระบุเวลา"}`,
    `แหล่งข้อมูล: ${channel.source}`,
    "https://tools.inblackm.com/projectm/th/topup-inventory"].join("\n");
}
