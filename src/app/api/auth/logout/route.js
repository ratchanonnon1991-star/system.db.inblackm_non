import { jsonOk } from "@/lib/http";
import { getSessionCookieOptions, SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const response = jsonOk({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}
