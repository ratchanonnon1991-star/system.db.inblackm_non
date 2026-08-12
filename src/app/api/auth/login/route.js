import { jsonError, jsonOk } from "@/lib/http";
import {
  getSessionCookieOptions,
  SESSION_COOKIE,
  signSessionToken,
} from "@/lib/session";
import { verifyPassword } from "@/server/passwords";
import { findUserByUsername } from "@/server/users-repository";
import { recordLogin } from "@/server/gamedb-login-log";
import {
  clientIp,
  getTurnstileConfig,
  verifyTurnstile,
} from "@/lib/turnstile";

// In-memory brute-force guard: max attempts per username within the window.
// Good enough for a single PM2 instance; resets on process restart.
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map();

function tooManyAttempts(key) {
  const now = Date.now();
  // Nothing else ever removes a username that was tried once and abandoned, so
  // expired windows are swept here — otherwise a run through a username list
  // leaves an entry per name for as long as the process lives.
  for (const [name, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(name);
  }
  const entry = attempts.get(key);
  if (!entry) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) {
      return jsonError("กรุณากรอก username และรหัสผ่าน", 400);
    }

    const turnstile = getTurnstileConfig();
    if (turnstile.requested && !turnstile.enabled) {
      console.error("Turnstile is enabled but its site key or secret key is missing");
      return jsonError("ระบบตรวจสอบความปลอดภัยยังไม่พร้อม กรุณาติดต่อผู้ดูแล", 503);
    }
    if (turnstile.enabled) {
      const accepted = await verifyTurnstile({
        secretKey: turnstile.secretKey,
        token: body.turnstileToken,
        ip: clientIp(request),
        allowedHostnames: turnstile.allowedHostnames,
      });
      if (!accepted) {
        return jsonError("ยืนยันว่าไม่ใช่โปรแกรมอัตโนมัติไม่สำเร็จ กรุณาลองใหม่", 400);
      }
    }

    if (tooManyAttempts(username.toLowerCase())) {
      return jsonError("พยายามเข้าสู่ระบบบ่อยเกินไป ลองใหม่ใน 10 นาที", 429);
    }

    const user = await findUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      await recordLogin({
        username,
        success: false,
        reason: "username หรือรหัสผ่านไม่ถูกต้อง",
        ip: clientIp(request),
      });
      return jsonError("username หรือรหัสผ่านไม่ถูกต้อง", 401);
    }

    attempts.delete(username.toLowerCase());
    await recordLogin({ username: user.username, success: true, ip: clientIp(request) });
    const token = signSessionToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
    const response = jsonOk({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
    response.cookies.set(SESSION_COOKIE, token, getSessionCookieOptions());
    return response;
  } catch (err) {
    console.error(err);
    return jsonError("เข้าสู่ระบบไม่สำเร็จ", 500);
  }
}
