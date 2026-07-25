import crypto from "crypto";

// gamedb ไม่มีหน้า login ของตัวเอง — ตรวจ cookie "inblackm_session" ที่ inblackm
// เซ็นด้วย HMAC ใบเดียวกัน (secret ต้องตรงกับฝั่ง inblackm)
export const SESSION_COOKIE = "inblackm_session";

function getSecret() {
  return process.env.SESSION_SECRET || process.env.OTP_SECRET || "inblackm-dev-secret";
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
