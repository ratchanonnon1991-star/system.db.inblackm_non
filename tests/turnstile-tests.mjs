import {
  clientIp,
  getTurnstileConfig,
  verifyTurnstile,
} from "@/lib/turnstile.js";

let pass = 0;
const fail = [];
const ok = (name, condition) => (condition ? pass++ : fail.push(name));

let config = getTurnstileConfig({});
ok("disabled unless requested", !config.requested && !config.enabled);

config = getTurnstileConfig({ TURNSTILE_ENABLED: "true" });
ok("requested with missing keys fails closed", config.requested && !config.enabled);

config = getTurnstileConfig({
  TURNSTILE_ENABLED: "true",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: " site-key ",
  TURNSTILE_SECRET_KEY: " secret-key ",
  TURNSTILE_ALLOWED_HOSTNAMES: "systemdb.inblackm.com, localhost",
});
ok("enabled only with both keys", config.enabled);
ok("config trims keys", config.siteKey === "site-key" && config.secretKey === "secret-key");
ok("config normalizes allowed hostnames", config.allowedHostnames.join(",") === "systemdb.inblackm.com,localhost");

let fetchCalls = 0;
ok("missing token is rejected", !(await verifyTurnstile({
  secretKey: "secret",
  token: "",
  fetchImpl: async () => { fetchCalls += 1; },
})));
ok("missing token skips network", fetchCalls === 0);

let sentBody = null;
const accepted = await verifyTurnstile({
  secretKey: "secret",
  token: " token ",
  ip: "203.0.113.8",
  fetchImpl: async (_url, options) => {
    sentBody = options.body;
    return { ok: true, json: async () => ({ success: true, action: "login", hostname: "systemdb.inblackm.com" }) };
  },
  allowedHostnames: ["systemdb.inblackm.com"],
});
ok("successful login challenge is accepted", accepted);
ok("siteverify receives token", sentBody.get("response") === "token");
ok("siteverify receives client ip", sentBody.get("remoteip") === "203.0.113.8");

ok("wrong action is rejected", !(await verifyTurnstile({
  secretKey: "secret",
  token: "token",
  fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, action: "register" }) }),
})));
ok("unexpected hostname is rejected", !(await verifyTurnstile({
  secretKey: "secret",
  token: "token",
  allowedHostnames: ["systemdb.inblackm.com"],
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({ success: true, action: "login", hostname: "example.com" }),
  }),
})));
ok("non-success response is rejected", !(await verifyTurnstile({
  secretKey: "secret",
  token: "token",
  fetchImpl: async () => ({ ok: true, json: async () => ({ success: false }) }),
})));
ok("network failure is rejected", !(await verifyTurnstile({
  secretKey: "secret",
  token: "token",
  fetchImpl: async () => { throw new Error("offline"); },
})));

const headersOf = (entries) => ({ headers: new Headers(entries) });
ok("prefers Cloudflare client ip", clientIp(headersOf({
  "cf-connecting-ip": "198.51.100.4",
  "x-real-ip": "198.51.100.5",
})) === "198.51.100.4");
ok("uses nearest forwarded hop", clientIp(headersOf({
  "x-forwarded-for": "198.51.100.6, 10.0.0.2",
})) === "10.0.0.2");

console.log(`${pass} passed, ${fail.length} failed`);
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
