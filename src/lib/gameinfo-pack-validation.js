export function cleanGameinfoNumericInput(value) {
  const source = String(value ?? "");
  const firstDot = source.indexOf(".");
  if (firstDot < 0) return source.replace(/\D/g, "");
  const whole = source.slice(0, firstDot).replace(/\D/g, "");
  const fraction = source.slice(firstDot + 1).replace(/\D/g, "");
  return `${whole}.${fraction}`;
}

function shiftGameinfoDecimal(number, digits) {
  if (!Number.isFinite(number) || digits === 0) return number;
  const [mantissa, exponent = "0"] = String(number).split("e");
  const shifted = Number(`${mantissa}e${Number(exponent) + digits}`);
  return Number.isFinite(shifted) ? shifted : number * 10 ** digits;
}

export function roundGameinfoNumber(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return value;
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return shiftGameinfoDecimal(Math.round(shiftGameinfoDecimal(number, 2)), -2);
}

export function normalizeGameinfoNumericInput(value) {
  const clean = cleanGameinfoNumericInput(value);
  if (!clean) return "";
  const [rawWhole, fraction] = clean.split(".");
  const whole = (rawWhole || "0").replace(/^0+(?=\d)/, "");
  if (fraction == null || fraction === "") return whole;
  const normalized = `${whole}.${fraction}`;
  return fraction.length <= 2 ? normalized : String(roundGameinfoNumber(normalized));
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
