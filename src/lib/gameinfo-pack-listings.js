import { GAMEINFO_SALES_CHANNELS } from "@/lib/gameinfo-sales-channels";

// A pack listed for sale on a channel (Kaleoz, G2G…): where, at what price,
// who listed it, and whether someone has checked that price since.
//   pending  listed or changed, not checked yet
//   ok       checked, the price is right
//   wrong    checked, the price is wrong
export const GAMEINFO_LISTING_STATUSES = ["pending", "ok", "wrong"];
// How long the admin a round is sent to has to check it; after that the round
// is closed ("late") and the lister sends a new one.
export const GAMEINFO_LISTING_REVIEW_MINUTES = 60;

/** When a round sent at `listedAt` stops taking a check. */
export function gameinfoListingDeadline(listing) {
  const sent = new Date(listing?.listedAt || 0).getTime();
  return Number.isFinite(sent) ? sent + GAMEINFO_LISTING_REVIEW_MINUTES * 60_000 : 0;
}

// Sales channels whose own price the pack list works out, to check a listing
// against (gameinfo-pack-list.js channel keys).
export const GAMEINFO_LISTING_PRICE_CHANNEL = { page: "page", kaleoz: "kaleoz", russia: "russia" };

const CHANNEL_KEYS = new Set(GAMEINFO_SALES_CHANNELS.map((channel) => channel.key));
// A pack is checked where the game is sold: on sale, being listed, awaiting
// verification or paused for now. Closed, removed or never there: no tab.
const SOLD_STATUSES = new Set(["open", "listing", "verify", "paused"]);

/** The name a listing or a check is recorded under: the API and the page must agree. */
export function gameinfoListingActor(user) {
  return String(user?.username || user?.displayName || user?.id || "");
}

/**
 * A listing as it stands now. A round not checked within its hour is "late".
 * A check holds only for the price it was made against: once the pack's own
 * price for that channel moves, a passed listing is `stale` and needs a new round.
 */
export function gameinfoListingEffective(listing, reference = null, now = Date.now(), pack = null) {
  if (listing.status === "pending" && now > gameinfoListingDeadline(listing)) return { ...listing, status: "late" };
  if (listing.status !== "ok") return listing;
  const moved = listing.checkedReference !== null && listing.checkedReference !== undefined
    && reference !== null && reference !== undefined && Math.abs(Number(reference) - Number(listing.checkedReference)) > 0.005;
  const changes = pack ? gameinfoListingChanges(listing.checkedSnapshot, pack) : [];
  return moved || changes.length ? { ...listing, status: "pending", stale: true, changes } : listing;
}

// What a check holds the pack to: what the customer sees (name, amount,
// price) and what its cost is worked out from. Editing any of them after the
// check sends every channel of the pack back for a new one, whether or not
// GameInfo has a price for that channel to compare.
export const GAMEINFO_LISTING_SNAPSHOT_FIELDS = [
  { key: "name", label: "ชื่อแพ็ค" },
  { key: "amountReceived", label: "จำนวนที่ได้รับ" },
  { key: "price", label: "ราคาขาย" },
  { key: "priceUsd", label: "ราคา USD" },
  { key: "amountBeforeFee", label: "ยอดที่กด" },
  { key: "amountChargedFee", label: "ยอดรวมค่าธรรมเนียม" },
  { key: "costProfileId", label: "เรทต้นทุนที่ใช้" },
];
const SNAPSHOT_KEYS = new Set(GAMEINFO_LISTING_SNAPSHOT_FIELDS.map((field) => field.key));

function snapshotValue(value) {
  return String(value ?? "").trim().slice(0, 200);
}

/** A pack's checked values, as stored with a check. */
export function gameinfoListingSnapshot(pack) {
  return Object.fromEntries(GAMEINFO_LISTING_SNAPSHOT_FIELDS.map(({ key }) => [key, snapshotValue(pack?.[key])]));
}

/** Only the known fields, as text: what the server keeps from a client's snapshot. */
export function sanitizeGameinfoListingSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (SNAPSHOT_KEYS.has(key) && (typeof item === "string" || typeof item === "number")) result[key] = snapshotValue(item);
  }
  return Object.keys(result).length ? result : null;
}

// "1,000" and "1000.00" are the same number; other text is compared as typed.
function sameValue(a, b) {
  const x = a.replace(/,/g, "");
  const y = b.replace(/,/g, "");
  if (x !== "" && y !== "" && Number.isFinite(Number(x)) && Number.isFinite(Number(y))) return Math.abs(Number(x) - Number(y)) < 0.000001;
  return a === b;
}

/** The checked values that differ in the pack now: [{ key, label, from, to }]. None for a check without a snapshot. */
export function gameinfoListingChanges(snapshot, pack) {
  if (!snapshot || typeof snapshot !== "object") return [];
  return GAMEINFO_LISTING_SNAPSHOT_FIELDS
    .filter(({ key }) => Object.hasOwn(snapshot, key))
    .map(({ key, label }) => ({ key, label, from: snapshotValue(snapshot[key]), to: snapshotValue(pack?.[key]) }))
    .filter((change) => !sameValue(change.from, change.to));
}

export function isGameinfoListingChannel(key) {
  return CHANNEL_KEYS.has(key);
}

/** The channels a game sells on, from its sales channel rows; none when it has none set. */
export function gameinfoListingChannels(salesChannels = []) {
  const used = new Set((salesChannels || []).filter((row) => SOLD_STATUSES.has(row.status)).map((row) => row.channel));
  return GAMEINFO_SALES_CHANNELS.filter((channel) => used.has(channel.key));
}

/** A price as typed ("1,250", "฿90"), or null for none. */
export function parseGameinfoListingPrice(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(String(value).replace(/[,฿\s]/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : NaN;
}

export function isGameinfoListingUrl(value) {
  const text = String(value ?? "").trim();
  return text === "" || /^https?:\/\/\S+$/i.test(text);
}

/**
 * One pack's listings as the row's badge: any wrong price first, then any
 * round that ran out of time, then any waiting to be checked; then how many
 * of the game's `channelCount` channels are checked, ตรวจครบ when all are.
 */
export function summarizeGameinfoPackListings(listings = [], channelCount = listings.length) {
  const counts = { ok: 0, pending: 0, wrong: 0, late: 0 };
  for (const listing of listings) counts[listing.status] = (counts[listing.status] || 0) + 1;
  if (counts.wrong) return { ...counts, tone: "bad", label: `ราคาผิด ${counts.wrong}` };
  if (counts.late) return { ...counts, tone: "late", label: `หมดเวลา ${counts.late}` };
  if (counts.pending) return { ...counts, tone: "warn", label: `รอตรวจ ${counts.pending}` };
  // ตรวจครบ only once every channel the game sells on has a passed check.
  if (counts.ok && counts.ok >= channelCount) return { ...counts, tone: "ok", label: "ตรวจครบ" };
  if (counts.ok) return { ...counts, tone: "none", label: `ตรวจแล้ว ${counts.ok}/${channelCount}` };
  return { ...counts, tone: "none", label: "ยังไม่ลง" };
}
