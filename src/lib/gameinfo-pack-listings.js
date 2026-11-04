import { GAMEINFO_SALES_CHANNELS } from "@/lib/gameinfo-sales-channels";

// A pack listed for sale on a channel (Kaleoz, G2G…): where, at what price,
// who listed it, and whether someone has checked that price since.
//   pending  listed or changed, not checked yet
//   ok       checked, the price is right
//   wrong    checked, the price is wrong
export const GAMEINFO_LISTING_STATUSES = ["pending", "ok", "wrong"];

// Sales channels whose own price the pack list works out, to check a listing
// against (gameinfo-pack-list.js channel keys).
export const GAMEINFO_LISTING_PRICE_CHANNEL = { page: "page", kaleoz: "kaleoz", russia: "russia" };

const CHANNEL_KEYS = new Set(GAMEINFO_SALES_CHANNELS.map((channel) => channel.key));
const HIDDEN_SALES_STATUSES = new Set(["none", "removed"]);

export function isGameinfoListingChannel(key) {
  return CHANNEL_KEYS.has(key);
}

/** The channels a game sells on (its sales channel rows), else every channel. */
export function gameinfoListingChannels(salesChannels = []) {
  const used = new Set((salesChannels || []).filter((row) => row.status && !HIDDEN_SALES_STATUSES.has(row.status)).map((row) => row.channel));
  const channels = GAMEINFO_SALES_CHANNELS.filter((channel) => used.has(channel.key));
  return channels.length ? channels : GAMEINFO_SALES_CHANNELS;
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
 * waiting to be checked, then all checked; "none" when it is listed nowhere.
 */
export function summarizeGameinfoPackListings(listings = []) {
  const counts = { ok: 0, pending: 0, wrong: 0 };
  for (const listing of listings) counts[listing.status] = (counts[listing.status] || 0) + 1;
  if (counts.wrong) return { ...counts, tone: "bad", label: `ราคาผิด ${counts.wrong}` };
  if (counts.pending) return { ...counts, tone: "warn", label: `รอตรวจ ${counts.pending}` };
  if (counts.ok) return { ...counts, tone: "ok", label: "ตรวจครบ" };
  return { ...counts, tone: "none", label: "ยังไม่ลง" };
}
