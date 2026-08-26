const KALEOZ_URL = "https://www.kaleoz.com/buy/zepeto?page=1";
const KALEOZ_ITEM_LIST_URL = "https://www.kaleoz.com/ajax/item-list";
export const KALEOZ_CACHE_TTL_MS = 60 * 60 * 1000;
const kaleozCache = globalThis.__gameinfoKaleozCache || new Map();
globalThis.__gameinfoKaleozCache = kaleozCache;
const PRODUCT_TYPES = {
  zems: {
    label: "ZEMs",
    categoryValue: "7974",
    packs: [[7, "10696"], [14, "10697"], [28, "10698"], [58, "10699"], [128, "10700"], [323, "10702"], [1000, "10703"]],
  },
  coins: {
    label: "Coins",
    categoryValue: "7975",
    packs: [[4680, "10704"], [9700, "10705"], [25200, "10706"], [40700, "10707"], [110000, "10708"], [300000, "10709"]],
  },
  premium: {
    label: "Premium",
    categoryValue: "11766",
    packs: [["Premium 1M", null]],
  },
};

export function normalizeKaleozProductType(value) {
  return Object.hasOwn(PRODUCT_TYPES, value) ? value : "zems";
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
  return decodeHtml(new RegExp(`\\b${name}="([^"]*)"`, "i").exec(html)?.[1] || "").trim();
}

function text(html, pattern) {
  return decodeHtml(pattern.exec(html)?.[1] || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function extractZepetoPackQuantity(title) {
  const outsideParentheses = title.replace(/\([^)]*\)/g, " ");
  const token = outsideParentheses.match(/\d+(?:[.,]\d+)?\s*k?/i)?.[0];
  if (!token) return null;
  return Number(token.replace(/k/i, "").replace(/,/g, "").trim()) * (/k/i.test(token) ? 1000 : 1);
}

export function parseKaleozZepetoHtml(html) {
  const totalListings = Number(/data-item-count="(\d+)"/i.exec(html)?.[1]) || 0;
  const chunks = html.split(/<div class="unit"(?=\s|>)/i).slice(1);
  const offers = chunks.flatMap((chunk) => {
    const titleCell = /<div class="cell tit"([^>]*)>/i.exec(chunk)?.[1];
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
      sellerLevel: text(chunk, /class="user-level"[^>]*>\s*<span>([\s\S]*?)<\/span>/i),
      imageUrl: attr(/<img class="ItemPic"([^>]*)>/i.exec(chunk)?.[1] || "", "data-original"),
      productUrl: itemId ? `https://www.kaleoz.com/buy/zepeto/${itemId}` : KALEOZ_URL,
      server: text(chunk, /Server:\s*([^<]+)/i),
      stock: Number.isFinite(stock) ? stock : null,
      stockText: text(chunk, /class="stock">\s*Stock:\s*([^<]+)/i),
      tradingVolume: Number(text(chunk, /class="trade">\s*Trading volume:\s*([\d,]+)/i).replace(/,/g, "")) || 0,
      unitPrice: text(chunk, /class="unitprice">([\s\S]*?)<\/li>/i),
      promo: attr(chunk.slice(0, 300), "data-item-promotion") === "1",
    }];
  });
  return { sourceUrl: KALEOZ_URL, totalListings, offers };
}

export function groupKaleozZepetoOffers(offers) {
  // ponytail: grouping follows the requested first outside-parentheses number;
  // add currency/type to the key if same-number ZEM/Coin collisions appear.
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

async function fetchFilteredPackPage({ categoryValue, filterValue }, page) {
  const body = new URLSearchParams({
    game_id: "641",
    category_id: "983",
    sort: "hot",
    page: String(page),
    server_id: "0",
    "props[0][name]": "prop[629]",
    "props[0][prop_value]": categoryValue,
  });
  if (filterValue) {
    body.set("props[1][name]", `prop[629][${categoryValue}]`);
    body.set("props[1][prop_value]", filterValue);
  }
  const response = await fetch(KALEOZ_ITEM_LIST_URL, {
    method: "POST",
    body,
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "th-TH,th;q=0.9,en;q=0.8",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "GameInfo Kaleoz Partner Price Compare/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Kaleoz ตอบกลับ ${response.status}`);
  return parseKaleozZepetoHtml(await response.text());
}

async function fetchFilteredPack(definition) {
  const first = await fetchFilteredPackPage(definition, 1);
  const pageCount = Math.ceil(first.totalListings / 12);
  const remaining = pageCount > 1
    ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => fetchFilteredPackPage(definition, index + 2)))
    : [];
  return {
    label: definition.label,
    totalListings: first.totalListings,
    offers: [first, ...remaining].flatMap((result) => result.offers).map((offer) => ({
      ...offer,
      packLabel: definition.label,
      packOrder: definition.packOrder,
    })),
  };
}

async function loadKaleozZepetoPage(requestedType) {
  const productType = normalizeKaleozProductType(requestedType);
  const typeConfig = PRODUCT_TYPES[productType];
  const definitions = typeConfig.packs.map(([quantity, filterValue], packOrder) => ({
    categoryValue: typeConfig.categoryValue,
    filterValue,
    label: typeof quantity === "number" ? `${quantity.toLocaleString("en-US")} ${typeConfig.label}` : quantity,
    packOrder,
  }));
  const results = await Promise.all(definitions.map(fetchFilteredPack));
  const offers = [...new Map(results.flatMap((result) => result.offers).map((offer) => [offer.itemId, offer])).values()];
  if (!offers.length) throw new Error("ไม่พบรายการสินค้าในหน้า Kaleoz");
  const fetchedAt = new Date().toISOString();
  return {
    sourceUrl: KALEOZ_URL,
    totalListings: results.reduce((sum, result) => sum + result.totalListings, 0),
    offers,
    groups: groupKaleozZepetoOffers(offers),
    productType,
    productTypeLabel: typeConfig.label,
    productTypes: Object.entries(PRODUCT_TYPES).map(([value, config]) => ({ value, label: config.label })),
    filters: results.map(({ label, totalListings }) => ({ label, totalListings })),
    fetchedAt,
    nextRefreshAt: new Date(Date.parse(fetchedAt) + KALEOZ_CACHE_TTL_MS).toISOString(),
  };
}

export async function fetchKaleozZepetoPage(requestedType = "zems", { force = false } = {}) {
  const productType = normalizeKaleozProductType(requestedType);
  const cached = kaleozCache.get(productType);
  if (!force && cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (!force && cached?.promise) return cached.promise;

  const promise = loadKaleozZepetoPage(productType);
  kaleozCache.set(productType, { ...cached, promise });
  try {
    const value = await promise;
    kaleozCache.set(productType, { value, expiresAt: Date.now() + KALEOZ_CACHE_TTL_MS });
    return value;
  } catch (error) {
    if (cached?.value) kaleozCache.set(productType, cached);
    else kaleozCache.delete(productType);
    throw error;
  }
}
