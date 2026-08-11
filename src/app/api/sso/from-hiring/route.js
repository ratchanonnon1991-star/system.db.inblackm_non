import { NextResponse } from "next/server";
import { getSessionCookieOptions, SESSION_COOKIE, signSessionToken } from "@/lib/session";
import { getGamedbBaseUrl, getHiringBaseUrl, getSsoSecret } from "@/lib/hiring-sso";
import {
  findGamedbUsernameByHiringEmail,
  provisionSsoUser,
} from "@/server/gamedb-sso-map-repository";
import { findUserByUsername } from "@/server/users-repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Landed on by a plain browser redirect from hiring's /api/sso/gamedb, never
 * a fetch -- there is no cookie of hiring's for gamedb to read anyway, only
 * the one-time code hiring put in the URL. The code is exchanged for an
 * email server-to-server (see getHiringBaseUrl/getSsoSecret). A first-time
 * email gets a "user"-role gamedb account provisioned on the spot -- hiring
 * already verified the person owns it, so there is nothing an Admin needs to
 * approve to let them in, only something an Admin may want to upgrade
 * afterward if this person should have more than the least-privileged role.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  // Not request.url: behind nginx, that is usually the internal upstream
  // address (e.g. localhost:5589), not the public host in the browser's
  // address bar -- see getGamedbBaseUrl for why that matters here.
  const origin = getGamedbBaseUrl();
  const failure = (reason) => NextResponse.redirect(new URL(`/?ssoError=${reason}`, origin));

  if (!code) return failure("missing_code");

  let email = "";
  try {
    const response = await fetch(`${getHiringBaseUrl()}/api/sso/gamedb/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gamedb-sso-secret": getSsoSecret(),
      },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      // 401 means the two apps' GAMEDB_SSO_SECRET don't match; 410 means the
      // code was already used or its 60s TTL passed. Both reach the user as
      // the same generic message, but this is what tells them apart on the
      // server without needing hiring's own logs too.
      console.error(
        `hiring SSO exchange rejected: HTTP ${response.status}` +
          (response.status === 401 ? " (GAMEDB_SSO_SECRET mismatch between the two apps)" : "")
      );
      return failure("code_rejected");
    }
    const data = await response.json();
    email = String(data.email || "").trim();
  } catch (err) {
    console.error("hiring SSO exchange failed", err);
    return failure("exchange_failed");
  }
  if (!email) return failure("code_rejected");

  const username = await findGamedbUsernameByHiringEmail(email);
  let user = username ? await findUserByUsername(username) : null;
  if (!user) {
    try {
      user = await provisionSsoUser(email);
    } catch (err) {
      console.error("failed to provision a gamedb account for hiring SSO", err);
      return failure("provision_failed");
    }
  }

  const token = signSessionToken({
    sub: user.id,
    username: user.username,
    role: user.role,
  });
  const response = NextResponse.redirect(new URL("/systemdb", origin));
  response.cookies.set(SESSION_COOKIE, token, getSessionCookieOptions());
  return response;
}
