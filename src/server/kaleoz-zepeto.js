const KALEOZ_ORIGIN = "https://www.kaleoz.com";
const KALEOZ_ITEM_LIST_URL = `${KALEOZ_ORIGIN}/ajax/item-list`;
const KALEOZ_ITEM_CATEGORY_URL = `${KALEOZ_ORIGIN}/ajax/item-category`;
export const KALEOZ_CACHE_TTL_MS = 60 * 60 * 1000;

export const KALEOZ_GAMES = [
  { value: "zepeto", label: "ZEPETO", slug: "zepeto" },
  { value: "honkai-impact", label: "HONKAI IMPACT", slug: "honkai-impact-3-asia" },
  { value: "love-and-deepspace", label: "LOVE AND DEEPSPACE", slug: "love-and-deepspace" },
  { value: "harry-magic", label: "HARRY MAGIC", slug: "harry-potter-ma-netease" },
  { value: "the-division-resurgence", label: "The Division Resurgence", slug: "the-division-resurgence" },
  { value: "auto-chess", label: "AUTO CHESS", slug: "auto-chess-mobile-global" },
  { value: "world-war-heroes", label: "WORLD WAR HEROES / WWH", available: false },
  { value: "gangstar-mirage-city", label: "Gangstar Mirage City", slug: "gangstar-mirage-city" },
  { value: "honkai-star-rail", label: "HONKAI STAR RAIL", slug: "honkai-star-rail" },
  { value: "zenless-zone-zero", label: "ZENLESS ZONE ZERO", slug: "zenless-zone-zero" },
  { value: "destiny-rising", label: "DESTINY:RISING", slug: "destiny-rising" },
  { value: "mobile-legends", label: "MOBILE LEGENDS", slug: "mobile-legends" },
  { value: "punishing-gray-raven", label: "PUNISHING GRAY RAVEN", slug: "punishing-gray-raven-global" },
];

const kaleozCache = globalThis.__gameinfoKaleozCache || new Map();
const kaleozCatalogCache = globalThis.__gameinfoKaleozCatalogCache || new Map();
globalThis.__gameinfoKaleozCache = kaleozCache;
globalThis.__gameinfoKaleozCatalogCache = kaleozCatalogCache;

export function normalizeKaleozGame(value) {
  const game = KALEOZ_GAMES.find((item) => item.value === value && item.available !== false);
  return game?.value || "zepeto";
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

export function parseKaleozGameCatalogHtml(html) {
  const clientDataText = /window\.clientData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i.exec(html)?.[1];
  if (!clientDataText) throw new Error("ไม่พบข้อมูลเกมจาก Kaleoz");
  const clientData = JSON.parse(clientDataText);
  const propertyHtml = /<div\s+id=["']item_property["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i.exec(html)?.[1] || "";
  const property = parseSelect(propertyHtml, { includeAllProperties: true });
  if (!property?.name || !property.options.length) throw new Error("เกมนี้ยังไม่มี Properties สำหรับเทียบราคา");
  return {
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
    const titleCell = /<div class=["']cell tit["']([^>]*)>/i.exec(chunk)?.[1];
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
      imageUrl: attr(/<img class=["']ItemPic["']([^>]*)>/i.exec(chunk)?.[1] || "", "data-original"),
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
  const sourceUrl = `${KALEOZ_ORIGIN}/buy/${game.slug}?page=1`;
  const context = parseKaleozGameCatalogHtml(await kaleozFetch(sourceUrl));
  const discovered = await Promise.all(context.options.map(async (option) => {
    if (option.value === "0") {
      return { label: option.label, packs: [{ label: option.label, path: [], aggregate: true }] };
    }
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
    return { label: option.label, packs };
  }));
  return { ...context, sourceUrl, productTypes: uniqueValues(discovered) };
}

async function getGameCatalog(game) {
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
    totalListings: first.totalListings,
    offers: [first, ...remaining].flatMap((result) => result.offers).map((offer) => definition.aggregate
      ? offer
      : { ...offer, packLabel: definition.label, packOrder }),
  };
}

async function loadKaleozPage(game, requestedType) {
  const catalog = await getGameCatalog(game);
  const productType = catalog.productTypes.find((type) => type.value === requestedType) || catalog.productTypes[0];
  if (!productType) throw new Error("ไม่พบหมวดสินค้าของเกมนี้");
  const results = await Promise.all(productType.packs.map((definition, index) => fetchFilteredPack(catalog, game, definition, index)));
  const offers = [...new Map(results.flatMap((result) => result.offers).map((offer) => [offer.itemId, offer])).values()];
  if (!offers.length) throw new Error("ไม่พบรายการสินค้าในหน้า Kaleoz");
  const fetchedAt = new Date().toISOString();
  return {
    sourceUrl: catalog.sourceUrl,
    totalListings: results.reduce((sum, result) => sum + result.totalListings, 0),
    offers,
    groups: groupKaleozZepetoOffers(offers),
    game: game.value,
    gameLabel: game.label,
    games: KALEOZ_GAMES.map(({ value, label, available = true }) => ({ value, label, available })),
    productType: productType.value,
    productTypeLabel: productType.label,
    productTypes: catalog.productTypes.map(({ value, label }) => ({ value, label })),
    filters: results.map(({ label, totalListings }) => ({ label, totalListings })),
    fetchedAt,
    nextRefreshAt: new Date(Date.parse(fetchedAt) + KALEOZ_CACHE_TTL_MS).toISOString(),
  };
}

export async function fetchKaleozPage(requestedGame = "zepeto", requestedType, { force = false } = {}) {
  const gameKey = normalizeKaleozGame(requestedGame);
  const game = KALEOZ_GAMES.find((item) => item.value === gameKey);
  const cacheKey = `${gameKey}:${requestedType || "default"}`;
  const cached = kaleozCache.get(cacheKey);
  if (!force && cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (!force && cached?.promise) return cached.promise;
  const promise = loadKaleozPage(game, requestedType);
  kaleozCache.set(cacheKey, { ...cached, promise });
  try {
    const value = await promise;
    kaleozCache.set(cacheKey, { value, expiresAt: Date.now() + KALEOZ_CACHE_TTL_MS });
    return value;
  } catch (error) {
    if (cached?.value) kaleozCache.set(cacheKey, cached);
    else kaleozCache.delete(cacheKey);
    throw error;
  }
}

export async function fetchKaleozZepetoPage(requestedType, options) {
  return fetchKaleozPage("zepeto", requestedType, options);
}

export function normalizeKaleozProductType(value) {
  return typeof value === "string" && value ? value : undefined;
}
