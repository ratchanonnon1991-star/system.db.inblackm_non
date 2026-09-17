/** Shared Razer stock status codes + Thai labels (safe for client + server). */

export const RAZER_STATUSES = [
  "ACTIVE",
  "FILLING_TWOCARD",
  "FILLING_AZ",
  "LINE_DROPPED",
  "DISABLED",
];

export const RAZER_STATUS_LABELS = {
  ACTIVE: "Active",
  FILLING_TWOCARD: "กำลังส่งเติม Twocard",
  FILLING_AZ: "กำลังส่งเติม AZ",
  LINE_DROPPED: "เบอร์หลุด",
  DISABLED: "ปิดการใช้งาน",
};

/** Only these can be claimed / listed for bot payment. */
export const RAZER_BOT_USABLE_STATUSES = ["ACTIVE"];

/** Set when a bot sends a top-up order for the email. */
export const RAZER_BUSY_STATUSES = ["FILLING_TWOCARD", "FILLING_AZ"];

const LEGACY_STATUS_MAP = {
  PENDING_TOPUP: "ACTIVE",
  SILVER_READY: "ACTIVE",
  INACTIVE: "DISABLED",
  IN_USE: "FILLING_TWOCARD",
};

export function razerStatusLabel(status) {
  const code = normalizeRazerStatus(status);
  return RAZER_STATUS_LABELS[code] || code;
}

export function isRazerBotUsableStatus(status) {
  return RAZER_BOT_USABLE_STATUSES.includes(normalizeRazerStatus(status));
}

export function isRazerBusyStatus(status) {
  return RAZER_BUSY_STATUSES.includes(normalizeRazerStatus(status));
}

export function normalizeRazerStatus(raw) {
  const upper = String(raw || "").trim().toUpperCase().replace(/\s+/g, "_");
  if (RAZER_STATUSES.includes(upper)) return upper;
  if (LEGACY_STATUS_MAP[upper]) return LEGACY_STATUS_MAP[upper];

  const lower = String(raw || "").trim().toLowerCase();
  if (lower === "active") return "ACTIVE";
  if (lower.includes("twocard") || lower.includes("two card") || lower.includes("2card")) {
    return "FILLING_TWOCARD";
  }
  if (lower === "az" || lower.includes("ส่งเติม az") || lower.includes("filling_az")) {
    return "FILLING_AZ";
  }
  if (lower.includes("เบอร์หลุด") || lower.includes("line_dropped") || lower.includes("dropped")) {
    return "LINE_DROPPED";
  }
  if (lower.includes("ปิด") || lower.includes("disabled") || lower.includes("inactive")) {
    return "DISABLED";
  }
  return "ACTIVE";
}

/** Map bot order platform → busy status. */
export function resolveRazerFillingStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "FILLING_TWOCARD";
  if (
    s === "az"
    || s === "filling_az"
    || /\b(az|agenh2h|agen)\b/.test(s)
  ) {
    return "FILLING_AZ";
  }
  if (
    s === "twocard"
    || s === "two_card"
    || s === "2card"
    || s === "filling_twocard"
    || s.includes("twocard")
    || s.includes("two card")
  ) {
    return "FILLING_TWOCARD";
  }
  const normalized = normalizeRazerStatus(raw);
  if (RAZER_BUSY_STATUSES.includes(normalized)) return normalized;
  return "FILLING_TWOCARD";
}
