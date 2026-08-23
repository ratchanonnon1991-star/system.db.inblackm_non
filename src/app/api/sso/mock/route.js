import { NextResponse } from "next/server";
import { getSessionCookieOptions, SESSION_COOKIE, signSessionToken } from "@/lib/session";
import { PERMISSION_PRESETS } from "@/lib/permissions";
import {
  findGamedbUsernameByHiringEmail,
  provisionSsoUser,
} from "@/server/gamedb-sso-map-repository";
import { findUserByUsername, updateUser } from "@/server/users-repository";

const MOCK_EMAIL = "mock.experience@example.test";

export async function GET(request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const username = await findGamedbUsernameByHiringEmail(MOCK_EMAIL);
  let user = username ? await findUserByUsername(username) : null;
  if (!user) {
    user = await provisionSsoUser(MOCK_EMAIL);
    user = await updateUser(user.id, { permissions: PERMISSION_PRESETS.projectmTopup });
  }

  const token = signSessionToken({ sub: user.id, username: user.username, role: user.role });
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(SESSION_COOKIE, token, getSessionCookieOptions());
  return response;
}
