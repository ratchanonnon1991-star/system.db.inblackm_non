import strict from "node:assert/strict";
import { readFileSync } from "node:fs";
import { russiaCheckDisplayStatus, russiaCheckRecentBounds, RUSSIA_CHECK_RECENT_MS } from "@/lib/gameinfo-russia-check-recency";
let assertions = 0;
const assert = new Proxy(strict, { get(target, key) { return (...args) => { assertions++; return target[key](...args); }; } });

const pack = { status: "active", activatedAt: "2026-09-03T23:00:00+07:00" };
for (const time of ["2026-09-03T23:00:00+07:00", "2026-09-04T00:00:00+07:00", "2026-09-04T09:00:00+07:00", "2026-09-04T22:59:59.999+07:00"]) {
  assert.equal(russiaCheckDisplayStatus(pack, time), "added");
  // The pack and log use the same rolling interval (start, end].
  const bounds = russiaCheckRecentBounds(time);
  assert.ok(new Date(pack.activatedAt) > new Date(bounds.startAt));
  assert.ok(new Date(pack.activatedAt) <= new Date(bounds.endAt));
  assert.equal(new Date(bounds.endAt) - new Date(bounds.startAt), RUSSIA_CHECK_RECENT_MS);
}
const expiry = "2026-09-04T23:00:00+07:00";
assert.equal(russiaCheckDisplayStatus(pack, expiry), "unchanged");
assert.equal(new Date(pack.activatedAt).getTime(), new Date(russiaCheckRecentBounds(expiry).startAt).getTime());
assert.equal(russiaCheckDisplayStatus({ ...pack, lastSeenAt: expiry }, expiry), "unchanged");
assert.equal(russiaCheckDisplayStatus({ ...pack, lastScheduledAt: "2026-09-04T09:00:00+07:00" }, "2026-09-04T12:00:00+07:00"), "added");
assert.equal(russiaCheckDisplayStatus({ ...pack, status: "removed" }, pack.activatedAt), "removed");
assert.equal(russiaCheckDisplayStatus({ ...pack, status: "pending_removal" }, pack.activatedAt), "added");
assert.equal(russiaCheckDisplayStatus({ ...pack, activatedAt: expiry }, expiry), "added");
assert.equal(russiaCheckDisplayStatus({ status: "active", firstSeenAt: pack.activatedAt }, pack.activatedAt), "added");
assert.equal(russiaCheckDisplayStatus(pack, "2026-09-03T22:59:59+07:00"), "unchanged");
assert.equal(russiaCheckDisplayStatus({ status: "active", activatedAt: "invalid" }, expiry), "unchanged");
assert.equal(russiaCheckDisplayStatus({ status: "active" }, expiry), "unchanged");
const page = readFileSync(new URL("../src/components/gameinfo-russia-check-page.js", import.meta.url), "utf8");
assert.match(page, /russiaCheckDisplayStatus\(item, dashboard.dailyLog\?\.endAt\)/);
assert.match(page, /setInterval[\s\S]*60_000/);
assert.match(page, /cancelled = true; clearInterval\(timer\)/);
assert.match(page, /requestId === loadRequest.current/);
assert.doesNotMatch(page, /lastScheduledAt/);
console.log(`${assertions} passed`);
