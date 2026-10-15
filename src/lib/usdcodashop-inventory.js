import { hasPermission } from "./permissions.js";

export const USD_INVENTORY_STATUSES = ["ปกติ", "ระงับใช้งาน"];
// Explicit user-provided template, never inserted automatically or reused as a live balance.
export const USD_CODASHOP_SHEET_ROW = { name: "[BOT] (USD) Codashop", status: "ปกติ", current: "15665.80", used: "1047.79" };
export const inventoryError = (message, status = 400) => Object.assign(new Error(message), { status });
export const canViewUsdInventory = (user) => hasPermission(user, "projectm.claim") || hasPermission(user, "projectm.admin");
export const canManageUsdInventory = (user) => hasPermission(user, "projectm.admin");

export function usdCents(value) {
  const text = String(value ?? "").trim();
  if (!/^(?:\d{1,12}|\d{1,3}(?:,\d{3}){1,3})(?:\.\d{1,2})?$/.test(text)) throw inventoryError("ยอดเงินต้องเป็นตัวเลขไม่ติดลบ ไม่เกิน 12 หลัก และทศนิยมไม่เกิน 2 ตำแหน่ง");
  const [whole, fraction = ""] = text.replaceAll(",", "").split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export const centsUsd = (cents) => `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
export function normalizeUsdInventory(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw inventoryError("รูปแบบข้อมูลไม่ถูกต้อง");
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 160) throw inventoryError("ระบุไอดี/ชื่อบัญชี ไม่เกิน 160 ตัวอักษร");
  if (!USD_INVENTORY_STATUSES.includes(body.status)) throw inventoryError("สถานะไม่ถูกต้อง");
  const current = usdCents(body.current); const used = usdCents(body.used);
  if (used > current) throw inventoryError("ยอดใช้ไปต้องไม่มากกว่ายอดปัจจุบัน");
  return { name, status: body.status, current: centsUsd(current), used: centsUsd(used), remaining: centsUsd(current - used) };
}
export function mapUsdInventory(row) {
  const current = usdCents(row.current_amount); const used = usdCents(row.used_amount);
  return { id: String(row.id), name: row.account_name, status: row.status, currency: "USD",
    current: centsUsd(current), used: centsUsd(used), remaining: centsUsd(current - used),
    createdBy: row.created_by_label, updatedBy: row.updated_by_label,
    version: Number(row.version), createdAt: row.created_at, updatedAt: row.updated_at };
}
