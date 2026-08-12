import { clientIp } from "@/lib/turnstile";

/** { ip, userAgent } for whoever made this request -- the two fields every
 * write that goes into gamedb_edit_log/gamedb_login_log wants alongside it,
 * pulled together once instead of at each of the dozen call sites. */
export function requestMeta(request) {
  return {
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent") || "",
  };
}
