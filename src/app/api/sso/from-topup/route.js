import { NextResponse } from "next/server";
import { getSessionCookieOptions, SESSION_COOKIE, signSessionToken } from "@/lib/session";
import { getGamedbBaseUrl } from "@/lib/hiring-sso";
import { getTopupBaseUrl, getTopupSsoSecret, TOPUP_SSO_ROLES } from "@/lib/topup-sso";
import { findOrProvisionSsoUser } from "@/server/gamedb-sso-map-repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Landed on by a browser redirect from TopUp's /admin/tools-sso, with a
 * one-time code (or ?ssoError= when TopUp refused). The code is exchanged
 * for the account's email and role server-to-server. TopUp admin/staff only;
 * the email signs in as the gamedb account it is mapped to or named after,
 * or a new "user"-role account an Admin can upgrade later.
 */
export async function GET(request) {
  const url = new URL(request.url);
  // Not request.url's origin: behind the proxy that is the internal upstream.
  const origin = getGamedbBaseUrl();
  const failure = (reason) => NextResponse.redirect(new URL(`/?ssoError=${reason}`, origin));

  const refused = url.searchParams.get("ssoError");
  if (refused) return failure(refused === "not_staff" ? "not_staff" : "topup_unavailable");
  const code = url.searchParams.get("code") || "";
  if (!code) return failure("missing_code");

  let account;
  try {
    const response = await fetch(`${getTopupBaseUrl()}/api/sso/tools/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tools-sso-secret": getTopupSsoSecret() },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      // 401: the two apps' secrets differ. 410: the code was spent or expired. 403: no longer staff.
      console.error(`TopUp SSO exchange rejected: HTTP ${response.status}${response.status === 401 ? " (TOPUP_SSO_SECRET differs from TopUp's TOOLS_SSO_SECRET)" : ""}`);
      return failure(response.status === 403 ? "not_staff" : "code_rejected");
    }
    account = await response.json();
  } catch (err) {
    console.error("TopUp SSO exchange failed", err);
    return failure("exchange_failed");
  }

  const email = String(account?.email || "").trim().toLowerCase();
  if (!email) return failure("code_rejected");
  if (!TOPUP_SSO_ROLES.includes(String(account?.role || "").toLowerCase())) return failure("not_staff");

  let user;
  try {
    ({ user } = await findOrProvisionSsoUser(email));
  } catch (err) {
    console.error("failed to find or provision a gamedb account for TopUp SSO", err);
    return failure("provision_failed");
  }
  if (!user) return failure("provision_failed");

  const token = signSessionToken({ sub: user.id, username: user.username, role: user.role });
  const response = NextResponse.redirect(new URL("/", origin));
  response.cookies.set(SESSION_COOKIE, token, getSessionCookieOptions());
  return response;
}
