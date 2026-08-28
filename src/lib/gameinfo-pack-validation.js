export function cleanGameinfoNumericInput(value) {
  const source = String(value ?? "");
  const firstDot = source.indexOf(".");
  if (firstDot < 0) return source.replace(/\D/g, "");
  const whole = source.slice(0, firstDot).replace(/\D/g, "");
  const fraction = source.slice(firstDot + 1).replace(/\D/g, "");
  return `${whole}.${fraction}`;
}

export function normalizeGameinfoNumericInput(value) {
  const clean = cleanGameinfoNumericInput(value);
  if (!clean) return "";
  const [rawWhole, fraction] = clean.split(".");
  const whole = (rawWhole || "0").replace(/^0+(?=\d)/, "");
  return fraction == null || fraction === "" ? whole : `${whole}.${fraction}`;
}

function gameinfoPackPriceKey(value) {
  const price = normalizeGameinfoNumericInput(value);
  if (!price) return "";
  const [whole, rawFraction = ""] = price.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function gameinfoPackNameKey(value) {
  return String(value ?? "").trim().normalize("NFKC").toLocaleLowerCase();
}

export function findDuplicateGameinfoPackNamePrices(currencies) {
  const byNameAndPrice = new Map();
  for (const currency of currencies || []) {
    for (const category of currency.categories || []) {
      for (const pack of category.packs || []) {
        const nameKey = gameinfoPackNameKey(pack.name);
        const priceKey = gameinfoPackPriceKey(pack.price);
        if (!nameKey || !priceKey) continue;
        const key = JSON.stringify([nameKey, priceKey]);
        if (!byNameAndPrice.has(key)) byNameAndPrice.set(key, []);
        byNameAndPrice.get(key).push(pack.id);
      }
    }
  }
  return new Set(
    [...byNameAndPrice.values()].filter((packIds) => packIds.length > 1).flat()
  );
}
