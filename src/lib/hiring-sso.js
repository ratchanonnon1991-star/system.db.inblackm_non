// gamedb's half of the login bridge with hiring (see
// src/server/gamedb-sso-map-repository.js and /api/sso/from-hiring). hiring's
// admin login is OTP-to-a-real-inbox; gamedb's is a plain password with no
// email step -- trust flows from the stronger-verified side into the weaker
// one, so hiring is the one that issues codes and gamedb is the one that
// redeems them, never the other way.

/** The secret that authenticates the server-to-server code exchange with
 * hiring. Unrelated to either app's own session-signing secret: leaking it
 * lets someone redeem a code they already have, not mint a session directly. */
export function getSsoSecret(env = process.env) {
  const secret = env.GAMEDB_SSO_SECRET;
  if (env.NODE_ENV === "production" && !secret) {
    throw new Error("GAMEDB_SSO_SECRET ยังไม่ได้ตั้งใน .env");
  }
  return secret || "gamedb-sso-dev-secret";
}

// The redirect target after a successful exchange (or ?ssoError=<code> after
// a failed one) never names hiring's actual URL -- only that this app knows
// about it. Kept here purely for the server-to-server call; the messages
// shown for each error code live with the login screen that renders them
// (src/app/page.js), not here, so this file stays server-only.
export function getHiringBaseUrl(env = process.env) {
  const url = env.HIRING_BASE_URL || env.NEXT_PUBLIC_HIRING_BASE_URL;
  if (!url) {
    throw new Error("HIRING_BASE_URL ยังไม่ได้ตั้งใน .env");
  }
  return url.replace(/\/+$/, "");
}
