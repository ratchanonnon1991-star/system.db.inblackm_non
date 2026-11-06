// Orders that may have been filled from stock but have no "ตัดออก" yet. Pure:
// the server reads telegram_orders_dev (read-only) and the stock tables, this
// file decides which orders belong to which stock account and which pack they
// probably used. Nothing is cut here; a person confirms each one in the
// ตัดออก form, or marks it "ไม่ได้ใช้ stock".
//
// Order names are free text from many channels ("#Diablo immortal (via login 2fa)",
// "✨ 6480 ЛУНИТОВ ✨"), so a game is matched when a stock account's game name
// is contained in the order's, and a pack is only suggested when exactly one
// pack's number appears in the order's pack text.
import { flatGameName, stockGameHints } from "./stock-game-match.js";

export const STOCK_PENDING_DEFAULT_DAYS = 14;
export const STOCK_PENDING_MAX_DAYS = 60;
/** A hint shorter than this ("fc") would match unrelated games. */
const MIN_HINT_LENGTH = 4;

/** Clamp a ?days= value to 1..STOCK_PENDING_MAX_DAYS, default STOCK_PENDING_DEFAULT_DAYS. */
export function stockPendingDays(value) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1) return STOCK_PENDING_DEFAULT_DAYS;
  return Math.min(days, STOCK_PENDING_MAX_DAYS);
}

/** Order statuses that never get filled. */
const IOS_WORD = /(^|[^\p{L}])(ios|iphone|ipad)($|[^\p{L}])/iu;
const ANDROID_WORD = /andr|андр/iu;

/**
 * The store an order's pack text names: "4.44 550 IOS" → "ios", "1.11 260 androif" → "android".
 * Most orders are typed by hand, so "andr" takes the misspellings too. "" when it names neither,
 * or both, which says nothing either way.
 */
export function orderPlatform(packText) {
  const text = String(packText ?? "");
  const ios = IOS_WORD.test(text);
  const android = ANDROID_WORD.test(text);
  if (ios === android) return "";
  return ios ? "ios" : "android";
}

/** Whether an account's stock can fill an order: only a store named on both sides can rule it out. */
export function accountFitsOrderPlatform(account, packText) {
  const wanted = orderPlatform(packText);
  return !wanted || !account.platform || account.platform === wanted;
}

export function isClosedOrderStatus(status) {
  return /reject|cancel/i.test(String(status ?? ""));
}

/** How the order channels really spell a game, when that is not its name: "#eFootbal (PES) (via login 2fa)". */
const ORDER_GAME_SPELLINGS = {
  efootball: ["efootbal"],
};

/**
 * The names an account's orders are found by: its own game name when it has
 * one, else the sheet / code hints. The code hint alone is too loose for
 * orders ("pokemon" would take Pokemon Unite orders for a Pokémon GO stock).
 */
function orderHints(account) {
  const own = String(account.gameName || "").trim();
  const hints = own ? [own] : stockGameHints(account);
  return hints.flatMap((hint) => [hint, ...(ORDER_GAME_SPELLINGS[flatGameName(hint)] || [])]);
}

/** The flat game names an open account answers to, longest first. */
export function stockAccountGameKeys(account) {
  return [...new Set(orderHints(account).map(flatGameName))]
    .filter((key) => key.length >= MIN_HINT_LENGTH)
    .sort((a, b) => b.length - a.length);
}

/** ILIKE patterns for the SQL pre-filter: "Diablo Immortal" → "%diablo%immortal%". */
export function stockOrderGamePatterns(accounts) {
  const patterns = new Set();
  for (const account of accounts) {
    for (const hint of orderHints(account)) {
      const words = String(hint).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9ก-๙]+/).filter(Boolean);
      if (words.join("").length >= MIN_HINT_LENGTH) patterns.add(`%${words.join("%")}%`);
    }
  }
  return [...patterns];
}

/**
 * Numbers written in a text: "✨ 6,480 ЛУНИТОВ ✨" → ["6480"]. A bonus after "+"
 * is not the pack: "4.22 300+20" → ["4.22", "300"].
 */
export function textNumbers(text) {
  return (String(text ?? "").replaceAll(",", "").match(/\+?\s*\d+(?:\.\d+)?/g) || [])
    .filter((n) => !n.startsWith("+"))
    .map((n) => String(Number(n.trim())));
}

/**
 * The one pack of `items` whose own number (first number of its GameInfo pack
 * name, else of its label) is written in the order's pack text; null when
 * none or several match.
 */
export function suggestStockItem(orderPack, items) {
  const wanted = new Set(textNumbers(orderPack));
  if (!wanted.size) return null;
  const hits = items.filter((item) => {
    const own = textNumbers(item.packName)[0] ?? textNumbers(item.label)[0];
    return own != null && wanted.has(own);
  });
  return hits.length === 1 ? hits[0] : null;
}

/**
 * The key an order's pack text is learned under: case, spaces, emoji and
 * punctuation do not matter ("✨ Lunite Subscription✨" = "Lunite subscription").
 */
export function stockOrderPackKey(text) {
  return String(text ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 200);
}

/**
 * The pack learned for this order text in one of `accounts`, else the one
 * pack whose number fits (suggestStockItem). `aliases` maps
 * "<accountId>|<packKey>" → itemId. Only a sure fit (one account, one pack)
 * is returned: { accountId, itemId, source: "learned" | "number" }.
 */
export function suggestOrderPack(orderPack, accounts, aliases = new Map()) {
  const key = stockOrderPackKey(orderPack);
  const learned = key
    ? accounts
        .map((account) => ({ account, item: (account.items || []).find((item) => item.id === aliases.get(`${account.id}|${key}`)) }))
        .filter((fit) => fit.item)
    : [];
  if (learned.length === 1) return { accountId: learned[0].account.id, itemId: learned[0].item.id, source: "learned" };
  if (learned.length > 1) return null;
  const fits = accounts
    .map((account) => ({ account, item: suggestStockItem(orderPack, account.items || []) }))
    .filter((fit) => fit.item);
  return fits.length === 1 ? { accountId: fits[0].account.id, itemId: fits[0].item.id, source: "number" } : null;
}

/**
 * Whether the system may cut this pending order itself (as a cut waiting
 * for a person): the order fits exactly one stock account, that account has
 * auto cut on and the order came after it was turned on, the pack was learned
 * from an earlier cut (never just guessed from a number), and one unit is left.
 * @returns {{ accountId, itemId } | null}
 */
export function autoCutPlan(order, accountsById) {
  if (order.accounts.length !== 1 || order.suggestion?.source !== "learned") return null;
  const account = accountsById.get(order.suggestion.accountId);
  if (!account?.autoCut || !account.autoCutSince || account.status === "closed") return null;
  if (!order.createdAt || Date.parse(order.createdAt) < Date.parse(account.autoCutSince)) return null;
  const item = (account.items || []).find((entry) => entry.id === order.suggestion.itemId);
  if (!item || !(item.left >= 1)) return null;
  return { accountId: account.id, itemId: item.id };
}

/**
 * @param {object[]} orders telegram_orders_dev rows: task_request_id, order_id, game_name, pack_name, price, status, source, created_at
 * @param {object[]} accounts listStockAccounts() (with items)
 * @param {Set<string>} done refs already cut or marked "not stock"
 * @param {Map<string, number>} aliases learned packs, "<accountId>|<packKey>" → itemId
 * @returns {object[]} newest first: { ref, orderId, game, pack, price, status, source, createdAt, accounts: [{ id, code }], suggestion }
 */
export function pendingStockOrders(orders, accounts, done = new Set(), aliases = new Map()) {
  const open = accounts
    .filter((account) => account.status !== "closed")
    .map((account) => ({ account, keys: stockAccountGameKeys(account) }))
    .filter((entry) => entry.keys.length);
  const seen = new Set();
  const out = [];
  for (const order of orders) {
    const ref = String(order.task_request_id ?? "").trim();
    const orderId = String(order.order_id ?? "").trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    if (done.has(ref) || (orderId && done.has(orderId)) || isClosedOrderStatus(order.status)) continue;
    const game = flatGameName(order.game_name);
    const matched = open
      .filter((entry) => entry.keys.some((key) => game.includes(key)))
      .map((entry) => entry.account)
      .filter((account) => accountFitsOrderPlatform(account, order.pack_name));
    if (!matched.length) continue;
    const suggestion = suggestOrderPack(order.pack_name, matched, aliases);
    out.push({
      ref,
      orderId,
      game: String(order.game_name ?? "").slice(0, 160),
      pack: String(order.pack_name ?? "").slice(0, 200),
      price: order.price == null ? null : String(order.price),
      status: String(order.status ?? "").trim(),
      source: String(order.source ?? "").trim(),
      createdAt: order.created_at == null ? null : new Date(order.created_at).toISOString(),
      accounts: matched.map((account) => ({ id: account.id, code: account.code })),
      suggestion,
    });
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
