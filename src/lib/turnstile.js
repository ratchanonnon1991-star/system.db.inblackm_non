const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5000;

export function getTurnstileConfig(env = process.env) {
  const requested = env.TURNSTILE_ENABLED === "true";
  const siteKey = String(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();
  const secretKey = String(env.TURNSTILE_SECRET_KEY || "").trim();
  const allowedHostnames = String(env.TURNSTILE_ALLOWED_HOSTNAMES || "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
  return {
    requested,
    enabled: requested && Boolean(siteKey) && Boolean(secretKey),
    siteKey,
    secretKey,
    allowedHostnames,
  };
}

export function clientIp(request) {
  const cloudflare = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  // The LAST hop, not the first: a client can put anything it wants at the
  // front of its own X-Forwarded-For header, and a proxy that appends
  // (nginx's default $proxy_add_x_forwarded_for) only ever adds the address
  // it actually saw the connection come from as the final entry. Reading the
  // first hop would mean trusting a value the visitor made up themselves. In
  // front of Cloudflare this branch is not reached at all — cf-connecting-ip
  // is set and is the one value a client cannot forge.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return "";
}

export async function verifyTurnstile({
  secretKey,
  token,
  ip = "",
  expectedAction = "login",
  allowedHostnames = [],
  fetchImpl = globalThis.fetch,
}) {
  const responseToken = String(token || "").trim();
  if (!secretKey || !responseToken || responseToken.length > 4096 || !fetchImpl) {
    return false;
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: responseToken,
  });
  if (ip) body.set("remoteip", ip);

  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const result = await response.json();
    if (result?.success !== true) return false;
    if (expectedAction && result.action !== expectedAction) return false;
    if (
      allowedHostnames.length &&
      !allowedHostnames.includes(String(result.hostname || "").toLowerCase())
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
