import crypto from "crypto";

// AES-256-GCM at-rest encryption for connection passwords stored in
// gamedb_connections. Key comes from GAMEDB_ENC_KEY (any string) with a
// fallback derivation from the session secret so dev setups still work.
function getKey() {
  const source =
    process.env.GAMEDB_ENC_KEY || process.env.SESSION_SECRET || process.env.OTP_SECRET;
  if (!source) {
    // The old fallback was a constant in this file, which would have encrypted
    // every saved database password under a key anyone reading the repository
    // already has. Refusing is the only sane answer in production.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ยังไม่ได้ตั้ง GAMEDB_ENC_KEY (หรือ SESSION_SECRET) ใน .env — เข้ารหัสรหัสผ่านของ connection ไม่ได้"
      );
    }
    return crypto.createHash("sha256").update("gamedb-dev-secret").digest();
  }
  return crypto.createHash("sha256").update(source).digest();
}

export function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload) {
  const [iv, tag, data] = String(payload || "").split(".");
  if (!iv || !tag || !data) {
    throw new Error("รูปแบบรหัสผ่านที่เข้ารหัสไม่ถูกต้อง");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function getRussiaCheckKey() {
  const source = process.env.RUSSIA_CHECK_SESSION_KEY || process.env.GAMEDB_ENC_KEY || process.env.SESSION_SECRET;
  if (!source) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ยังไม่ได้ตั้ง RUSSIA_CHECK_SESSION_KEY (หรือ GAMEDB_ENC_KEY) ใน environment");
    }
    return crypto.createHash("sha256").update("russia-check-session\0development-only").digest();
  }
  return crypto.createHash("sha256").update(`russia-check-session\0${source}`).digest();
}

export function encryptRussiaCheckSession(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getRussiaCheckKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptRussiaCheckSession(payload) {
  const [iv, tag, data] = String(payload || "").split(".");
  if (!iv || !tag || !data) throw new Error("รูปแบบ session ที่เข้ารหัสไม่ถูกต้อง");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getRussiaCheckKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
