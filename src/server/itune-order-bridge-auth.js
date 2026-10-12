import { createHmac, timingSafeEqual } from "node:crypto";

export function bridgeSignature(secret, timestamp, body) {
  return createHmac("sha256", secret).update(`${timestamp}\n${body}`).digest("hex");
}

export function verifyBridgeRequest(headers, body, secret = process.env.ITUNE_ORDER_BRIDGE_SECRET, now = Date.now()) {
  if (!secret || secret.length < 32) throw Object.assign(new Error("ยังไม่ได้ตั้งค่า Order bridge"), { status: 503 });
  const timestamp = headers.get("x-itune-timestamp") || "";
  const signature = headers.get("x-itune-signature") || "";
  if (!/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 60_000 || !/^[a-f0-9]{64}$/.test(signature)) {
    throw Object.assign(new Error("Invalid bridge authorization"), { status: 401 });
  }
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(bridgeSignature(secret, timestamp, body), "hex"))) {
    throw Object.assign(new Error("Invalid bridge authorization"), { status: 401 });
  }
}
