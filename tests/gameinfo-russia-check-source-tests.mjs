import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getRussiaCheckSourceAvailability } from "@/lib/gameinfo-russia-check-source.js";
import { fetchRussiaCheckCatalog } from "@/server/gameinfo-russia-check.js";

const now = new Date("2026-09-03T03:00:00Z");
const infold = { provider: "infold", sourceEnabled: false, authRequired: true, authConfigured: true, authExpiresAt: "2026-10-01T00:00:00Z" };
const saved = getRussiaCheckSourceAvailability(infold, now);
assert.equal(saved.authState, "saved_unverified");
assert.equal(saved.authExpired, false);
assert.equal(saved.catalogSupported, true);
assert.match(saved.refreshBlockedReason, /Form Data/);
// Disprove both "expiry alone" and "just enable the source" fixes.
assert.equal(getRussiaCheckSourceAvailability({ ...infold, sourceEnabled: true }, now).refreshBlockedReason, saved.refreshBlockedReason);
assert.equal(getRussiaCheckSourceAvailability({ ...infold, authExpiresAt: null }, now).authState, "saved_unverified");
assert.equal(getRussiaCheckSourceAvailability({ ...infold, authConfigured: false }, now).authState, "missing");
assert.equal(getRussiaCheckSourceAvailability({ ...infold, authExpiresAt: now.toISOString() }, now).authState, "expired");
const sky = { provider: "xsolla", sourceEnabled: true, authRequired: false };
assert.equal(getRussiaCheckSourceAvailability(sky, now).refreshBlockedReason, "");
assert.equal(getRussiaCheckSourceAvailability(sky, now).authState, "not_required");
assert.match(getRussiaCheckSourceAvailability({ ...sky, sourceEnabled: false }, now).refreshBlockedReason, /ยังไม่เปิด/);
assert.match(getRussiaCheckSourceAvailability({ provider: "demo", isDemo: true }, now).refreshBlockedReason, /อ่านอย่างเดียว/);
assert.equal(getRussiaCheckSourceAvailability({ provider: "unknown", sourceEnabled: true }, now).catalogSupported, false);
let networkCalls = 0;
await assert.rejects(fetchRussiaCheckCatalog({ provider: "infold", source_url: "https://loveanddeepspace.infoldgames.com/charge/en-EN" }, {
  fetchImpl: async () => { networkCalls += 1; throw new Error("must not fetch"); },
}), { status: 409 });
assert.equal(networkCalls, 0);
const page = readFileSync(new URL("../src/components/gameinfo-russia-check-page.js", import.meta.url), "utf8");
assert.match(page, /verified[\s\S]*เชื่อมบัญชีแล้ว · ตรวจสอบผ่าน/);
assert.match(page, /บันทึก Session แล้ว · ยังไม่ตรวจสอบ/);
assert.match(page, /aria-describedby=\{refreshBlockedReason/);
const server = readFileSync(new URL("../src/server/gameinfo-russia-check.js", import.meta.url), "utf8");
assert.match(server, /s.provider='infold' AND c.credential_kind='infold' AND c.verified_at IS NOT NULL AND c.invalidated_at IS NULL/);
assert.ok(server.indexOf("if (!sources.rowCount)") < server.indexOf("const active = await pool.query"));
const verified = { ...infold, sourceEnabled: true, credentialKind: "infold", authVerifiedAt: now.toISOString() };
assert.equal(getRussiaCheckSourceAvailability(verified, now).authState, "verified");
assert.equal(getRussiaCheckSourceAvailability(verified, now).refreshBlockedReason, "");
assert.equal(getRussiaCheckSourceAvailability({ ...verified, authInvalidated: true }, now).authState, "invalid");
assert.notEqual(getRussiaCheckSourceAvailability({ ...verified, authInvalidated: true }, now).refreshBlockedReason, "");
assert.equal(getRussiaCheckSourceAvailability({ ...verified, authExpiresAt: now.toISOString() }, now).authState, "expired");
console.log("26 passed");
