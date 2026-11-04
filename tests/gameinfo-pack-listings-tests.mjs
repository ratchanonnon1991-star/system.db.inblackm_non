import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  gameinfoListingChannels,
  gameinfoListingEffective,
  isGameinfoListingUrl,
  parseGameinfoListingPrice,
  summarizeGameinfoPackListings,
} from "@/lib/gameinfo-pack-listings";
import {
  listGamelistPackListings,
  reviewGamelistPackListing,
  saveGamelistPackListing,
} from "@/server/gameinfo-pack-listings";
import { reset, setResponder } from "@/lib/db.js";

assert.deepEqual(summarizeGameinfoPackListings([]), { ok: 0, pending: 0, wrong: 0, tone: "none", label: "ยังไม่ลง" });
assert.equal(summarizeGameinfoPackListings([{ status: "ok" }, { status: "ok" }]).label, "ตรวจครบ");
assert.equal(summarizeGameinfoPackListings([{ status: "ok" }, { status: "pending" }, { status: "pending" }]).label, "รอตรวจ 2");
assert.equal(summarizeGameinfoPackListings([{ status: "pending" }, { status: "wrong" }]).label, "ราคาผิด 1", "a wrong price outranks one waiting");

assert.deepEqual(gameinfoListingChannels([{ channel: "kaleoz", status: "open" }, { channel: "g2g", status: "removed" }]).map((channel) => channel.key), ["kaleoz"], "only channels the game sells on");
assert.ok(gameinfoListingChannels([]).length > 5, "a game without sales channel rows gets every channel");
assert.equal(parseGameinfoListingPrice("฿1,250"), 1250);
assert.equal(parseGameinfoListingPrice(""), null);
assert.ok(Number.isNaN(parseGameinfoListingPrice("abc")));
assert.ok(isGameinfoListingUrl("https://www.kaleoz.com/x") && isGameinfoListingUrl("") && !isGameinfoListingUrl("javascript:alert(1)"));

const row = { pack_id: "a", channel: "kaleoz", url: "https://k.example/a", listed_price: "90.00", listed_by: "nok", listed_at: "2026-11-04T05:00:00Z", status: "pending", checked_price: null, reviewed_by: "", reviewed_at: null, note: "" };
const queries = [];
reset();
setResponder((text, params) => {
  queries.push({ text, params });
  if (/SELECT listed_by FROM/.test(text)) return { rows: params[2] === "a" ? [{ listed_by: "nok" }] : [] };
  if (/SELECT .* FROM gamelist_pack_listings/s.test(text)) return { rows: [row] };
  // The stub counts the rows given as rowCount.
  if (/UPDATE gamelist_pack_listings/.test(text)) return { rows: params[2] === "a" ? [{}] : [] };
  return { rows: [] };
});

const listed = await listGamelistPackListings(3, "uid");
assert.equal(listed[0].listedPrice, 90, "prices come back as numbers");
assert.equal(listed[0].listedAt, "2026-11-04T05:00:00.000Z");

await saveGamelistPackListing(3, "uid", { packId: "a", channel: "kaleoz", url: "https://k.example/a", listedPrice: "95" }, "nok");
const upsert = queries.find((query) => /INSERT INTO gamelist_pack_listings/.test(query.text));
assert.ok(/status = 'pending'/.test(upsert.text) && /reviewed_by = ''/.test(upsert.text), "a changed listing waits for a new check");
assert.deepEqual(upsert.params.slice(0, 7), [3, "uid", "a", "kaleoz", "https://k.example/a", 95, "nok"]);

queries.length = 0;
await saveGamelistPackListing(3, "uid", { packId: "a", channel: "kaleoz", url: "", listedPrice: "" }, "nok");
assert.ok(/DELETE FROM gamelist_pack_listings/.test(queries[0].text), "no link and no price removes the listing");

await assert.rejects(saveGamelistPackListing(3, "uid", { packId: "a", channel: "ebay", url: "" }, "nok"), /ช่องทางขาย/);
await assert.rejects(saveGamelistPackListing(3, "uid", { packId: "a", channel: "kaleoz", url: "ftp://x" }, "nok"), /ลิงก์/);
await assert.rejects(reviewGamelistPackListing(3, "uid", { packId: "a", channel: "kaleoz", status: "pending" }, "tan"), /ผลการตรวจ/, "a check is right or wrong");
await assert.rejects(reviewGamelistPackListing(3, "uid", { packId: "b", channel: "kaleoz", status: "ok" }, "tan"), /ยังไม่มีการลงสินค้า/, "nothing to check where nothing is listed");
await assert.rejects(reviewGamelistPackListing(3, "uid", { packId: "a", channel: "kaleoz", status: "ok" }, "nok"), /ตรวจเองไม่ได้/, "the one who listed it cannot check it");
await reviewGamelistPackListing(3, "uid", { packId: "a", channel: "kaleoz", status: "wrong", checkedPrice: "99", referencePrice: 90, note: "ราคาเก่า" }, "tan");
const review = queries.find((query) => /UPDATE gamelist_pack_listings/.test(query.text) && query.params[2] === "a");
assert.deepEqual(review.params, [3, "uid", "a", "kaleoz", "wrong", 99, 90, "tan", "ราคาเก่า"], "the check keeps the price it was made against");

const passed = { status: "ok", checkedReference: 90 };
assert.equal(gameinfoListingEffective(passed, 90).status, "ok", "a check holds while the price stays");
assert.equal(gameinfoListingEffective(passed, 95).status, "pending", "a moved price asks for a new check");
assert.ok(gameinfoListingEffective(passed, 95).stale);
assert.equal(gameinfoListingEffective({ status: "wrong", checkedReference: 90 }, 95).status, "wrong", "a wrong price stays wrong until it is listed again");

const route = readFileSync(new URL("../src/app/api/gameinfo/gamelist/[id]/listings/route.js", import.meta.url), "utf8");
assert.ok(route.includes("requireGameinfoReporter(request)") && route.includes("requireGameinfoEditor(request)"), "listing needs the report permission, checking an admin");
const packs = readFileSync(new URL("../src/server/gameinfo-gamelist-packs.js", import.meta.url), "utf8");
assert.ok(packs.includes("CREATE TABLE IF NOT EXISTS gamelist_pack_listings"), "the table is created with the others");

console.log("29 passed");
