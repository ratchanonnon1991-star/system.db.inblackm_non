import { DEFAULT_G2G_GAMES, listG2GGames } from "@/server/g2g-games-repository";
import { resolveGameinfoPricePage } from "@/server/gameinfo-price-page-store";

const G2G_ORIGIN = "https://www.g2g.com";
export const G2G_CACHE_TTL_MS = 60 * 60 * 1000;
export const G2G_ALL_GROUPS = "all";
export const G2G_GAMES = DEFAULT_G2G_GAMES;

const g2gCache = globalThis.__gameinfoG2GCache || new Map();
globalThis.__gameinfoG2GCache = g2gCache;

export function g2gGameUrl(slug) {
  return `${G2G_ORIGIN}/categories/${slug}`;
}

export function normalizeG2GGame(value, games = G2G_GAMES) {
  const list = Array.isArray(games) ? games : G2G_GAMES;
  return list.find((game) => game.value === value || game.slug === value) || list[0] || null;
}

export async function loadG2GGames() {
  try {
    return await listG2GGames();
  } catch {
    return DEFAULT_G2G_GAMES;
  }
}

export function normalizeG2GGroup(value) {
  return typeof value === "string" && value ? value : G2G_ALL_GROUPS;
}

function decodeJsString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function stringField(source, name) {
  const match = new RegExp(`${name}:"((?:\\\\.|[^"\\\\])*)"`).exec(source);
  return match ? decodeJsString(match[1]) : "";
}

function numberField(source, name) {
  const value = Number(new RegExp(`${name}:(-?\\d+(?:\\.\\d+)?)`).exec(source)?.[1]);
  return Number.isFinite(value) ? value : null;
}

function extractArrayObjects(source, marker) {
  const markerIndex = source.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error("ไม่พบรายการสินค้าใน payload ของ G2G");
  const start = source.indexOf("[", markerIndex);
  const objects = [];
  let depth = 0;
  let objectStart = -1;
  let quote = false;
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quote = false;
      continue;
    }
    if (char === '"') {
      quote = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) objectStart = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) objects.push(source.slice(objectStart, index + 1));
    } else if (char === "]" && depth === 0) {
      return objects;
    }
  }
  throw new Error("อ่านรายการสินค้า G2G ไม่ครบ");
}

function offerGroup(value) {
  if (/\bzem/i.test(value)) return "zems";
  if (/\bcoin/i.test(value)) return "coins";
  return "other";
}

function quantityFromTitle(value) {
  const number = /\d[\d,.]*/.exec(value)?.[0]?.replaceAll(",", "");
  return number && Number.isFinite(Number(number)) ? Number(number) : null;
}

export function parseG2GCatalogHtml(html) {
  const gameLabel = stringField(html, "brandName") || /<title>([^<]+?)(?:\s+Top Up|\s+only on G2G)/i.exec(html)?.[1]?.trim();
  const offers = extractArrayObjects(html, "offers:").map((raw) => {
    const title = stringField(raw, "title");
    const datasetId = stringField(raw, "dataset_id") || stringField(raw, "offer_id");
    return {
      itemId: stringField(raw, "offer_id"),
      packKey: datasetId,
      packLabel: title,
      productGroup: offerGroup(title),
      quantity: quantityFromTitle(title),
      title,
      seller: stringField(raw, "username"),
      price: Number(stringField(raw, "display_price")),
      currency: stringField(raw, "display_currency") || "USD",
      stock: numberField(raw, "available_qty"),
      stockText: numberField(raw, "available_qty")?.toLocaleString("en-US") || "",
      rating: numberField(raw, "satisfaction_rate"),
      sold: numberField(raw, "total_success_order"),
      delivery: stringField(raw, "delivery_speed"),
      productUrl: stringField(raw, "precheckout_url"),
      unitPrice: "",
    };
  }).filter((offer) => offer.itemId && offer.packKey && offer.packLabel && offer.seller && Number.isFinite(offer.price));
  if (!offers.length) throw new Error("ไม่พบรายการ Seller ในหน้า G2G");
  return { gameLabel: gameLabel || "G2G", offers };
}

export function groupG2GOffers(offers) {
  const groups = new Map();
  for (const offer of offers) {
    const current = groups.get(offer.packKey) || {
      key: offer.packKey,
      packLabel: offer.packLabel,
      quantity: offer.quantity,
      packOrder: groups.size,
      offers: [],
    };
    current.offers.push(offer);
    groups.set(offer.packKey, current);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    sellers: [...new Set(group.offers.map((offer) => offer.seller))],
    offers: group.offers.sort((a, b) => a.price - b.price),
  }));
}

async function g2gFetch(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "accept-language": "en-US,en;q=0.9", "user-agent": "GameInfo G2G Price Compare/1.0" },
  });
  if (!response.ok) throw new Error(`G2G ตอบกลับ ${response.status}`);
  return response.text();
}

async function loadG2GPage(game, requestedGroup, games, fetchHtml) {
  const sourceUrl = g2gGameUrl(game.slug);
  const catalog = parseG2GCatalogHtml(await fetchHtml(sourceUrl));
  const groups = [...new Set(catalog.offers.map((offer) => offer.productGroup))];
  const selectedGroup = groups.includes(requestedGroup) ? requestedGroup : G2G_ALL_GROUPS;
  const offers = selectedGroup === G2G_ALL_GROUPS ? catalog.offers : catalog.offers.filter((offer) => offer.productGroup === selectedGroup);
  const fetchedAt = new Date().toISOString();
  return {
    provider: "g2g",
    providerLabel: "G2G",
    detailLabels: { volume: "Orders", stock: "Stock", delivery: "Delivery" },
    sourceUrl,
    totalListings: offers.length,
    offers,
    groups: groupG2GOffers(offers),
    game: game.value,
    gameLabel: catalog.gameLabel || game.label,
    games,
    productType: selectedGroup,
    productTypeLabel: selectedGroup === G2G_ALL_GROUPS ? "ทุกหมวดหมู่" : selectedGroup,
    productTypes: [
      { value: G2G_ALL_GROUPS, label: "ทุกหมวดหมู่" },
      ...groups.map((value) => ({ value, label: value === "zems" ? "ZEMs" : value === "coins" ? "Coins" : "อื่น ๆ" })),
    ],
    filters: groups.map((value) => ({ label: value, totalListings: catalog.offers.filter((offer) => offer.productGroup === value).length })),
    fetchedAt,
    nextRefreshAt: new Date(Date.parse(fetchedAt) + G2G_CACHE_TTL_MS).toISOString(),
  };
}

export async function fetchG2GPage(requestedGame = "zepeto-top-up", requestedGroup, { force = false, fetchHtml = g2gFetch, games: suppliedGames, store } = {}) {
  const games = suppliedGames ?? await loadG2GGames();
  const game = normalizeG2GGame(requestedGame, games);
  if (!game) throw new Error("ยังไม่มีเกมในรายการเทียบราคา");
  const group = normalizeG2GGroup(requestedGroup);
  return resolveGameinfoPricePage({
    market: "g2g",
    game: game.value,
    productType: group,
    games,
    cache: g2gCache,
    cacheKey: `${game.value}:${group}`,
    ttlMs: G2G_CACHE_TTL_MS,
    force,
    store,
    load: () => loadG2GPage(game, group, games, fetchHtml),
  });
}

export function clearG2GCache() {
  g2gCache.clear();
}

export async function inspectG2GGame(slug, { fetchHtml = g2gFetch } = {}) {
  const catalog = parseG2GCatalogHtml(await fetchHtml(g2gGameUrl(slug)));
  return { slug, label: catalog.gameLabel };
}
