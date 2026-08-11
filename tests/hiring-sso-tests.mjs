import assert from "node:assert/strict";
import { getHiringBaseUrl, getSsoSecret } from "@/lib/hiring-sso.js";

let passed = 0;
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  passed += 1;
}

check(
  "trims a trailing slash off the configured base URL",
  getHiringBaseUrl({ HIRING_BASE_URL: "https://experience.inblackm.com/" }),
  "https://experience.inblackm.com"
);
check(
  "falls back to the public var if the server-only one is unset",
  getHiringBaseUrl({ NEXT_PUBLIC_HIRING_BASE_URL: "https://experience.inblackm.com" }),
  "https://experience.inblackm.com"
);
assert.throws(
  () => getHiringBaseUrl({}),
  /HIRING_BASE_URL/,
  "no configured URL at all is a hard error, not a silent empty string"
);
passed += 1;

check(
  "uses the configured secret",
  getSsoSecret({ GAMEDB_SSO_SECRET: "shared-secret" }),
  "shared-secret"
);
check(
  "falls back to a dev secret outside production",
  getSsoSecret({}),
  "gamedb-sso-dev-secret"
);
assert.throws(
  () => getSsoSecret({ NODE_ENV: "production" }),
  /GAMEDB_SSO_SECRET/,
  "a missing secret in production must not silently fall back to the dev value"
);
passed += 1;

console.log(`${passed} passed`);
