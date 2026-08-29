export const GAMEINFO_MARKETS = Object.freeze([
  { key: "kaleoz", label: "Kaleoz", identity: "normalized" },
  { key: "itemku", label: "Itemku", identity: "stable-id" },
]);
export const GAMEINFO_FUTURE_MARKETS = Object.freeze(["playerok", "g2g"]);

export const GAMEINFO_MARKET_KEYS = new Set(GAMEINFO_MARKETS.map((market) => market.key));
export const GAMEINFO_PRICE_ALERT_THRESHOLD = 5;
export const GAMEINFO_COMPARE_PAGE_SIZE = 50;
export const GAMEINFO_COMPARE_SELLER_LIMIT = 12;

export function normalizeGameinfoMarket(value) {
  const market = String(value || "").trim().toLowerCase();
  if (!GAMEINFO_MARKET_KEYS.has(market)) {
    const error = new Error("Market ไม่ถูกต้อง");
    error.status = 400;
    throw error;
  }
  return market;
}

export function normalizeMarketIdentityPart(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[|]+/g, " ")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function marketPackIdentity(market, { key, name, category, amount } = {}) {
  const normalizedMarket = normalizeGameinfoMarket(market);
  if (normalizedMarket === "itemku" && key != null && String(key).trim()) {
    return `itemku:${String(key).trim()}`;
  }
  const parts = [name, category, amount].map(normalizeMarketIdentityPart);
  return `${normalizedMarket}:${parts.join("|")}`;
}

export function normalizeMarketPage(market, page) {
  const normalizedMarket = normalizeGameinfoMarket(market);
  const identities = (page?.groups || []).map((group, index) => {
    const name = String(group?.packLabel || group?.key || `Pack ${index + 1}`).trim();
    return marketPackIdentity(normalizedMarket, {
      key: normalizedMarket === "itemku" ? group?.key : undefined,
      name,
      category: String(page?.productTypeLabel || page?.productType || "").trim(),
      amount: group?.quantity == null ? "" : String(group.quantity),
    });
  });
  const identityCounts = identities.reduce((counts, identity) => counts.set(identity, (counts.get(identity) || 0) + 1), new Map());
  const ambiguities = normalizedMarket === "kaleoz" ? [...identityCounts].filter(([, count]) => count > 1).map(([identity]) => identity) : [];
  const seen = new Set();
  const packs = [];
  for (const [index, group] of (page?.groups || []).entries()) {
    const name = String(group?.packLabel || group?.key || `Pack ${index + 1}`).trim();
    const category = String(page?.productTypeLabel || page?.productType || "").trim();
    const amount = group?.quantity == null ? "" : String(group.quantity);
    const identity = identities[index];
    if (ambiguities.includes(identity)) continue;
    if (seen.has(identity)) continue;
    seen.add(identity);
    packs.push({
      externalPackKey: identity,
      identitySignature: identity,
      listingId: String(group?.offers?.[0]?.itemId || ""),
      name,
      normalizedName: normalizeMarketIdentityPart(name),
      category,
      amount,
      sortOrder: Number.isFinite(group?.packOrder) ? group.packOrder : index,
      metadata: {
        sourceKey: group?.key == null ? "" : String(group.key),
        quantity: group?.quantity ?? null,
      },
      offers: (group?.offers || [])
        .filter((offer) => offer?.seller && Number.isFinite(Number(offer.price)))
        .map((offer) => ({
          sellerKey: normalizeMarketIdentityPart(offer.seller),
          sellerName: String(offer.seller),
          listingId: String(offer.itemId || ""),
          price: Number(offer.price),
          currency: String(offer.currency || ""),
          productUrl: String(offer.productUrl || ""),
          metadata: {
            unitPrice: offer.unitPrice ?? null,
            stock: offer.stock ?? null,
            stockText: offer.stockText ?? null,
            tradingVolume: offer.tradingVolume ?? null,
            sold: offer.sold ?? null,
            rating: offer.rating ?? null,
            delivery: offer.delivery ?? null,
            promo: offer.promo ?? null,
          },
        })),
    });
  }
  return {
    market: normalizedMarket,
    externalGameKey: String(page?.game || ""),
    gameLabel: String(page?.gameLabel || page?.game || ""),
    productType: String(page?.productType || ""),
    fetchedAt: page?.fetchedAt || new Date().toISOString(),
    ambiguities,
    packs,
  };
}

export function calculateGameinfoPriceDifference(basePrice, marketPrice) {
  const base = Number(basePrice);
  if (!Number.isFinite(base) || base <= 0) {
    return { kind: "data_quality", direction: "invalid_base", difference: null, percent: null, alert: true };
  }
  if (marketPrice == null || marketPrice === "") {
    return { kind: "missing_price", direction: "missing", difference: null, percent: null, alert: true };
  }
  const current = Number(marketPrice);
  if (!Number.isFinite(current)) {
    return { kind: "missing_price", direction: "missing", difference: null, percent: null, alert: true };
  }
  const difference = current - base;
  const percent = Math.abs(difference) / base * 100;
  return {
    kind: "price_difference",
    direction: difference < 0 ? "under" : difference > 0 ? "over" : "equal",
    difference,
    percent,
    alert: percent >= GAMEINFO_PRICE_ALERT_THRESHOLD,
  };
}

export function nextGameinfoMarketRunAt(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(2, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
