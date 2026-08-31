import { DEFAULT_ITEMKU_GAMES, listItemkuGames } from "@/server/itemku-games-repository";
import { resolveGameinfoPricePage } from "@/server/gameinfo-price-page-store";

const ITEMKU_ORIGIN = "https://www.itemku.com";
const JINA_READER_ORIGIN = "https://r.jina.ai";
export const ITEMKU_CACHE_TTL_MS = 60 * 60 * 1000;
export const ITEMKU_ALL_GROUPS = "all";

// Kept as the offline fallback for when the gameinfo database is unreachable;
// the live list lives in itemku_games and is managed from the compare page.
export const ITEMKU_GAMES = DEFAULT_ITEMKU_GAMES;

const itemkuCache = globalThis.__gameinfoItemkuCache || new Map();
globalThis.__gameinfoItemkuCache = itemkuCache;

export function itemkuGameUrl(slug) {
  return `${ITEMKU_ORIGIN}/en/g/${slug}/top-up`;
}

export function normalizeItemkuGame(value, games = ITEMKU_GAMES) {
  const list = games?.length ? games : ITEMKU_GAMES;
  return list.find((game) => game.value === value) || list[0];
}

// The saved game list is the source of truth; the seed list only keeps the page
// usable when the gameinfo database is unreachable.
export async function loadItemkuGames() {
  try {
    const games = await listItemkuGames();
    return games.length ? games : DEFAULT_ITEMKU_GAMES;
  } catch {
    return DEFAULT_ITEMKU_GAMES;
  }
}

export function normalizeItemkuGroup(value) {
  return typeof value === "string" && value ? value : ITEMKU_ALL_GROUPS;
}

function decodeHtml(value = "") {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractItemkuFlightText(html) {
  const scripts = [...String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => decodeHtml(match[1]));
  const chunks = [];
  for (const script of scripts) {
    for (const match of script.matchAll(/self\.__next_f\.push\(\[1\s*,\s*("(?:\\.|[^"\\])*")\s*\]\)/g)) {
      try {
        chunks.push(JSON.parse(match[1]));
      } catch {
        // Ignore unrelated or incomplete Flight script entries.
      }
    }
  }
  if (!chunks.length) throw new Error("ไม่พบ Next.js Flight payload จาก itemku");
  return chunks.join("");
}

function extractJsonObjects(text, key) {
  const objects = [];
  const needle = `"${key}":`;
  let cursor = 0;
  while ((cursor = text.indexOf(needle, cursor)) !== -1) {
    let start = cursor + needle.length;
    while (/\s/.test(text[start] || "")) start += 1;
    if (text[start] !== "{") {
      cursor = start;
      continue;
    }
    let depth = 0;
    let quote = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quote = false;
        continue;
      }
      if (char === '"') quote = true;
      else if (char === "{") depth += 1;
      else if (char === "}" && --depth === 0) {
        try {
          objects.push(JSON.parse(text.slice(start, index + 1)));
        } catch {
          // Continue looking for another complete occurrence.
        }
        cursor = index + 1;
        break;
      }
    }
    if (cursor <= start) cursor = start + 1;
  }
  return objects;
}

function visit(value, callback, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  callback(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child, callback, seen);
}

function firstObjectWith(root, predicate) {
  let result;
  visit(root, (value) => {
    if (!result && !Array.isArray(value) && predicate(value)) result = value;
  });
  return result;
}

function slugify(value) {
  return String(value || "group").toLocaleLowerCase("en").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "group";
}

function normalizeGroups(productListData) {
  const selected = firstObjectWith(productListData, (value) => Array.isArray(value.item_info_group));
  if (!selected) throw new Error("ไม่พบ denomination groups จาก itemku");
  const used = new Set();
  return selected.item_info_group.map((group, groupIndex) => {
    const base = slugify(group.slug || group.name || group.id);
    let value = base;
    let suffix = 2;
    while (used.has(value) || value === ITEMKU_ALL_GROUPS) value = `${base}-${suffix++}`;
    used.add(value);
    const denominations = (group.item_info || []).map((item, itemIndex) => ({
      id: String(item.id),
      name: String(item.name || item.title || item.slug || item.id),
      slug: String(item.slug || slugify(item.name || item.id)),
      order: groupIndex * 10_000 + itemIndex,
    }));
    return { value, label: String(group.name || group.title || `Group ${groupIndex + 1}`), denominations };
  }).filter((group) => group.denominations.length);
}

function findRates(objects) {
  for (const object of objects) {
    const rates = firstObjectWith(object, (value) => value.foreignExchangeRate && typeof value.foreignExchangeRate === "object")?.foreignExchangeRate;
    if (rates) return rates;
  }
  return null;
}

export function convertItemkuSellerPriceToUsd(sellerPrice, rates) {
  const price = Number(sellerPrice);
  const idr = Number(rates?.IDR);
  const usd = Number(rates?.USD);
  if (!Number.isFinite(price) || !Number.isFinite(idr) || idr <= 0 || !Number.isFinite(usd) || usd <= 0) {
    throw new Error("itemku ไม่มีอัตราแลกเปลี่ยน IDR/USD ที่ใช้คำนวณราคาได้");
  }
  return price / idr * usd;
}

function productRecords(productListData) {
  const products = [];
  visit(productListData, (value) => {
    if (!Array.isArray(value) && value.id != null && value.item_info_id != null && value.seller_price != null) products.push(value);
  });
  return products;
}

function imageUrl(product) {
  return product.image_url || product.icon_image_url || product.thumbnail_url || product.images?.[0]?.image_url || product.item_info?.image_url || "";
}

function sellerName(product) {
  return product.seller?.shop_name || product.seller?.name || product.shop_name || product.seller_name || "";
}

function productUrl(product, fallbackUrl) {
  return product.id
    ? `${fallbackUrl}?product_id=${product.id}`
    : fallbackUrl;
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeProduct(product, denomination, rates, fallbackUrl) {
  const seller = sellerName(product);
  if (!seller) return null;
  return {
    itemId: String(product.id),
    itemInfoId: String(product.item_info_id),
    title: String(product.name || product.title || denomination.name),
    packLabel: denomination.name,
    packOrder: denomination.order,
    quantity: null,
    price: convertItemkuSellerPriceToUsd(product.seller_price, rates),
    currency: "USD",
    seller,
    sellerLevel: String(product.seller?.level_name || product.seller?.level || ""),
    imageUrl: imageUrl(product),
    productUrl: productUrl(product, fallbackUrl),
    server: String(product.server || product.region || ""),
    stock: numeric(product.stock),
    stockText: product.stock == null ? "" : String(product.stock),
    tradingVolume: numeric(product.sold || product.sold_count || product.order_record?.successful_order_count) || 0,
    sold: numeric(product.sold || product.sold_count || product.order_record?.successful_order_count) || 0,
    rating: numeric(product.rating || product.seller?.rating || product.seller?.average_rating),
    delivery: String(product.delivery || product.delivery_time || product.delivery_method || (product.use_instant_delivery ? "Instant" : product.average_delivery_time || "")),
    unitPrice: "",
    promo: Boolean(product.discount || product.promo || product.is_promo),
  };
}

// itemku has no single markup slot for the game name, so try the Flight payload
// first, then the page title, and fall back to the slug itself.
export function parseItemkuGameLabel(html, slug) {
  try {
    const flightText = extractItemkuFlightText(html);
    for (const object of extractJsonObjects(flightText, "productListData")) {
      const game = firstObjectWith(object, (value) => value.slug === slug && typeof value.name === "string" && value.name.trim())
        || firstObjectWith(object, (value) => value.game_id != null && typeof value.game_name === "string" && value.game_name.trim());
      const name = String(game?.name || game?.game_name || "").trim();
      if (name) return name;
    }
  } catch {
    // Fall through to the title/slug fallbacks below.
  }
  const title = decodeHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "")
    .replace(/\s*[|·-]\s*itemku.*$/i, "")
    .replace(/^\s*(?:top\s*up|beli|jual)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (title) return title.slice(0, 120);
  return String(slug || "").split("-").filter(Boolean).join(" ").toLocaleUpperCase("en");
}

export function parseItemkuCatalogHtml(html) {
  const flightText = extractItemkuFlightText(html);
  const objects = extractJsonObjects(flightText, "productListData");
  const productListData = objects.find((value) => firstObjectWith(value, (item) => Array.isArray(item.item_info_group)));
  if (!productListData) throw new Error("อ่านโครงสร้างสินค้า itemku ไม่ได้");
  const groups = normalizeGroups(productListData);
  if (!groups.length) throw new Error("ไม่พบหมวด Top Up จาก itemku");
  const market = firstObjectWith(productListData, (value) => value.game_id != null && value.item_type_id != null);
  if (!market) throw new Error("ไม่พบ game/item type IDs จาก itemku");
  return {
    productListData,
    groups,
    rates: findRates([productListData, ...objects]),
    gameId: String(market.game_id),
    itemTypeId: String(market.item_type_id),
  };
}

export function parseItemkuDenominationHtml(html, denomination) {
  const flightText = extractItemkuFlightText(html);
  const objects = [
    ...extractJsonObjects(flightText, "productListData"),
    ...extractJsonObjects(flightText, "productDetail"),
    ...extractJsonObjects(flightText, "similarProducts"),
  ];
  if (!objects.length) throw new Error("อ่านรายการ Seller จาก itemku ไม่ได้");
  const rates = findRates(objects);
  if (!rates) throw new Error("itemku ไม่มีอัตราแลกเปลี่ยน IDR/USD ที่ใช้คำนวณราคาได้");
  const fallbackUrl = denomination.sourceUrl;
  const unique = new Map();
  for (const object of objects) {
    for (const product of productRecords(object)) {
      if (String(product.item_info_id) !== String(denomination.id)) continue;
      const offer = normalizeProduct(product, denomination, rates, fallbackUrl);
      if (offer && !unique.has(offer.itemId)) unique.set(offer.itemId, offer);
    }
  }
  const totalListings = objects.reduce((total, object) => {
    const summary = firstObjectWith(object, (value) => Number.isFinite(Number(value.total_item)) && Array.isArray(value.data));
    return Math.max(total, Number(summary?.total_item) || 0);
  }, 0);
  return { offers: [...unique.values()], rates, totalListings };
}

export function groupItemkuOffers(offers) {
  const groups = new Map();
  for (const offer of offers) {
    const group = groups.get(offer.itemInfoId) || { key: offer.itemInfoId, quantity: null, packLabel: offer.packLabel, packOrder: offer.packOrder, offers: [] };
    group.offers.push(offer);
    groups.set(offer.itemInfoId, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    offers: group.offers.sort((a, b) => a.price - b.price),
    sellers: [...new Set(group.offers.map((offer) => offer.seller))],
    stock: group.offers.reduce((sum, offer) => sum + (offer.stock || 0), 0),
    tradingVolume: group.offers.reduce((sum, offer) => sum + offer.tradingVolume, 0),
  })).sort((a, b) => a.packOrder - b.packOrder);
}

async function itemkuFetch(url) {
  let response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "GameInfo itemku Price Compare/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 403) {
    response = await fetch(itemkuReaderUrl(url), {
      headers: { "x-return-format": "html" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  }
  if (!response.ok) throw new Error(`itemku ตอบกลับ ${response.status}`);
  return response.text();
}

async function itemkuApiFetch(url) {
  let response = await fetch(url, {
    headers: {
      accept: "application/json",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "GameInfo itemku Price Compare/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 403) {
    response = await fetch(itemkuReaderUrl(url), {
      headers: { "x-return-format": "html" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`itemku API ตอบกลับ ${response.status}`);
    return parseItemkuReaderJson(await response.text());
  }
  if (!response.ok) throw new Error(`itemku API ตอบกลับ ${response.status}`);
  return response.json();
}

function itemkuReaderUrl(url) {
  const target = new URL(url);
  target.protocol = "http:";
  return `${JINA_READER_ORIGIN}/${target.toString()}`;
}

export function parseItemkuReaderJson(html) {
  const pre = /<pre\b[^>]*>([\s\S]*?)<\/pre>/i.exec(html)?.[1];
  if (!pre) throw new Error("อ่าน JSON จาก itemku fallback ไม่ได้");
  return JSON.parse(decodeHtml(pre).replace(/<[^>]*>/g, ""));
}

function itemkuProductApiUrl({ itemInfoId, gameId, itemTypeId }, page) {
  const url = new URL(`${ITEMKU_ORIGIN.replace("www.", "api-gateway.")}/v1/product`);
  const params = {
    per_page: "100",
    page: String(page),
    is_include_game: "1",
    is_include_item_type: "1",
    is_include_item_info_group: "1",
    is_include_item_info: "1",
    is_include_order_record: "1",
    is_from_web: "1",
    exclude_sharing_account_eligible: "1",
    use_simple_pagination: "1",
    is_default_product_list: "1",
    is_auto_delivery_first: "1",
    is_with_promotion: "1",
    is_exclusive: "false",
    is_include_instant_delivery: "true",
    is_available_for_sale: "true",
    include_all_attribute: "true",
    include_attributes: "true",
  };
  if (itemInfoId) params.item_info_id = itemInfoId;
  if (gameId) params.game_id = gameId;
  if (itemTypeId) params.item_type_id = itemTypeId;
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.append("country_codes[]", "TH");
  return url.toString();
}

function apiPageData(response) {
  const candidates = [response, response?.data, response?.data?.data];
  return candidates.find((value) => value && typeof value === "object" && Array.isArray(value.data)) || null;
}

async function fetchAllItemkuOffers(denominations, rates, fetchJson, market) {
  const first = apiPageData(await fetchJson(itemkuProductApiUrl(market, 1)));
  if (!first) throw new Error("อ่านรายการ Seller จาก itemku API ไม่ได้");
  const pageCount = Math.max(1, Math.ceil((Number(first.total_item) || first.data.length) / 100));
  const remaining = pageCount > 1
    ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => fetchJson(itemkuProductApiUrl(market, index + 2)).then(apiPageData)))
    : [];
  const denominationById = new Map(denominations.map((denomination) => [String(denomination.id), denomination]));
  return [first, ...remaining].flatMap((page) => page?.data || []).map((product) => {
    const denomination = denominationById.get(String(product.item_info_id));
    return denomination ? normalizeProduct(product, denomination, rates, denomination.sourceUrl) : null;
  }).filter(Boolean);
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function loadItemkuPage(game, requestedGroup, games, fetchHtml, fetchJson) {
  const sourceUrl = itemkuGameUrl(game.slug);
  const catalog = parseItemkuCatalogHtml(await fetchHtml(sourceUrl));
  const selectedGroup = requestedGroup === ITEMKU_ALL_GROUPS
    ? { value: ITEMKU_ALL_GROUPS, label: "ทุกหมวดหมู่", denominations: catalog.groups.flatMap((group) => group.denominations) }
    : catalog.groups.find((group) => group.value === requestedGroup) || { value: ITEMKU_ALL_GROUPS, label: "ทุกหมวดหมู่", denominations: catalog.groups.flatMap((group) => group.denominations) };
  const denominations = selectedGroup.denominations.map((denomination) => ({ ...denomination, sourceUrl: `${sourceUrl}/${denomination.slug}` }));
  const offers = fetchJson
    ? await fetchAllItemkuOffers(denominations, catalog.rates, fetchJson, { gameId: catalog.gameId, itemTypeId: catalog.itemTypeId })
    : (await mapLimit(denominations, 4, async (denomination) => parseItemkuDenominationHtml(await fetchHtml(denomination.sourceUrl), denomination).offers)).flat();
  const unique = [...new Map(offers.map((offer) => [offer.itemId, offer])).values()];
  if (!unique.length) throw new Error("ไม่พบรายการ Seller ในหน้า itemku");
  const fetchedAt = new Date().toISOString();
  return {
    provider: "itemku",
    providerLabel: "itemku",
    detailLabels: { volume: "Sold", rating: "Rating", delivery: "Delivery" },
    sourceUrl,
    totalListings: unique.length,
    offers: unique,
    groups: groupItemkuOffers(unique),
    game: game.value,
    gameLabel: game.label,
    games,
    productType: selectedGroup.value,
    productTypeLabel: selectedGroup.label,
    productTypes: [
      { value: ITEMKU_ALL_GROUPS, label: "ทุกหมวดหมู่" },
      ...catalog.groups.map(({ value, label }) => ({ value, label })),
    ],
    filters: catalog.groups.map(({ label, denominations }) => ({ label, totalListings: denominations.length })),
    fetchedAt,
    nextRefreshAt: new Date(Date.parse(fetchedAt) + ITEMKU_CACHE_TTL_MS).toISOString(),
  };
}

export async function fetchItemkuPage(requestedGame = "zepeto", requestedGroup, { force = false, fetchHtml = itemkuFetch, fetchJson = itemkuApiFetch, store } = {}) {
  const games = await loadItemkuGames();
  const game = normalizeItemkuGame(requestedGame, games);
  if (!game) throw new Error("ยังไม่มีเกมในรายการเทียบราคา");
  const group = normalizeItemkuGroup(requestedGroup);
  return resolveGameinfoPricePage({
    market: "itemku",
    game: game.value,
    productType: group,
    games,
    cache: itemkuCache,
    cacheKey: `${game.value}:${group}`,
    ttlMs: ITEMKU_CACHE_TTL_MS,
    force,
    store,
    // itemku's reader proxy fails often enough that a failed refresh has always
    // kept the last good page on screen instead of showing an error.
    serveStoredOnError: true,
    load: () => loadItemkuPage(game, group, games, fetchHtml, fetchJson),
  });
}

export function clearItemkuCache() {
  itemkuCache.clear();
}

// Proves the pasted link really is an itemku Top Up page before it is saved, and
// brings back the name to store alongside the slug.
export async function inspectItemkuGame(slug, { fetchHtml = itemkuFetch } = {}) {
  const html = await fetchHtml(itemkuGameUrl(slug));
  parseItemkuCatalogHtml(html);
  return { slug, label: parseItemkuGameLabel(html, slug) };
}
