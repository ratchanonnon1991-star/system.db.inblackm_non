import crypto from "crypto";

// gamedb signs its own session cookie now — no dependency on inblackm.
export const SESSION_COOKIE = "gamedb_session";

const IDLE_TIMEOUT_SECONDS = 60 * 60 * 24;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const DEV_SECRET = "gamedb-dev-secret";

/**
 * The key the session cookie is signed with.
 *
 * Falling back to a constant that ships in the repository is only acceptable
 * while developing: with it, anyone who knows the string can mint a cookie for
 * any user id, including an admin. In production that has to be a hard stop —
 * a missing variable would otherwise look like a perfectly healthy service.
 */
export function getSecret() {
  const secret = process.env.SESSION_SECRET || process.env.OTP_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ยังไม่ได้ตั้ง SESSION_SECRET ใน .env — ถ้าไม่ตั้ง cookie จะถูกเซ็นด้วยคีย์ที่อยู่ในโค้ด ใครก็ปลอมเป็น admin ได้"
    );
  }
  return DEV_SECRET;
}

function safeEqual(a, b) {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function computeExpiry(iat) {
  return Math.min(Date.now() + IDLE_TIMEOUT_SECONDS * 1000, iat + MAX_AGE_SECONDS * 1000);
}

export function signSessionToken(payload) {
  const iat = payload.iat ?? Date.now();
  const data = { ...payload, iat, exp: computeExpiry(iat) };
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token) {
  if (!token) return null;

  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) return null;

  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: IDLE_TIMEOUT_SECONDS,
  };
}
