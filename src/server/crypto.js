import crypto from "crypto";

// AES-256-GCM at-rest encryption for connection passwords stored in
// gamedb_connections. Key comes from GAMEDB_ENC_KEY (any string) with a
// fallback derivation from the session secret so dev setups still work.
function getKey() {
  const source =
    process.env.GAMEDB_ENC_KEY ||
    process.env.SESSION_SECRET ||
    process.env.OTP_SECRET ||
    "gamedb-dev-secret";
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
