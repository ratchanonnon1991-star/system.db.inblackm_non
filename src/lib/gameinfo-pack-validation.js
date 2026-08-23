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

export function findDuplicateGameinfoPackPrices(currencies) {
  const byPrice = new Map();
  for (const currency of currencies || []) {
    for (const category of currency.categories || []) {
      for (const pack of category.packs || []) {
        const price = normalizeGameinfoNumericInput(pack.price);
        if (!price) continue;
        const [whole, rawFraction = ""] = price.split(".");
        const fraction = rawFraction.replace(/0+$/, "");
        const numericKey = fraction ? `${whole}.${fraction}` : whole;
        if (!byPrice.has(numericKey)) byPrice.set(numericKey, []);
        byPrice.get(numericKey).push(pack.id);
      }
    }
  }
  return new Set(
    [...byPrice.values()].filter((packIds) => packIds.length > 1).flat()
  );
}
