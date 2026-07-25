import { jsonError, jsonOk } from "@/lib/http";
import {
  getSessionCookieOptions,
  SESSION_COOKIE,
  signSessionToken,
} from "@/lib/session";
import { verifyPassword } from "@/server/passwords";
import { findUserByUsername } from "@/server/users-repository";

// In-memory brute-force guard: max attempts per username within the window.
// Good enough for a single PM2 instance; resets on process restart.
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map();

function tooManyAttempts(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
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

    if (tooManyAttempts(username.toLowerCase())) {
      return jsonError("พยายามเข้าสู่ระบบบ่อยเกินไป ลองใหม่ใน 10 นาที", 429);
    }

    const user = await findUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return jsonError("username หรือรหัสผ่านไม่ถูกต้อง", 401);
    }

    attempts.delete(username.toLowerCase());
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
