import assert from "node:assert/strict";
import { diffPricePages, pricePageFingerprint, samePricePage, settlePricePage } from "@/lib/gameinfo-price-diff.js";
import { DAILY_REFRESH_UTC_HOUR, msUntilNextDailyRefresh } from "@/lib/gameinfo-pack-market.js";

const offer = (seller, price, extra = {}) => ({ seller, price, currency: "THB", stock: 10, sold: 3, rating: 4.9, ...extra });
const page = (groups, fetchedAt = "2026-08-27T12:00:00.000Z") => ({ fetchedAt, groups });
const base = () => page([
  { key: "g1", offers: [offer("A", 100), offer("B", 120)] },
  { key: "g2", offers: [offer("A", 200)] },
]);

// Same data, fresh timestamp: not a change.
assert.equal(samePricePage(base(), page(base().groups, "2026-08-27T13:00:00.000Z")), true);
assert.equal(diffPricePages(base(), base()).size, 0);

// Offers are sorted by price, so equal prices can swap places. Keyed by seller,
// that is a non-event.
const swapped = page([
  { key: "g1", offers: [offer("B", 120), offer("A", 100)] },
  { key: "g2", offers: [offer("A", 200)] },
]);
assert.equal(samePricePage(base(), swapped), true);
// Groups arriving in a different order are the same result too.
assert.equal(samePricePage(base(), page([...base().groups].reverse())), true);

// A price move is a change, and only that cell is marked.
const priced = base();
priced.groups[0].offers[1].price = 130;
assert.equal(samePricePage(base(), priced), false);
assert.deepEqual([...diffPricePages(base(), priced)], ["g1:B"]);

// Stock, sold and rating count as data — rating is headed for the table.
for (const [field, value] of [["stock", 4], ["sold", 99], ["rating", 4.1], ["delivery", "Instant"]]) {
  const moved = base();
  moved.groups[0].offers[0][field] = value;
  assert.equal(samePricePage(base(), moved), false, field);
  assert.deepEqual([...diffPricePages(base(), moved)], ["g1:A"], field);
}

// Ids, URLs and images are noise: the same listing can come back under a new id.
const relisted = base();
relisted.groups[0].offers[0] = { ...relisted.groups[0].offers[0], itemId: "999", productUrl: "https://x/999", imageUrl: "https://x/9.png" };
assert.equal(samePricePage(base(), relisted), true);

// A seller that was not there before is new, not changed.
const joined = base();
joined.groups[0].offers.push(offer("C", 90));
assert.equal(samePricePage(base(), joined), false);
assert.equal(diffPricePages(base(), joined).size, 0);
// So is a whole new pack group.
const added = base();
added.groups.push({ key: "g3", offers: [offer("A", 300)] });
assert.equal(diffPricePages(base(), added).size, 0);

// Nothing to compare against yet.
assert.equal(samePricePage(null, base()), false);
assert.equal(diffPricePages(null, base()).size, 0);
assert.equal(pricePageFingerprint(undefined), "[]");

// settlePricePage keeps the old page — and its fetchedAt — when nothing moved,
// and records when we last looked either way.
const previous = base();
const unchanged = settlePricePage(previous, page(base().groups, "2026-08-27T13:00:00.000Z"));
assert.equal(unchanged.unchanged, true);
assert.equal(unchanged.fetchedAt, "2026-08-27T12:00:00.000Z");
assert.equal(unchanged.checkedAt, "2026-08-27T13:00:00.000Z");

const changed = settlePricePage(previous, page(priced.groups, "2026-08-27T13:00:00.000Z"));
assert.equal(changed.unchanged, false);
assert.equal(changed.fetchedAt, "2026-08-27T13:00:00.000Z");
assert.equal(changed.checkedAt, "2026-08-27T13:00:00.000Z");

const first = settlePricePage(undefined, base());
assert.equal(first.unchanged, false);
assert.equal(first.checkedAt, "2026-08-27T12:00:00.000Z");

// The daily refresh lands at 09:00 Thailand time, which is 02:00 UTC, whatever
// timezone the browser is in.
assert.equal(DAILY_REFRESH_UTC_HOUR, 2);
const at = (iso) => Date.parse(iso);
assert.equal(msUntilNextDailyRefresh(at("2026-08-27T01:00:00.000Z")), 60 * 60 * 1000);
assert.equal(msUntilNextDailyRefresh(at("2026-08-27T02:00:00.000Z")), 24 * 60 * 60 * 1000);
assert.equal(msUntilNextDailyRefresh(at("2026-08-27T03:00:00.000Z")), 23 * 60 * 60 * 1000);
// Across a month boundary it still resolves to the next calendar day.
assert.equal(msUntilNextDailyRefresh(at("2026-08-31T23:00:00.000Z")), 3 * 60 * 60 * 1000);

// Every market de-duplicates through the same helper, now inside the shared
// store that keeps the page in the database between refreshes.
import { readFileSync } from "node:fs";
const store = readFileSync(new URL("../src/server/gameinfo-price-page-store.js", import.meta.url), "utf8");
assert.match(store, /settlePricePage\(stored, normalize\(await load\(\)\)\)/);
for (const file of ["itemku-prices", "kaleoz-zepeto", "g2g-prices"]) {
  const source = readFileSync(new URL(`../src/server/${file}.js`, import.meta.url), "utf8");
  assert.match(source, /resolveGameinfoPricePage\(\{/);
}
const kaleoz = readFileSync(new URL("../src/server/kaleoz-zepeto.js", import.meta.url), "utf8");
assert.match(kaleoz, /normalize: normalizeKaleozCategoryLabels/);

// The page keeps what is on screen when the refresh brought back the same data.
const compare = readFileSync(new URL("../src/components/gameinfo-pack-price-compare.js", import.meta.url), "utf8");
assert.match(compare, /if \(data\.page\?\.unchanged\) \{[\s\S]*setRefreshNotice\([\s\S]*return;/);
assert.match(compare, /setChangedCells\(diffPricePages\(pageRef\.current, data\.page\)\)/);
assert.match(compare, /setTimeout\(\(\) => setChangedCells\(new Set\(\)\), CHANGED_HIGHLIGHT_MS\)/);
assert.match(compare, /isChanged=\{changedCells\.has\(`\$\{group\.key\}:\$\{seller\}`\)\}/);

// A manual refresh asks first; the daily run does not.
assert.match(compare, /onClick=\{\(\) => setRefreshPrompt\("manual"\)\}/);
assert.match(compare, /refreshPrices\(\);\s*timer = window\.setTimeout\(run, msUntilNextDailyRefresh\(\)\)/);
assert.match(compare, /function confirmRefresh\(\) \{\s*setRefreshPrompt\(null\);\s*refreshPrices\(\);/);
assert.doesNotMatch(compare, /setInterval\(refreshPrices/);

console.log("\n51 passed");
