import crypto from "crypto";

// scrypt password hashing (built into Node — no native deps).
// Stored format: scrypt$<N>$<salt b64>$<hash b64>
const SCRYPT_N = 16384;
const KEY_LEN = 64;

export function hashPassword(plainText) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plainText), salt, KEY_LEN, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(plainText, stored) {
  try {
    const [scheme, nStr, saltB64, hashB64] = String(stored || "").split("$");
    if (scheme !== "scrypt") return false;
    const expected = Buffer.from(hashB64, "base64");
    const actual = crypto.scryptSync(
      String(plainText),
      Buffer.from(saltB64, "base64"),
      expected.length,
      { N: Number(nStr) }
    );
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
