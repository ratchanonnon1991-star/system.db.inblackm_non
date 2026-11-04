import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  gameinfoListingChannels,
  gameinfoListingChanges,
  gameinfoListingEffective,
  gameinfoListingSnapshot,
  sanitizeGameinfoListingSnapshot,
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

assert.deepEqual(summarizeGameinfoPackListings([]), { ok: 0, pending: 0, wrong: 0, late: 0, tone: "none", label: "ยังไม่ลง" });
assert.equal(summarizeGameinfoPackListings([{ status: "ok" }, { status: "ok" }], 2).label, "ตรวจครบ");
assert.equal(summarizeGameinfoPackListings([{ status: "ok" }], 7).label, "ตรวจแล้ว 1/7", "one channel checked of seven is not all");
assert.equal(summarizeGameinfoPackListings([{ status: "ok" }, { status: "pending" }, { status: "pending" }]).label, "รอตรวจ 2");
assert.equal(summarizeGameinfoPackListings([{ status: "pending" }, { status: "wrong" }]).label, "ราคาผิด 1", "a wrong price outranks one waiting");

assert.deepEqual(gameinfoListingChannels([{ channel: "kaleoz", status: "open" }, { channel: "g2g", status: "removed" }]).map((channel) => channel.key), ["kaleoz"], "only channels the game sells on");
assert.deepEqual(gameinfoListingChannels([]), [], "a game with no sales channels set has no tabs");
assert.deepEqual(gameinfoListingChannels([{ channel: "kaleoz", status: "listing" }, { channel: "g2g", status: "closed" }, { channel: "russia", status: "paused" }]).map((channel) => channel.key), ["kaleoz", "russia"], "listing and paused count as sold on, closed does not");
assert.equal(parseGameinfoListingPrice("฿1,250"), 1250);
assert.equal(parseGameinfoListingPrice(""), null);
assert.ok(Number.isNaN(parseGameinfoListingPrice("abc")));
assert.ok(isGameinfoListingUrl("https://www.kaleoz.com/x") && isGameinfoListingUrl("") && !isGameinfoListingUrl("javascript:alert(1)"));

const row = { pack_id: "a", channel: "kaleoz", url: "https://k.example/a", listed_price: "90.00", listed_by: "nok", listed_at: "2026-11-04T05:00:00Z", status: "pending", checked_price: null, reviewed_by: "", reviewed_at: null, note: "", round: 2, assigned_reviewer: "tan", send_note: "แก้ราคา", history: [{ round: 1, status: "wrong" }] };
const queries = [];
let current = null;
let inTime = true;
reset();
setResponder((text, params) => {
  queries.push({ text, params });
  if (/SELECT status, listed_by, listed_at/.test(text)) return { rows: current ? [current] : [] };
  if (/SELECT listed_by, status, assigned_reviewer/.test(text)) return { rows: params[2] === "a" ? [{ listed_by: "nok", status: "pending", assigned_reviewer: "tan", in_time: inTime }] : [] };
  if (/SELECT .* FROM gamelist_pack_listings/s.test(text)) return { rows: [row] };
  return { rows: [] };
});
const reviewers = [{ username: "tan", name: "Tan" }, { username: "nok", name: "Nok" }];

const listed = await listGamelistPackListings(3, "uid");
assert.equal(listed[0].listedPrice, 90, "prices come back as numbers");
assert.equal(listed[0].listedAt, "2026-11-04T05:00:00.000Z");
assert.equal(listed[0].round, 2);
assert.equal(listed[0].reviewer, "tan", "the admin the round was sent to");
assert.equal(listed[0].history.length, 1);

const send = { packId: "a", channel: "kaleoz", url: "https://k.example/a", listedPrice: "95", reviewer: "tan" };
await saveGamelistPackListing(3, "uid", send, "nok", reviewers);
let upsert = queries.find((query) => /INSERT INTO gamelist_pack_listings/.test(query.text));
assert.ok(/status = 'pending'/.test(upsert.text) && /reviewed_by = ''/.test(upsert.text), "a sent listing waits for a check");
assert.deepEqual(upsert.params.slice(0, 10), [3, "uid", "a", "kaleoz", "https://k.example/a", 95, "nok", 1, "tan", "ลงแพ็คใหม่"], "the first round, with the default note");

await assert.rejects(saveGamelistPackListing(3, "uid", { ...send, reviewer: "" }, "nok", reviewers), /เลือกผู้ตรวจ/, "a round goes to someone");
await assert.rejects(saveGamelistPackListing(3, "uid", { ...send, reviewer: "nok" }, "nok", reviewers), /ตรวจเองไม่ได้/, "never to the sender");
await assert.rejects(saveGamelistPackListing(3, "uid", { ...send, reviewer: "guest" }, "nok", reviewers), /admin ของ GameInfo/, "only to a GameInfo admin");

current = { status: "wrong", listed_by: "nok", listed_at: "2026-11-04T05:00:00Z", reviewed_by: "tan", reviewed_at: "2026-11-04T05:20:00Z", round: 2, assigned_reviewer: "tan", history: [{ round: 1, status: "late" }] };
await assert.rejects(saveGamelistPackListing(3, "uid", send, "nok", reviewers), /รายละเอียดที่แก้ไข/, "a new round says what changed");
queries.length = 0;
await saveGamelistPackListing(3, "uid", { ...send, note: "แก้ราคาแล้ว" }, "nok", reviewers);
upsert = queries.find((query) => /INSERT INTO gamelist_pack_listings/.test(query.text));
assert.equal(upsert.params[7], 3, "the next round");
assert.deepEqual(JSON.parse(upsert.params[10]).map((item) => [item.round, item.status]), [[2, "wrong"], [1, "late"]], "the closed round goes to the top of the history");
current = null;

queries.length = 0;
await saveGamelistPackListing(3, "uid", { packId: "a", channel: "kaleoz", url: "", listedPrice: "" }, "nok", reviewers);
assert.ok(/DELETE FROM gamelist_pack_listings/.test(queries[0].text), "no link and no price removes the listing");

await assert.rejects(saveGamelistPackListing(3, "uid", { packId: "a", channel: "ebay", url: "" }, "nok"), /ช่องทางขาย/);
await assert.rejects(saveGamelistPackListing(3, "uid", { packId: "a", channel: "kaleoz", url: "ftp://x" }, "nok"), /ลิงก์/);
await assert.rejects(reviewGamelistPackListing(3, "uid", { packId: "a", channel: "kaleoz", status: "pending" }, "tan"), /ผลการตรวจ/, "a check is right or wrong");
await assert.rejects(reviewGamelistPackListing(3, "uid", { packId: "b", channel: "kaleoz", status: "ok" }, "tan"), /ยังไม่มีการลงสินค้า/, "nothing to check where nothing is listed");
await assert.rejects(reviewGamelistPackListing(3, "uid", { packId: "a", channel: "kaleoz", status: "ok" }, "nok"), /ตรวจเองไม่ได้/, "the one who listed it cannot check it");
await assert.rejects(reviewGamelistPackListing(3, "uid", { packId: "a", channel: "kaleoz", status: "ok" }, "oat"), /ส่งให้คนอื่นตรวจ/, "only the admin the round was sent to");
inTime = false;
await assert.rejects(reviewGamelistPackListing(3, "uid", { packId: "a", channel: "kaleoz", status: "ok" }, "tan"), /หมดเวลา/, "a round closes after its hour");
inTime = true;
await reviewGamelistPackListing(3, "uid", { packId: "a", channel: "kaleoz", status: "wrong", checkedPrice: "99", referencePrice: 90, snapshot: { price: "90", name: "60 Crystals", secret: "x" }, note: "ราคาเก่า" }, "tan");
const review = queries.find((query) => /UPDATE gamelist_pack_listings/.test(query.text) && query.params[2] === "a");
assert.deepEqual(review.params.slice(0, 9), [3, "uid", "a", "kaleoz", "wrong", 99, 90, "tan", "ราคาเก่า"], "the check keeps the price it was made against");
assert.deepEqual(JSON.parse(review.params[9]), { price: "90", name: "60 Crystals" }, "and the pack's values, known fields only");

const passed = { status: "ok", checkedReference: 90 };
assert.equal(gameinfoListingEffective(passed, 90).status, "ok", "a check holds while the price stays");
assert.equal(gameinfoListingEffective(passed, 95).status, "pending", "a moved price asks for a new round");
assert.ok(gameinfoListingEffective(passed, 95).stale);
assert.equal(gameinfoListingEffective({ status: "wrong", checkedReference: 90 }, 95).status, "wrong", "a wrong price stays wrong until it is sent again");
// Any edit to the pack's checked values asks for a new round, on every channel.
const pack = { name: "300 + 30 Crystals", amountReceived: "330", price: "90", amountBeforeFee: "10476", amountChargedFee: "11000", costProfileId: "sheet-wavepay", image: "a.png" };
const checked = { status: "ok", checkedReference: null, checkedSnapshot: gameinfoListingSnapshot(pack) };
assert.equal(gameinfoListingEffective(checked, null, Date.now(), pack).status, "ok", "an unchanged pack keeps its check");
assert.equal(gameinfoListingEffective(checked, null, Date.now(), { ...pack, image: "b.png" }).status, "ok", "a new picture is not a number");
assert.equal(gameinfoListingEffective(checked, null, Date.now(), { ...pack, price: "90.00" }).status, "ok", "the same number written differently");
const costEdit = gameinfoListingEffective(checked, null, Date.now(), { ...pack, amountChargedFee: "11500" });
assert.equal(costEdit.status, "pending", "a cost edit asks for a new round even where GameInfo has no price to compare");
assert.ok(costEdit.stale);
assert.deepEqual(costEdit.changes.map((change) => [change.key, change.from, change.to]), [["amountChargedFee", "11000", "11500"]]);
assert.equal(gameinfoListingChanges(checked.checkedSnapshot, { ...pack, name: "300+30 Crystals", costProfileId: "sheet-kbz" }).length, 2, "a renamed pack and another cost rate");
assert.equal(gameinfoListingEffective({ status: "ok", checkedReference: 90 }, 90, Date.now(), { ...pack, price: "95" }).status, "ok", "a check made before snapshots holds");
assert.equal(sanitizeGameinfoListingSnapshot("x"), null);
const sentAt = Date.parse("2026-11-04T05:00:00Z");
assert.equal(gameinfoListingEffective({ status: "pending", listedAt: "2026-11-04T05:00:00Z" }, null, sentAt + 59 * 60_000).status, "pending");
assert.equal(gameinfoListingEffective({ status: "pending", listedAt: "2026-11-04T05:00:00Z" }, null, sentAt + 61 * 60_000).status, "late", "an hour without a check closes the round");
assert.equal(summarizeGameinfoPackListings([{ status: "late" }, { status: "pending" }]).label, "หมดเวลา 1", "a closed round outranks one waiting");

const route = readFileSync(new URL("../src/app/api/gameinfo/gamelist/[id]/listings/route.js", import.meta.url), "utf8");
assert.ok(route.includes("requireGameinfoReporter(request)") && route.includes("requireGameinfoEditor(request)"), "listing needs the report permission, checking an admin");
const packs = readFileSync(new URL("../src/server/gameinfo-gamelist-packs.js", import.meta.url), "utf8");
assert.ok(packs.includes("CREATE TABLE IF NOT EXISTS gamelist_pack_listings"), "the table is created with the others");

console.log("60 passed");
