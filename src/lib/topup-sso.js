import { PERMISSION_PRESETS, PERMISSIONS } from "@/lib/permissions";

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

// A first sign-in from TopUp gets an account of its own: TopUp has already
// checked this is its admin or staff, so the account is Staff and can view
// GameInfo the way the top-up team does. An Admin can change it afterwards.
export const TOPUP_SSO_NEW_ACCOUNT = Object.freeze({
  role: "staff",
  permissions: PERMISSION_PRESETS.gameinfoTopup,
});

// TopUp's admins are Admins here too: the Admin role (users, System DB
// edits, Stock) and every system's permissions, Admin ones included.
export const TOPUP_SSO_ADMIN_PERMISSIONS = Object.freeze(PERMISSIONS.map(({ key }) => key));

/** What a TopUp admin's gamedb account still lacks, as updateUser fields, or null. Adds only, and only ever to `user`'s own. */
export function topupAdminGrant(user) {
  const held = user.permissions || [];
  const fields = {};
  if (TOPUP_SSO_ADMIN_PERMISSIONS.some((key) => !held.includes(key))) fields.permissions = [...new Set([...held, ...TOPUP_SSO_ADMIN_PERMISSIONS])];
  if (user.role !== "admin") fields.role = "admin";
  return Object.keys(fields).length ? fields : null;
}
