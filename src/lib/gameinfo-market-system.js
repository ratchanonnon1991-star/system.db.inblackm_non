export const GAMEINFO_MARKETS = Object.freeze([
  { key: "kaleoz", label: "Kaleoz", identity: "normalized" },
  { key: "itemku", label: "Itemku", identity: "stable-id" },
  { key: "g2g", label: "G2G", identity: "stable-id" },
]);
export const GAMEINFO_FUTURE_MARKETS = Object.freeze(["playerok"]);

export const GAMEINFO_MARKET_KEYS = new Set(GAMEINFO_MARKETS.map((market) => market.key));
export const GAMEINFO_PRICE_ALERT_THRESHOLD = 5;
export const GAMEINFO_COMPARE_PAGE_SIZE = 50;
export const GAMEINFO_COMPARE_SELLER_LIMIT = 200;
export const GAMEINFO_COMPARE_DEFAULT_SELLERS = 5;

export function selectGameinfoCompareSellerKeys(available, ownSellerKeys, selectedSellerKeys) {
  const availableKeys = new Set((available || []).map((seller) => seller.value));
  const own = (ownSellerKeys || []).filter((key) => availableKeys.has(key));
  const requested = (selectedSellerKeys || []).filter((key) => availableKeys.has(key));
  const defaults = requested.length ? requested : (available || []).map((seller) => seller.value);
  return [...new Set([...own, ...defaults])].slice(
    0,
    requested.length ? GAMEINFO_COMPARE_SELLER_LIMIT : GAMEINFO_COMPARE_DEFAULT_SELLERS
  );
}

// Market listings prefix tags such as "[INSTANT]" or "【AUTO】" onto the pack
// title, and those tags come and go when a seller swaps packs around. The name
// is the mapping identity, so only the *display* drops the leading tags — the
// stored/compared value must stay untouched.
export function gameinfoMarketPackDisplayName(value) {
  let text = String(value ?? "").trim();
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(/^[\[({【（][^\])}】）]*[\])}】）]\s*/u, "").trim();
  }
  return text || String(value ?? "").trim();
}

// Market game names are stored exactly as the market spells them, which is far
// too long for a select trigger, so the UI shows the short region wording.
export function gameinfoMarketGameLabel(value) {
  return String(value ?? "").replaceAll("South East Asia", "SEA");
}

// The mapping page can look at one data mode or at both at once ("all"), since
// a market pack list usually holds UID and ID/PASS packs side by side.
export const GAMEINFO_MAPPING_VIEW_MODES = Object.freeze(["all", "uid", "idpass"]);

export function normalizeGameinfoMappingViewMode(value) {
  const view = String(value || "").trim().toLowerCase();
  return GAMEINFO_MAPPING_VIEW_MODES.includes(view) ? view : "uid";
}

export function gameinfoMappingViewModes(view) {
  return normalizeGameinfoMappingViewMode(view) === "all" ? ["uid", "idpass"] : [normalizeGameinfoMappingViewMode(view)];
}

export function buildGameinfoOrderedMappingDraft(packs, marketPacks, skippedPackIds = new Set()) {
  const candidates = (packs || []).filter((pack) => !pack.mapping && !skippedPackIds.has(String(pack.id)));
  return candidates.slice(0, (marketPacks || []).length).map((pack, index) => ({
    packId: pack.id,
    packName: pack.name || pack.id,
    externalPackKey: marketPacks[index].externalPackKey,
    marketPackName: marketPacks[index].name || marketPacks[index].externalPackKey,
  }));
}

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
    .replace(/[^\p{L}\p{M}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildGameinfoOwnSellerReferenceGroups(market, page, sellerNames = []) {
  if (normalizeGameinfoMarket(market) !== "kaleoz") return page;
  const ownSellerKeys = new Set((sellerNames || []).map(normalizeMarketIdentityPart).filter(Boolean));
  if (!ownSellerKeys.size) return page;
  const allOffers = (page?.groups || []).flatMap((group) => group?.offers || []);
  const ownPacks = new Map();
  for (const offer of allOffers) {
    if (!ownSellerKeys.has(normalizeMarketIdentityPart(offer?.seller))) continue;
    const name = String(offer?.title || "").trim();
    const normalizedName = normalizeMarketIdentityPart(name);
    if (!normalizedName) continue;
    const current = ownPacks.get(normalizedName);
    if (!current) ownPacks.set(normalizedName, { name, quantity: offer.quantity, offers: [] });
  }
  for (const offer of allOffers) {
    const pack = ownPacks.get(normalizeMarketIdentityPart(offer?.title));
    if (pack) pack.offers.push(offer);
  }
  return {
    ...page,
    groups: [...ownPacks.entries()].map(([normalizedName, pack], packOrder) => ({
      key: `own-name:${normalizedName}`,
      packLabel: pack.name,
      quantity: pack.quantity,
      offers: pack.offers,
      packOrder,
    })),
  };
}

export function reconcileGameinfoPackMappingTargets(mappings, packs) {
  const packById = new Map((packs || []).map((pack) => [String(pack.id), pack]));
  const packsByName = new Map();
  for (const pack of packs || []) {
    const name = normalizeMarketIdentityPart(pack.name);
    const matches = packsByName.get(name) || [];
    matches.push(pack);
    packsByName.set(name, matches);
  }
  const claimed = new Set((mappings || []).filter((mapping) => packById.has(String(mapping.packId))).map((mapping) => String(mapping.packId)));
  const reconnect = [];
  const remove = [];
  for (const mapping of mappings || []) {
    if (packById.has(String(mapping.packId))) continue;
    const candidates = (packsByName.get(mapping.gameinfoPackName || "") || []).filter((pack) => !claimed.has(String(pack.id)));
    if (mapping.gameinfoPackName && candidates.length === 1) {
      reconnect.push({ mapping, pack: candidates[0] });
      claimed.add(String(candidates[0].id));
    } else {
      remove.push(mapping);
    }
  }
  return { reconnect, remove };
}

export function marketPackIdentity(market, { key, name, category, amount } = {}) {
  const normalizedMarket = normalizeGameinfoMarket(market);
  if (["itemku", "g2g"].includes(normalizedMarket) && key != null && String(key).trim()) {
    return `${normalizedMarket}:${String(key).trim()}`;
  }
  const parts = [name, category, amount].map(normalizeMarketIdentityPart);
  return `${normalizedMarket}:${parts.join("|")}`;
}

function normalizeMarketOffers(offers) {
  const bySeller = new Map();
  for (const offer of offers || []) {
    if (!offer?.seller || !Number.isFinite(Number(offer.price))) continue;
    const sellerKey = normalizeMarketIdentityPart(offer.seller);
    if (!sellerKey) continue;
    const normalized = {
      sellerKey,
      sellerName: String(offer.seller).trim(),
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
        priceIdr: offer.priceIdr ?? null,
        fxIdrPerThb: offer.fxIdrPerThb ?? null,
      },
    };
    const current = bySeller.get(sellerKey);
    if (!current || normalized.price < current.price) bySeller.set(sellerKey, normalized);
  }
  return [...bySeller.values()];
}

export function normalizeMarketPage(market, page) {
  const normalizedMarket = normalizeGameinfoMarket(market);
  const identities = (page?.groups || []).map((group, index) => {
    const name = String(group?.packLabel || group?.key || `Pack ${index + 1}`).trim();
    return marketPackIdentity(normalizedMarket, {
      key: group?.key,
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
      offers: normalizeMarketOffers(group?.offers),
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
  const average = (base + current) / 2;
  const percent = average > 0 ? Math.abs(difference) / average * 100 : 0;
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
