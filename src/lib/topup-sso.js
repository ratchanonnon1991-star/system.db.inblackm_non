// gamedb's half of "sign in with TopUp" (see /api/sso/from-topup, and on the
// TopUp side src/server/tools-sso/tools-sso-service.js). TopUp verifies the
// person — OTP to a real inbox, PIN, admin/staff status — and hands out a
// one-time code; gamedb redeems it server-to-server and never sees a TopUp
// credential. The secret only redeems codes; it cannot mint a session.

export function getTopupSsoSecret(env = process.env) {
  const secret = String(env.TOPUP_SSO_SECRET || "").trim();
  if (env.NODE_ENV === "production" && !secret) {
    throw new Error("TOPUP_SSO_SECRET ยังไม่ได้ตั้งใน .env");
  }
  return secret || "tools-sso-dev-secret";
}

/** TopUp's public origin, for the server-to-server exchange. */
export function getTopupBaseUrl(env = process.env) {
  const url = String(env.TOPUP_BASE_URL || env.NEXT_PUBLIC_TOPUP_BASE_URL || "").trim();
  if (!url) throw new Error("TOPUP_BASE_URL ยังไม่ได้ตั้งใน .env");
  return url.replace(/\/+$/, "");
}

// Only TopUp's own staff may come in this way; customers have TopUp accounts too.
export const TOPUP_SSO_ROLES = Object.freeze(["admin", "staff"]);
