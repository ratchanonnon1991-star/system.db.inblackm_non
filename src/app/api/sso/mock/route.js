import { NextResponse } from "next/server";
import { getSessionCookieOptions, SESSION_COOKIE, signSessionToken } from "@/lib/session";
import { PERMISSION_PRESETS } from "@/lib/permissions";
import {
  findGamedbUsernameByHiringEmail,
  provisionSsoUser,
} from "@/server/gamedb-sso-map-repository";
import { findUserByUsername, updateUser } from "@/server/users-repository";

const MOCK_EMAIL = "mock.experience@example.test";
// ?as=reviewer: a second account, a GameInfo admin, for anything that needs
// two people, such as a listing checked by someone other than who listed it.
const MOCK_REVIEWER_EMAIL = "mock.reviewer@example.test";

export async function GET(request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const reviewer = request.nextUrl.searchParams.get("as") === "reviewer";
  const email = reviewer ? MOCK_REVIEWER_EMAIL : MOCK_EMAIL;
  const username = await findGamedbUsernameByHiringEmail(email);
  let user = username ? await findUserByUsername(username) : null;
  if (!user) {
    user = await provisionSsoUser(email);
    user = await updateUser(user.id, { permissions: reviewer ? PERMISSION_PRESETS.gameinfoAdmin : PERMISSION_PRESETS.projectmTopup });
  }

  const token = signSessionToken({ sub: user.id, username: user.username, role: user.role });
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(SESSION_COOKIE, token, getSessionCookieOptions());
  return response;
}
