// Refresh de-duplication for the price-compare page. Kept separate from the
// query-panel diff on purpose: that one addresses cells by row index and column
// id, this one by pack group and seller name, because the columns here can be
// dragged around and sellers come and go between refreshes.

// Everything the table or its tooltip actually shows. Ids, URLs and images are
// left out — a listing can be replaced by an identical one under a new id — and
// so are the fetch timestamps, which change on every poll by definition.
const OFFER_FIELDS = ["price", "currency", "unitPrice", "stock", "stockText", "tradingVolume", "sold", "rating", "delivery", "promo"];

function offerSignature(offer) {
  return OFFER_FIELDS.map((field) => {
    const value = offer?.[field];
    return value == null ? "" : String(value);
  }).join("");
}

// Offers inside a group are sorted by price, so two sellers on the same price can
// swap places between refreshes. Keying by seller makes that a non-event.
function offersBySeller(group) {
  const bySeller = new Map();
  for (const offer of group?.offers || []) {
    if (offer?.seller && !bySeller.has(offer.seller)) bySeller.set(offer.seller, offer);
  }
  return bySeller;
}

function groupsByKey(page) {
  return new Map((page?.groups || []).map((group) => [String(group.key), group]));
}

// A stable string for the whole result: same prices and stock in a different
// order produce the same value.
export function pricePageFingerprint(page) {
  const groups = [...groupsByKey(page).entries()].sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(groups.map(([key, group]) => [
    key,
    [...offersBySeller(group).entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([seller, offer]) => [seller, offerSignature(offer)]),
  ]));
}

export function samePricePage(previous, next) {
  if (!previous || !next) return false;
  return pricePageFingerprint(previous) === pricePageFingerprint(next);
}

// Cell keys — `${groupKey}:${seller}` — for the offers whose displayed values
// moved. A seller that was not in the group before is new, not changed, so it is
// left out, same as the query-panel rule for new rows.
export function diffPricePages(previous, next) {
  const changed = new Set();
  if (!previous || !next) return changed;
  const before = groupsByKey(previous);
  for (const [key, group] of groupsByKey(next)) {
    const wasGroup = before.get(key);
    if (!wasGroup) continue;
    const wasOffers = offersBySeller(wasGroup);
    for (const [seller, offer] of offersBySeller(group)) {
      const was = wasOffers.get(seller);
      if (!was) continue;
      if (offerSignature(was) !== offerSignature(offer)) changed.add(`${key}:${seller}`);
    }
  }
  return changed;
}

// A refresh that brings back the same prices keeps the previous page object, so
// nothing downstream re-renders and `fetchedAt` keeps meaning "when the data
// last changed". `checkedAt` is when we last looked.
export function settlePricePage(previous, next) {
  const checkedAt = next?.fetchedAt || new Date().toISOString();
  if (samePricePage(previous, next)) return { ...previous, checkedAt, unchanged: true };
  return { ...next, checkedAt, unchanged: false };
}
