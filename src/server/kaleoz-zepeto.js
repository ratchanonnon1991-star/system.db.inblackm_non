import { DEFAULT_KALEOZ_GAMES, listKaleozGames, saveKaleozGameLabel } from "@/server/kaleoz-games-repository";
import { resolveGameinfoPricePage } from "@/server/gameinfo-price-page-store";

const KALEOZ_ORIGIN = "https://www.kaleoz.com";
const KALEOZ_ITEM_LIST_URL = `${KALEOZ_ORIGIN}/ajax/item-list`;
const KALEOZ_ITEM_CATEGORY_URL = `${KALEOZ_ORIGIN}/ajax/item-category`;
export const KALEOZ_CACHE_TTL_MS = 60 * 60 * 1000;
export const KALEOZ_UNCATEGORIZED_LABEL = "ไม่ระบุหมวดหมู่";
export const KALEOZ_ALL_CATEGORIES_LABEL = "ทุกหมวดหมู่";

const kaleozCache = globalThis.__gameinfoKaleozCache || new Map();
const kaleozCatalogCache = globalThis.__gameinfoKaleozCatalogCache || new Map();
globalThis.__gameinfoKaleozCache = kaleozCache;
globalThis.__gameinfoKaleozCatalogCache = kaleozCatalogCache;

export function normalizeKaleozCategoryLabels(page) {
  if (!page?.productTypes?.length) return page;
  const [allCategories, ...categories] = page.productTypes;
  return {
    ...page,
    productTypeLabel: page.productType === allCategories.value ? KALEOZ_ALL_CATEGORIES_LABEL : page.productTypeLabel,
    productTypes: [{ ...allCategories, label: KALEOZ_ALL_CATEGORIES_LABEL }, ...categories],
  };
}

export function kaleozGameUrl(slug) {
  return `${KALEOZ_ORIGIN}/buy/${slug}?page=1`;
}

// Games saved before labels included the region/platform tags carry no
// labelRefreshedAt; pull their real name off Kaleoz once and store it, so the
// list catches up without anyone editing it by hand. One attempt per boot keeps
// a game whose page is temporarily down from being refetched on every load.
const labelRefreshAttempted = new Set();

async function refreshStaleLabels(games) {
  const stale = games.filter((game) => !game.labelRefreshedAt && !labelRefreshAttempted.has(game.value));
  if (!stale.length) return games;
  const renamed = new Map();
  await Promise.all(stale.map(async (game) => {
    labelRefreshAttempted.add(game.value);
    try {
      const label = parseKaleozGameLabel(await kaleozFetch(kaleozGameUrl(game.slug)));
      if (!label) return;
      await saveKaleozGameLabel(game.value, label);
      renamed.set(game.value, label);
    } catch {
      // Keep the stored label and try again after the next restart.
    }
  }));
  return games.map((game) => renamed.has(game.value) ? { ...game, label: renamed.get(game.value) } : game);
}

// The saved game list is the source of truth; the seed list only keeps the page
// usable when the gameinfo database is unreachable.
export async function loadKaleozGames() {
  try {
    const games = await listKaleozGames();
    return games.length ? await refreshStaleLabels(games) : DEFAULT_KALEOZ_GAMES;
  } catch {
    return DEFAULT_KALEOZ_GAMES;
  }
}

export function normalizeKaleozGame(value, games) {
  return games.find((item) => item.value === value) || games[0];
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

// Kaleoz titles contain ">" ("ZEPETO > 9700 Coins"), and those titles are also
// attribute values, so an attribute run has to step over quoted sections instead
// of stopping at the first ">" it sees.
const TAG_ATTRS = /(?:"[^"]*"|'[^']*'|[^>])*/.source;
const TITLE_CELL_RE = new RegExp(`<div class=["']cell tit["'](${TAG_ATTRS})>`, "i");
const ITEM_PIC_RE = new RegExp(`<img class=["']ItemPic["'](${TAG_ATTRS})>`, "i");

function attr(html, name) {
  return decodeHtml(new RegExp(`\\b${name}=["']([^"']*)["']`, "i").exec(html)?.[1] || "").trim();
}

function text(html, pattern) {
  return decodeHtml(pattern.exec(html)?.[1] || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return value.toLocaleLowerCase("en").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "property";
}

function uniqueValues(items) {
  const used = new Map();
  return items.map((item) => {
    const base = slugify(item.label);
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return { ...item, value: count === 1 ? base : `${base}-${count}` };
  });
}

function parseSelect(html, { includeAllProperties = false } = {}) {
  const select = /<select\b([^>]*)>([\s\S]*?)<\/select>/i.exec(html);
  if (!select) return null;
  const options = [...select[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
    .map((match) => ({ value: attr(match[1], "value"), label: decodeHtml(match[2]).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() }))
    .filter((option) => option.value && (includeAllProperties || option.value !== "0") && option.label);
  return { name: attr(select[1], "name"), options };
}

// The game header carries the name plus the tags that tell two editions apart
// ("Global"/"Mobile"), with the publisher in the same list. Keep every tag but
// the publisher, so "Auto Chess" reads as "Auto Chess · Global · Mobile".
export function parseKaleozGameLabel(html) {
  const info = /<div\s+id=["']game_info["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1] || html;
  const name = text(info, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!name) return "";
  const tags = [...info.matchAll(/<li>\s*<span([^>]*)>([\s\S]*?)<\/span>\s*<\/li>/gi)]
    .filter((match) => !/\bclass=["'][^"']*\bpublisher\b/i.test(match[1]))
    .map((match) => decodeHtml(match[2]).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return [name, ...tags].join(" · ");
}

export function parseKaleozGameCatalogHtml(html) {
  const clientDataText = /window\.clientData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i.exec(html)?.[1];
  if (!clientDataText) throw new Error("ไม่พบข้อมูลเกมจาก Kaleoz");
  const clientData = JSON.parse(clientDataText);
  const propertyHtml = /<div\s+id=["']item_property["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i.exec(html)?.[1] || "";
  const property = parseSelect(propertyHtml, { includeAllProperties: true });
  if (!property?.name || !property.options.length) throw new Error("เกมนี้ยังไม่มี Properties สำหรับเทียบราคา");
  return {
    gameLabel: parseKaleozGameLabel(html),
    gameId: String(clientData.game_id),
    categoryId: String(clientData.category_id),
    propertyName: property.name,
    propertyLabel: text(propertyHtml, /<h3[^>]*>([\s\S]*?)<\/h3>/i) || "Category",
    options: property.options,
  };
}

export function extractZepetoPackQuantity(title) {
  const outsideParentheses = title.replace(/\([^)]*\)/g, " ");
  const token = outsideParentheses.match(/\d+(?:[.,]\d+)?\s*k?/i)?.[0];
  if (!token) return null;
  return Number(token.replace(/k/i, "").replace(/,/g, "").trim()) * (/k/i.test(token) ? 1000 : 1);
}

export function parseKaleozZepetoHtml(html, { slug = "zepeto", sourceUrl = `${KALEOZ_ORIGIN}/buy/zepeto?page=1` } = {}) {
  const totalListings = Number(/data-item-count=["'](\d+)["']/i.exec(html)?.[1]) || 0;
  const chunks = html.split(/<div class=["']unit["'](?=\s|>)/i).slice(1);
  const offers = chunks.flatMap((chunk) => {
    const titleCell = TITLE_CELL_RE.exec(chunk)?.[1];
    if (!titleCell) return [];
    const itemId = attr(titleCell, "itemId");
    const title = attr(titleCell, "eventlabel");
    const price = Number(attr(titleCell, "price"));
    const stock = Number(attr(chunk.slice(0, 300), "data-stock"));
    return [{
      itemId,
      title,
      quantity: extractZepetoPackQuantity(title),
      price: Number.isFinite(price) ? price : null,
      currency: attr(titleCell, "currency"),
      seller: attr(titleCell, "sellerName"),
      sellerLevel: text(chunk, /class=["']user-level["'][^>]*>\s*<span>([\s\S]*?)<\/span>/i),
      imageUrl: attr(ITEM_PIC_RE.exec(chunk)?.[1] || "", "data-original"),
      productUrl: itemId ? `${KALEOZ_ORIGIN}/buy/${slug}/${itemId}` : sourceUrl,
      server: text(chunk, /Server:\s*([^<]+)/i),
      stock: Number.isFinite(stock) ? stock : null,
      stockText: text(chunk, /class=["']stock["']>\s*Stock:\s*([^<]+)/i),
      tradingVolume: Number(text(chunk, /class=["']trade["']>\s*Trading volume:\s*([\d,]+)/i).replace(/,/g, "")) || 0,
      unitPrice: text(chunk, /class=["']unitprice["']>([\s\S]*?)<\/li>/i),
      promo: attr(chunk.slice(0, 300), "data-item-promotion") === "1",
    }];
  });
  return { sourceUrl, totalListings, offers };
}

export function groupKaleozZepetoOffers(offers) {
  const groups = new Map();
  for (const offer of offers) {
    const key = offer.packLabel || (offer.quantity == null ? `unknown:${offer.itemId}` : String(offer.quantity));
    const group = groups.get(key) || { key, quantity: offer.quantity, packLabel: offer.packLabel, packOrder: offer.packOrder, offers: [] };
    group.offers.push(offer);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      offers: group.offers.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)),
      sellers: [...new Set(group.offers.map((offer) => offer.seller).filter(Boolean))],
      stock: group.offers.reduce((sum, offer) => sum + (offer.stock || 0), 0),
      tradingVolume: group.offers.reduce((sum, offer) => sum + offer.tradingVolume, 0),
    }))
    .sort((a, b) => (a.packOrder ?? Infinity) - (b.packOrder ?? Infinity) || (a.quantity ?? Infinity) - (b.quantity ?? Infinity));
}

async function kaleozFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "th-TH,th;q=0.9,en;q=0.8",
      "user-agent": "GameInfo Kaleoz Partner Price Compare/1.0",
      ...options.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Kaleoz ตอบกลับ ${response.status}`);
  return response.text();
}

async function discoverGameCatalog(game) {
  const sourceUrl = kaleozGameUrl(game.slug);
  const context = parseKaleozGameCatalogHtml(await kaleozFetch(sourceUrl));
  const discovered = await Promise.all(context.options.filter((option) => option.value !== "0").map(async (option) => {
    const body = new URLSearchParams({ name: context.propertyName, prop_id: option.value });
    const child = parseSelect(await kaleozFetch(KALEOZ_ITEM_CATEGORY_URL, {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    }));
    const parentPath = [{ name: context.propertyName, value: option.value }];
    const packs = child?.options.length
      ? child.options.map((childOption) => ({ label: childOption.label, path: [...parentPath, { name: child.name, value: childOption.value }] }))
      : [{ label: option.label, path: parentPath }];
    return { value: option.value, label: option.label, packs };
  }));
  // Kaleoz's own "All Properties" is just an unfiltered list, which loses which
  // category each listing belongs to. Build our own instead: every pack of every
  // category, plus one unfiltered sweep for listings that carry no property at
  // all — those show up only in the unfiltered list and would otherwise be lost.
  // Ours does not depend on the site offering that option, or on how it is named.
  const categories = uniqueValues(discovered);
  const allCategories = {
    value: categories.some((type) => type.value === "all") ? "all-categories" : "all",
    label: KALEOZ_ALL_CATEGORIES_LABEL,
    packs: [
      ...categories.flatMap((type) => type.packs),
      { label: KALEOZ_UNCATEGORIZED_LABEL, path: [] },
    ],
  };
  return { ...context, sourceUrl, productTypes: [allCategories, ...categories] };
}

async function getGameCatalog(game, force = false) {
  if (force) kaleozCatalogCache.delete(game.value);
  const cached = kaleozCatalogCache.get(game.value);
  if (cached?.value) return cached.value;
  if (cached?.promise) return cached.promise;
  const promise = discoverGameCatalog(game);
  kaleozCatalogCache.set(game.value, { promise });
  try {
    const value = await promise;
    kaleozCatalogCache.set(game.value, { value });
    return value;
  } catch (error) {
    kaleozCatalogCache.delete(game.value);
    throw error;
  }
}

async function fetchFilteredPackPage({ catalog, game, definition }, page) {
  const body = new URLSearchParams({
    game_id: catalog.gameId,
    category_id: catalog.categoryId,
    sort: "hot",
    page: String(page),
    server_id: "0",
  });
  definition.path.forEach((property, index) => {
    body.set(`props[${index}][name]`, property.name);
    body.set(`props[${index}][prop_value]`, property.value);
  });
  const html = await kaleozFetch(KALEOZ_ITEM_LIST_URL, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
  });
  return parseKaleozZepetoHtml(html, { slug: game.slug, sourceUrl: catalog.sourceUrl });
}

async function fetchFilteredPack(catalog, game, definition, packOrder) {
  const first = await fetchFilteredPackPage({ catalog, game, definition }, 1);
  const pageCount = Math.ceil(first.totalListings / 12);
  const remaining = pageCount > 1
    ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => fetchFilteredPackPage({ catalog, game, definition }, index + 2)))
    : [];
  return {
    label: definition.label,
    unfiltered: !definition.path.length,
    totalListings: first.totalListings,
    offers: [first, ...remaining].flatMap((result) => result.offers).map((offer) => ({ ...offer, packLabel: definition.label, packOrder })),
  };
}

async function loadKaleozPage(game, requestedType, games, force) {
  const catalog = await getGameCatalog(game, force);
  const productType = catalog.productTypes.find((type) => type.value === requestedType) || catalog.productTypes[0];
  if (!productType) throw new Error("ไม่พบหมวดสินค้าของเกมนี้");
  const results = await Promise.all(productType.packs.map((definition, index) => fetchFilteredPack(catalog, game, definition, index)));
  // Packs are fetched in catalog order and the unfiltered sweep runs last, so
  // keeping the first hit per listing lets a real pack name win over the sweep.
  const offersByItemId = new Map();
  for (const offer of results.flatMap((result) => result.offers)) {
    if (!offersByItemId.has(offer.itemId)) offersByItemId.set(offer.itemId, offer);
  }
  const offers = [...offersByItemId.values()];
  if (!offers.length) throw new Error("ไม่พบรายการสินค้าในหน้า Kaleoz");
  // The sweep already counts every listing, so summing the packs on top of it
  // would double-count them.
  const sweep = results.find((result) => result.unfiltered);
  const fetchedAt = new Date().toISOString();
  return {
    provider: "kaleoz",
    providerLabel: "Kaleoz",
    detailLabels: { volume: "Trading volume", stock: "Stock", server: "Server" },
    sourceUrl: catalog.sourceUrl,
    totalListings: sweep ? sweep.totalListings : results.reduce((sum, result) => sum + result.totalListings, 0),
    offers,
    groups: groupKaleozZepetoOffers(offers),
    game: game.value,
    gameLabel: game.label,
    games,
    productType: productType.value,
    productTypeLabel: productType.label,
    productTypes: catalog.productTypes.map(({ value, label }) => ({ value, label })),
    filters: results.map(({ label, totalListings }) => ({ label, totalListings })),
    fetchedAt,
    nextRefreshAt: new Date(Date.parse(fetchedAt) + KALEOZ_CACHE_TTL_MS).toISOString(),
  };
}

export async function fetchKaleozPage(requestedGame = "zepeto", requestedType, { force = false, store } = {}) {
  const games = await loadKaleozGames();
  const game = normalizeKaleozGame(requestedGame, games);
  if (!game) throw new Error("ยังไม่มีเกมในรายการเทียบราคา");
  return resolveGameinfoPricePage({
    market: "kaleoz",
    game: game.value,
    productType: requestedType || "",
    games,
    cache: kaleozCache,
    cacheKey: `${game.value}:${requestedType || "default"}`,
    ttlMs: KALEOZ_CACHE_TTL_MS,
    force,
    store,
    normalize: normalizeKaleozCategoryLabels,
    load: () => loadKaleozPage(game, requestedType, games, force),
  });
}

export function clearKaleozGameCache(value) {
  kaleozCatalogCache.delete(value);
  for (const key of kaleozCache.keys()) {
    if (key.startsWith(`${value}:`)) kaleozCache.delete(key);
  }
}

// Used before saving a new game: proves the slug really has a Kaleoz page we can
// parse, and takes the display name straight off that page.
export async function inspectKaleozGame(slug) {
  const catalog = parseKaleozGameCatalogHtml(await kaleozFetch(kaleozGameUrl(slug)));
  return { slug, label: catalog.gameLabel || slug };
}

export async function fetchKaleozZepetoPage(requestedType, options) {
  return fetchKaleozPage("zepeto", requestedType, options);
}

export function normalizeKaleozProductType(value) {
  return typeof value === "string" && value ? value : undefined;
}
