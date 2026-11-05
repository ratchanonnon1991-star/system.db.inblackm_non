import { cookies } from "next/headers";
import { cache } from "react";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { findUserById } from "@/server/users-repository";

/** The logged-in user for a server component, or null. Reads the session
 * cookie the same way every gated page does — cookies() cannot be read in
 * parallel with other cookies() calls in some Next versions, so this is a
 * single shared place to get it right once. React cache deduplicates within
 * one server render/request only; it never retains grants across users or requests. */
export const getSessionUser = cache(async function getSessionUser() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  return session?.sub ? await findUserById(session.sub) : null;
});
