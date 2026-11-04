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
export function gameinfoListingEffective(listing, reference = null, now = Date.now()) {
  if (listing.status === "pending" && now > gameinfoListingDeadline(listing)) return { ...listing, status: "late" };
  const moved = listing.status === "ok" && listing.checkedReference !== null && listing.checkedReference !== undefined
    && reference !== null && reference !== undefined && Math.abs(Number(reference) - Number(listing.checkedReference)) > 0.005;
  return moved ? { ...listing, status: "pending", stale: true } : listing;
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
 * round that ran out of time, then any waiting to be checked, then all
 * checked; "none" when it is listed nowhere.
 */
export function summarizeGameinfoPackListings(listings = []) {
  const counts = { ok: 0, pending: 0, wrong: 0, late: 0 };
  for (const listing of listings) counts[listing.status] = (counts[listing.status] || 0) + 1;
  if (counts.wrong) return { ...counts, tone: "bad", label: `ราคาผิด ${counts.wrong}` };
  if (counts.late) return { ...counts, tone: "late", label: `หมดเวลา ${counts.late}` };
  if (counts.pending) return { ...counts, tone: "warn", label: `รอตรวจ ${counts.pending}` };
  if (counts.ok) return { ...counts, tone: "ok", label: "ตรวจครบ" };
  return { ...counts, tone: "none", label: "ยังไม่ลง" };
}
