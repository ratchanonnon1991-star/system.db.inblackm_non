import { jsonError, jsonOk } from "@/lib/http";
import {
  getSessionCookieOptions,
  SESSION_COOKIE,
  signSessionToken,
} from "@/lib/session";
import { verifyPassword } from "@/server/passwords";
import { findUserByUsername } from "@/server/users-repository";
import {
  countRecentFailedLogins,
  MAX_ATTEMPTS_PER_IP,
  MAX_ATTEMPTS_PER_USERNAME,
  RATE_LIMIT_WINDOW_MS,
  recordLogin,
} from "@/server/gamedb-login-log";
import { requestMeta } from "@/lib/request-meta";
import {
  clientIp,
  getTurnstileConfig,
  verifyTurnstile,
} from "@/lib/turnstile";

// Logging an attempt must never be why an attempt fails -- a hiccup writing
// to gamedb_login_log would otherwise turn a correct password into a raw 500,
// or a wrong one into a confusing server error instead of "wrong password".
async function recordLoginSafely(entry) {
  try {
    await recordLogin(entry);
  } catch (err) {
    console.error("recordLogin failed:", err);
  }
}

// Brute-force guard, counted straight from gamedb_login_log rather than an
// in-memory Map: a Map resets on every PM2 restart/deploy (an attacker could
// just wait one out) and never saw attempts spread across many usernames
// from one address. Two thresholds -- one attacker hammering a single
// account is caught by the tighter one; one attacker cycling through many
// usernames from one IP (credential stuffing) is caught by the looser one,
// kept loose enough that a shared office NAT address does not lock everyone
// out over normal typos. Thresholds live in gamedb-login-log.js, shared with
// the /log page's "someone is being blocked right now" alert so the two can
// never disagree about what counts as blocked.

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
    const ip = clientIp(request);
    if (turnstile.enabled) {
      const accepted = await verifyTurnstile({
        secretKey: turnstile.secretKey,
        token: body.turnstileToken,
        ip,
        allowedHostnames: turnstile.allowedHostnames,
      });
      if (!accepted) {
        return jsonError("ยืนยันว่าไม่ใช่โปรแกรมอัตโนมัติไม่สำเร็จ กรุณาลองใหม่", 400);
      }
    }

    const recent = await countRecentFailedLogins({
      username,
      ip,
      since: new Date(Date.now() - RATE_LIMIT_WINDOW_MS),
    });
    if (recent.byUsername >= MAX_ATTEMPTS_PER_USERNAME || recent.byIp >= MAX_ATTEMPTS_PER_IP) {
      return jsonError("พยายามเข้าสู่ระบบบ่อยเกินไป ลองใหม่ใน 10 นาที", 429);
    }

    const user = await findUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      await recordLoginSafely({
        username,
        success: false,
        reason: "username หรือรหัสผ่านไม่ถูกต้อง",
        ...requestMeta(request),
      });
      return jsonError("username หรือรหัสผ่านไม่ถูกต้อง", 401);
    }

    await recordLoginSafely({
      username: user.username,
      success: true,
      ...requestMeta(request),
    });
    const token = signSessionToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
    const publicUser = { ...user };
    delete publicUser.passwordHash;
    const response = jsonOk({ user: publicUser });
    response.cookies.set(SESSION_COOKIE, token, getSessionCookieOptions());
    return response;
  } catch (err) {
    console.error(err);
    return jsonError("เข้าสู่ระบบไม่สำเร็จ", 500);
  }
}
