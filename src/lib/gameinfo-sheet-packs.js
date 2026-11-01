// Reading one game's packs out of its tab in the "1.1 ข้อมูลเติมเกม UID"
// sheet. The tabs were built by hand over years and no two are quite alike:
// a tab can hold several tables (Cash, Coins, Bundles…), each under its own
// header row and often under a one-cell label row. A header row names its
// columns a few known ways:
//   ราคาขาย / PAGE / ราคาขาย เพจ|เรท      the selling price
//   <unit> ที่กด / <unit> ที่ได้ / PACK    the pack ("B-Chips ที่กด"), or a bare
//                                        "<unit>" followed by "<unit> รวม"
//   [ยอด] <fiat> รวม FEE / รวม / ที่กด / ที่ออก   what is charged, in the cost currency
//   ช่องทาง [หลัก|สำรอง]                   the wallet (a plain ช่องทาง column can
//                                        also hold the store or a link)
//   ประเทศ / ประเทศหลัก                   the country, when it is stated
//   ต้นทุน                                the pack's cost in THB, which gives
//                                        each cost currency its rate
// Rows under a header with a pack name and a price are packs. A label row
// can also be a note ("ต้องเปิด VPN…"), which is not a category, or open a
// VIP or price-comparison table ("ราคา VIP", "แพ็คเทียบราคา"), which is skipped.
import { createBlankGameinfoPack, gameinfoPackDatePassed, gameinfoPackStatus, gameinfoPackStatusPatch, sanitizeGameinfoPackExpiry } from "@/lib/gameinfo-pack-model";
import { normalizeGameinfoNumericInput } from "@/lib/gameinfo-pack-validation";

const FIAT = new Set([
  "mmk", "lak", "thb", "usd", "idr", "php", "myr", "vnd", "sgd", "jpy", "krw", "twd", "hkd",
  "try", "brl", "ngn", "inr", "eur", "gbp", "aud", "cad", "cny", "rub", "khr", "pkr", "bdt",
  "mxn", "ars", "clp", "cop", "pen", "zar", "egp", "sar", "aed", "uah", "kzt", "usdt",
]);
// Columns that end in ที่ได้/รวม but are money, not packs ("กำไรที่ได้").
const NOT_PACK = ["กำไร", "ต้นทุน", "ราคา", "ยอด", "usdt", "kaleoz", "playerok", "russia", "page", "razer", "notice", "link", "ช่องทาง", "ระบบ", "ประเทศ", "date", "rate", "bonus", "fee"];
// iTunes regions: "UK ที่กด" counts gift-card value, not a unit ("UC" is one).
const REGIONS = new Set(["uk", "de", "us", "jp", "kr", "tw", "hk", "fr", "it", "es", "br", "tr", "ph", "id", "my", "sg", "th", "vn", "au", "ca", "cn", "ru", "in", "mx"]);
const NOTE = /ต้อง|สามารถ|ใช้|ระวัง|กรณี|vpn|region|ครับ|ค่ะ|⚠/i;
const NOT_FOR_SALE = /เทียบราคา|vip/i;
// "แพ็กใหม่หมดอายุ 4/11/2026" alone on a row: day first, as the sheet writes dates.
const EXPIRY_NOTE = /หมด(?:อายุ|เขต)\D*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})/;
// Shops and top-up sites: a channel column holding these is the store, not the wallet.
const STORES = ["codashop", "seagm", "unipin", "lapakgaming", "midasbuy", "itemku", "gamekub", "jollymax"];
// Cost currency → the country GameInfo files the pack under.
const CURRENCY_COUNTRY = {
  mmk: "Myanmar", lak: "Laos", thb: "Thailand", idr: "Indonesia", php: "Philippines",
  myr: "Malaysia", vnd: "Vietnam", sgd: "Singapore", jpy: "Japan", krw: "South Korea",
  twd: "Taiwan", hkd: "Hong Kong", try: "Turkey", brl: "Brazil", ngn: "Nigeria", inr: "India",
  khr: "Cambodia", pkr: "Pakistan", bdt: "Bangladesh", ars: "Argentina", mxn: "Mexico",
};

export const GAMEINFO_SHEET_DEFAULT_CATEGORY = "แพ็คหลัก";

function squash(value) {
  return String(value ?? "").replace(/\s+/g, "").toLocaleLowerCase("en");
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// "Razer (SGD)" and "Razer SGD" count as SGD.
function fiatKey(unit) {
  return squash(unit).replace(/^razer/, "").replace(/[^a-z]/g, "");
}

function isFiat(unit) {
  return FIAT.has(fiatKey(unit));
}

function isPackUnit(unit) {
  const key = squash(unit);
  return Boolean(key) && !REGIONS.has(key) && !isFiat(unit) && !NOT_PACK.some((word) => key.startsWith(word));
}

function number(value) {
  const normalized = normalizeGameinfoNumericInput(String(value ?? "").replace(/,/g, ""));
  return normalized && Number(normalized) > 0 ? normalized : "";
}

function isLink(value) {
  return /^(https?:\/\/|www\.)/i.test(value);
}

// The pack column of a header row: { col, unit, category } — unit "" for a
// column that names packs rather than counting a unit.
function packColumn(header, keys) {
  for (let col = 0; col < header.length; col += 1) {
    const match = /^(.+?)\s*(ที่กด|ที่ได้)$/.exec(header[col]);
    if (keys[col] === "pack" || (match && squash(match[1]) === "pack")) return { col, unit: "", category: "" };
    if (match && isPackUnit(match[1])) return { col, unit: match[1].trim(), category: "" };
    // "Donuts" followed somewhere by "Donuts รวม".
    if (header[col] && isPackUnit(header[col]) && keys.includes(`${keys[col]}รวม`)) return { col, unit: header[col], category: "" };
  }
  // A bare title before the money columns names the table's packs: "Growth Pack", "Ticket Shop".
  const firstFiat = keys.findIndex((key) => {
    const match = /^(.+?)(รวมfee|รวม|ที่กด)$/.exec(key);
    return Boolean(match) && isFiat(match[1]);
  });
  for (let col = 0; col < (firstFiat < 0 ? header.length : firstFiat); col += 1) {
    if (header[col] && isPackUnit(header[col]) && !/(รวม|ที่กด|ที่ได้)$/.test(keys[col])) return { col, unit: "", category: header[col] };
  }
  return null;
}

// The charged-amount column and its currency ("MMK", "Razer SGD"): a
// fee-inclusive total first, then a total, then what is pressed.
function amountColumn(keys) {
  let best = null;
  keys.forEach((key, col) => {
    const match = /^(?:ยอด)?(.+?)(รวมfee|รวม|ที่กด|ที่ออก)?$/.exec(key);
    if (!match || !isFiat(match[1])) return;
    if (!match[2] && !key.startsWith("ยอด")) return;
    const score = match[2] ? ["รวมfee", "รวม", "ที่กด", "ที่ออก"].indexOf(match[2]) : 4;
    if (!best || score < best.score) {
      const code = fiatKey(match[1]).toUpperCase();
      best = { col, score, currency: match[1].startsWith("razer") ? `Razer ${code}` : code };
    }
  });
  return best || { col: -1, currency: "" };
}

function isPriceHeader(key) {
  return key === "page" || /^ราคาขาย(page|เพจ|เรท|\(page\))?$/.test(key);
}

/**
 * The column layout of a header row; { unreadable: true } for a table header
 * with no pack column we know; null when the row is not a header at all.
 */
function readHeader(row) {
  const header = (row || []).map(clean);
  const keys = header.map(squash);
  const priceCol = keys.findIndex(isPriceHeader);
  if (priceCol < 0) return null;
  const pack = packColumn(header, keys);
  if (!pack) return { unreadable: true };
  const costCol = keys.findIndex((key) => key === "ต้นทุน" || key.startsWith("ต้นทุน("));
  // "USD | NGN | ต้นทุน": with no ที่กด or รวม to go by, a bare currency right
  // before the cost is what is charged.
  const found = amountColumn(keys);
  const amount = found.col < 0 && costCol > 0 && isFiat(keys[costCol - 1])
    ? { col: costCol - 1, currency: fiatKey(keys[costCol - 1]).toUpperCase() }
    : found;
  // The route's own currency (the first fiat that is pressed) says the country.
  const pressed = keys.map((key) => /^(.+?)ที่กด$/.exec(key)?.[1]).find((unit) => unit && isFiat(unit));
  return {
    unreadable: false,
    priceCol,
    nameCol: pack.col,
    unit: pack.unit,
    category: pack.category,
    amountCol: amount.col,
    amountCurrency: amount.currency,
    // "MMK ที่กด" beside "MMK รวม Fee"; the header of the pack column twice is
    // the name, then the count ("Crystals ที่ได้": 60 Crystals | 60).
    chargedCol: keys.findIndex((key) => isFiat(/^(.+?)ที่กด$/.exec(key)?.[1] || "")),
    receivedCol: keys.findIndex((key, col) => key && key === keys[pack.col] && col !== pack.col),
    linkCol: keys.indexOf("link"),
    usdCol: keys.indexOf("usd"),
    // The wallet can sit under no header at all: "PACK | (blank) | USD | NGN".
    blankCols: keys.flatMap((key, col) => (!key && col > pack.col && (amount.col < 0 || col < amount.col) ? [col] : [])),
    costCol,
    mainCol: keys.indexOf("ช่องทางหลัก"),
    plainChannelCols: keys.flatMap((key, col) => (key === "ช่องทาง" ? [col] : [])),
    // "ช่องทาง หลัก" is sometimes followed by a bare "สำรอง".
    secondaryCol: keys.indexOf("ช่องทางสำรอง") >= 0 ? keys.indexOf("ช่องทางสำรอง") : keys.indexOf("สำรอง"),
    countryCol: keys.findIndex((key) => key === "ประเทศ" || key === "ประเทศหลัก"),
    fallbackCountry: CURRENCY_COUNTRY[fiatKey(pressed)] || "",
  };
}

/** Index of the first header row, or -1. */
export function findGameinfoSheetPackHeader(rows) {
  return (rows || []).findIndex((row) => readHeader(row)?.unreadable === false);
}

// The wallet of one pack row: ช่องทาง หลัก when there is one, else the first
// plain ช่องทาง that is neither a link nor a store, else the first that is not a link.
function walletOf(cell, layout) {
  if (layout.mainCol >= 0) return cell(layout.mainCol);
  const values = layout.plainChannelCols.map(cell).filter((value) => value && !isLink(value));
  return values.find((value) => !STORES.some((store) => squash(value).includes(store))) || values[0]
    || layout.blankCols.map(cell).find((value) => value && !isLink(value)) || "";
}

// "150" under "Premium Credits ที่กด" → "150 Premium Credits".
function packName(name, unit) {
  return unit && /^[\d,.]+$/.test(name) ? `${name} ${unit}` : name;
}

// A section title's mode: "idpass", "uid", or "" when the text is no title.
function sectionMode(text) {
  if (/\bID\s*-?\s*PASS\b|IDPASS/i.test(text)) return "idpass";
  return /\bUID\b/i.test(text) ? "uid" : "";
}

function isLabel(cells) {
  return cells.length === 1 && /\p{L}/u.test(cells[0]) && !isLink(cells[0]) && cells[0].length <= 60 && !cells[0].includes(">>")
    && (!/\d/.test(cells[0]) || NOT_FOR_SALE.test(cells[0]));
}

/** The YYYY-MM-DD an expiry note gives; a two-digit or Buddhist-era year is read as the sheet means it. */
function sheetExpiryNoteDate(text) {
  const match = EXPIRY_NOTE.exec(text);
  if (!match) return "";
  const [, day, month, written] = match;
  const year = written.length === 2 ? 2000 + Number(written) : Number(written) >= 2400 ? Number(written) - 543 : Number(written);
  return sanitizeGameinfoPackExpiry(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
}

/**
 * One tab's rows (cells as displayed) → { currencies: [{ unit, categories:
 * [{ name, packs: [{ name, price, amountChargedFee, channelsMain,
 * channelsSecondary, country }] }] }] }, or null when no pack is found.
 * The same name and price twice (another route for the same pack, or a
 * repeated table) keeps the first.
 */
export function parseGameinfoSheetPackTab(rows) {
  const currencies = [];
  const currencyFor = (unit) => {
    let currency = currencies.find((item) => squash(item.unit) === squash(unit));
    if (!currency) {
      currency = { unit, categories: [] };
      currencies.push(currency);
    }
    return currency;
  };
  const seen = new Set();
  let layout = null;
  let tableRow = -1;
  let category = null;
  let label = "";
  // Each note's date goes to the green rows above it, once colours are known
  // (withGameinfoSheetTones).
  const expiryNotes = [];
  // A VIP/comparison label covers the table under it, or the rest of the
  // table it sits in when packs come right after it.
  let skipping = false;
  let skipNextTable = false;
  // Which GameInfo mode the packs below belong to, from the tab's section
  // titles ("1.… UID - …", "2.… ID - PASS …"); a tab without them is UID.
  let mode = "uid";
  // The bracket of the title right above each mode's first table: "… UID -
  // ( Page / Market Place ) - …". A tab's other rows can mention a mode and
  // have brackets too, so a title only counts once a table follows it.
  const sources = {};
  let titled = null;
  for (const [rowIndex, row] of (rows || []).entries()) {
    const firstCell = clean((row || []).find((value) => clean(value)));
    const titleMode = sectionMode(firstCell);
    mode = titleMode || mode;
    const alone = (row || []).filter((value) => clean(value)).length === 1;
    if (titleMode && alone) titled = { mode: titleMode, source: /\(([^()]+)\)/.exec(firstCell)?.[1].trim() || "" };
    const next = readHeader(row);
    if (next) {
      if (!next.unreadable && titled?.source && !sources[titled.mode]) sources[titled.mode] = titled.source;
      titled = null;
      // A table we cannot read must not be read with the previous table's columns.
      layout = next.unreadable ? null : next;
      tableRow = rowIndex;
      category = null;
      skipping = skipNextTable;
      skipNextTable = false;
      continue;
    }
    const filled = (row || []).map(clean).filter(Boolean);
    if (!filled.length) continue;
    const expiryDate = filled.length === 1 ? sheetExpiryNoteDate(filled[0]) : "";
    if (expiryDate) expiryNotes.push({ date: expiryDate, row: rowIndex, table: tableRow });
    if (isLabel(filled)) {
      if (NOTE.test(filled[0]) && !NOT_FOR_SALE.test(filled[0])) continue;
      skipping = NOT_FOR_SALE.test(filled[0]);
      skipNextTable = skipping;
      label = skipping ? "" : filled[0];
      category = null;
      continue;
    }
    if (skipping) {
      skipNextTable = false;
      continue;
    }
    const cell = (index) => (index >= 0 ? clean(row[index]) : "");
    const name = layout ? cell(layout.nameCol) : "";
    const price = layout ? number(cell(layout.priceCol)) : "";
    if (!name || !price || isLink(name)) {
      // Anything else (a rate block, a note) ends a label's reach.
      label = "";
      continue;
    }
    const fullName = packName(name, layout.unit);
    // NFKC like GameInfo's own duplicate check (not in squash: it splits Thai "ำ").
    const key = `${squash(fullName).normalize("NFKC")}|${Number(price)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!category) {
      const categoryName = (label && squash(label) !== squash(layout.unit) ? label : "") || layout.category || GAMEINFO_SHEET_DEFAULT_CATEGORY;
      const currency = currencyFor(layout.unit);
      category = currency.categories.find((item) => item.name === categoryName);
      if (!category) {
        category = { name: categoryName, packs: [] };
        currency.categories.push(category);
      }
      label = "";
    }
    const wallet = walletOf(cell, layout);
    const secondary = cell(layout.secondaryCol);
    const charged = cell(layout.chargedCol);
    category.packs.push({
      name: fullName,
      price,
      amountChargedFee: number(cell(layout.amountCol)),
      amountBeforeFee: /^[\d,.]+$/.test(charged) ? number(charged) : charged,
      amountReceived: number(cell(layout.receivedCol)) || (layout.unit && /^[\d,.]+$/.test(name) ? number(name) : ""),
      priceUsd: number(cell(layout.usdCol)),
      link: [cell(layout.linkCol), ...layout.plainChannelCols.map(cell)].find(isLink) || "",
      channelsMain: wallet ? [wallet] : [],
      channelsSecondary: secondary && !isLink(secondary) ? [secondary] : [],
      country: cell(layout.countryCol) || layout.fallbackCountry,
      costCurrency: layout.amountCurrency,
      cost: number(cell(layout.costCol)),
      // Where the name sits, for reading the row's colour (withGameinfoSheetTones).
      sheetRow: rowIndex,
      sheetCol: layout.nameCol,
      sheetTable: tableRow,
      mode,
    });
  }
  // PACK tables have no unit of their own: they join the tab's first named currency.
  const unnamed = currencies.find((currency) => !currency.unit);
  const named = currencies.find((currency) => currency.unit);
  if (unnamed && named) {
    for (const item of unnamed.categories) {
      const same = named.categories.find((existing) => existing.name === item.name);
      if (same) same.packs.push(...item.packs);
      else named.categories.push(item);
    }
    currencies.splice(currencies.indexOf(unnamed), 1);
  }
  return currencies.length ? { currencies, sources, expiryNotes } : null;
}

export function countGameinfoSheetPacks(parsed) {
  return (parsed?.currencies || []).reduce((total, currency) =>
    total + currency.categories.reduce((sum, category) => sum + category.packs.length, 0), 0);
}

/** The units of a parsed tab, for the preview ("B-Chips, Crystals"). */
export function gameinfoSheetPackUnits(parsed) {
  return (parsed?.currencies || []).map((currency) => currency.unit).filter(Boolean).join(", ");
}

function newId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * One cost profile per cost currency, its rate being the sheet's own
 * ต้นทุน ÷ amount (the median over the packs, so one odd row cannot skew it).
 * GameInfo works out cost and profit from amount × rate.
 */
export function gameinfoSheetCostProfiles(parsed, updatedAt = new Date().toISOString()) {
  const rates = new Map();
  for (const currency of parsed?.currencies || []) {
    for (const category of currency.categories) {
      for (const pack of category.packs) {
        if (!pack.costCurrency || !Number(pack.amountChargedFee) || !Number(pack.cost)) continue;
        if (!rates.has(pack.costCurrency)) rates.set(pack.costCurrency, []);
        rates.get(pack.costCurrency).push(Number(pack.cost) / Number(pack.amountChargedFee));
      }
    }
  }
  return [...rates].map(([code, values]) => ({
    id: `sheet-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label: `${code} → THB (จากชีต)`,
    inputCurrency: code.replace(/^Razer /, "").slice(0, 12),
    baseValue: String(Number(median(values).toPrecision(6))),
    rateFormula: "",
    updatedAt,
    updatedBy: null,
  }));
}

/**
 * The parsed tab as GameInfo packs: one currency per unit, plus the cost
 * profiles its packs point at.
 */
export function gameinfoSheetPackTree(parsed) {
  const costProfiles = gameinfoSheetCostProfiles(parsed);
  const profileByCurrency = new Map(costProfiles.map((profile) => [profile.label.replace(/ → THB \(จากชีต\)$/, ""), profile.id]));
  const currencies = parsed.currencies.map((currency) => ({
    id: newId("c"),
    name: currency.unit || "",
    image: "",
    categories: currency.categories.map((category) => ({
      id: newId("cat"),
      name: category.name,
      packs: category.packs.map(({ cost, costCurrency, sheetRow, sheetCol, sheetTable, tone, mode, ...pack }) => ({
        ...createBlankGameinfoPack(newId("pk")),
        ...pack,
        ...gameinfoPackStatusPatch(TONE_STATUS[tone] || "open"),
        costProfileId: pack.amountChargedFee ? profileByCurrency.get(costCurrency) || "" : "",
      })),
    })),
  }));
  return { currencies, costProfiles };
}

// The sheet marks a pack's row bright red (#ff0000) when the pack has expired
// in the game and bright green (#00ff00) when it is new. The tabs also use
// red and green to decorate — dark red channel cells and pack names, pale
// green price cells, pink Russia columns — so only the bright marks count.
const TONE_STATUS = { red: "expired", green: "new" };

/** A cell background ({ red, green, blue } 0–1, zeros left out) → "red" | "green" | "". */
export function gameinfoSheetTone(color) {
  if (!color || typeof color !== "object") return "";
  const r = Number(color.red) || 0;
  const g = Number(color.green) || 0;
  const b = Number(color.blue) || 0;
  if (r >= 0.85 && g <= 0.35 && b <= 0.35) return "red";
  if (g >= 0.75 && r <= 0.5 && b <= 0.5) return "green";
  return "";
}

function eachSheetPack(parsed, visit) {
  for (const currency of parsed?.currencies || []) {
    for (const category of currency.categories) category.packs.forEach((pack) => visit(pack, currency));
  }
}

const SHEET_DETAIL_FIELDS = ["amountReceived", "amountBeforeFee", "priceUsd", "link"];

/**
 * What the sheet can fill in one mode's pack tree: by name, only fields a pack
 * leaves blank. → [{ packId, name, patch }]
 */
export function gameinfoSheetDetailFills(currencies, parsed, mode) {
  const sheet = new Map();
  eachSheetPack(parsed, (pack) => {
    const key = gameinfoSheetPackNameKey(pack.name);
    if ((pack.mode === "idpass" ? "idpass" : "uid") === mode && !sheet.has(key)) sheet.set(key, pack);
  });
  const fills = [];
  eachTreePack(currencies, (pack) => {
    const from = sheet.get(gameinfoSheetPackNameKey(pack.name));
    const fields = SHEET_DETAIL_FIELDS.filter((field) => from?.[field] && !String(pack[field] ?? "").trim());
    if (fields.length) fills.push({ packId: pack.id, name: pack.name, patch: Object.fromEntries(fields.map((field) => [field, from[field]])) });
  });
  return fills;
}

/** The tree with those fills in. */
export function applyGameinfoSheetDetailFills(currencies, fills) {
  const byId = new Map(fills.map((fill) => [String(fill.packId), fill.patch]));
  return (currencies || []).map((currency) => ({
    ...currency,
    categories: (currency.categories || []).map((category) => ({
      ...category,
      packs: (category.packs || []).map((pack) => ({ ...pack, ...byId.get(String(pack.id)) })),
    })),
  }));
}

/** The columns a parsed tab's pack names sit in: the cells whose colour says a pack's status. */
export function gameinfoSheetPackNameColumns(parsed) {
  const cols = new Set();
  eachSheetPack(parsed, (pack) => { if (pack.sheetCol >= 0) cols.add(pack.sheetCol); });
  return [...cols].sort((a, b) => a - b);
}

/**
 * Gives each pack of a parsed tab its `tone`, from colours[col][row] (the
 * reader's columnColors for that tab), and its `expiresAt` when an expiry note
 * sits under it: a note covers the green rows right above it in its table.
 */
export function withGameinfoSheetTones(parsed, colors) {
  eachSheetPack(parsed, (pack) => { pack.tone = gameinfoSheetTone(colors?.[pack.sheetCol]?.[pack.sheetRow]); });
  for (const note of parsed?.expiryNotes || []) {
    const above = [];
    eachSheetPack(parsed, (pack) => { if (pack.sheetTable === note.table && pack.sheetRow < note.row) above.push(pack); });
    above.sort((left, right) => right.sheetRow - left.sheetRow);
    for (const pack of above) {
      if (pack.tone !== "green") break;
      pack.expiresAt = note.date;
    }
  }
  return parsed;
}

/** Pack names compared the way the sheet and GameInfo can both spell them. */
export function gameinfoSheetPackNameKey(name) {
  return squash(name).normalize("NFKC");
}

function eachTreePack(currencies, visit) {
  for (const currency of currencies || []) {
    for (const category of currency.categories || []) (category.packs || []).forEach(visit);
  }
}

/**
 * What the sheet's colours change in one GameInfo pack tree, by pack name:
 * red → หมดอายุ, green → ใหม่, and an uncoloured row takes a pack the sheet
 * had marked back to เปิด. A pack closed by hand stays closed (green does not
 * reopen it), a pack past its expiry date stays expired (a row left green does
 * not revive it), and a name the sheet colours two ways is left alone. A date
 * from an expiry note replaces the pack's, and is left alone if one name has
 * two; with no note the pack keeps the date it has.
 * → [{ packId, name, from, to, expiresAt? }] with statuses as gameinfoPackStatus
 * gives them; `to` can equal `from` when only the date changes.
 */
export function gameinfoSheetStatusChanges(currencies, parsed) {
  const tones = new Map();
  const dates = new Map();
  eachSheetPack(parsed, (pack) => {
    const key = gameinfoSheetPackNameKey(pack.name);
    if (!tones.has(key)) tones.set(key, new Set());
    tones.get(key).add(pack.tone || "");
    if (!pack.expiresAt) return;
    if (!dates.has(key)) dates.set(key, new Set());
    dates.get(key).add(pack.expiresAt);
  });
  const changes = [];
  eachTreePack(currencies, (pack) => {
    const key = gameinfoSheetPackNameKey(pack.name);
    const seen = tones.get(key);
    if (!seen || seen.size !== 1) return;
    const sheetDates = dates.get(key);
    const expiresAt = sheetDates?.size === 1 && !sheetDates.has(pack.expiresAt) ? [...sheetDates][0] : "";
    const from = gameinfoPackStatus(pack);
    if (gameinfoPackDatePassed(expiresAt ? { expiresAt } : pack)) {
      if (expiresAt) changes.push({ packId: pack.id, name: pack.name, from, to: "expired", expiresAt });
      return;
    }
    let to = TONE_STATUS[[...seen][0]] || (from === "new" || from === "expired" ? "open" : from);
    if (to === "new" && from === "closed") to = from;
    if (to !== from || expiresAt) changes.push({ packId: pack.id, name: pack.name, from, to, ...(expiresAt ? { expiresAt } : {}) });
  });
  return changes;
}

/**
 * Whether the daily run makes a change on its own. A row with no colour says
 * nothing about a pack someone marked หมดอายุ by hand, so putting it back on
 * sale is left to a person pressing the button.
 */
export function gameinfoSheetAutoChange(change) {
  return !(change.from === "expired" && change.to === "open");
}

/** The next 06:00 in Bangkok: before the day's work, after yesterday's edits to the sheet. */
export function nextGameinfoSheetSyncAt(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(23, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** The tree with the given changes made: only the status of the packs they name. */
export function applyGameinfoSheetStatusChanges(currencies, changes) {
  const byId = new Map(changes.map((change) => [change.packId, change]));
  const applied = (pack, { to, expiresAt }) => ({ ...pack, ...gameinfoPackStatusPatch(to), ...(expiresAt ? { expiresAt } : {}) });
  return (currencies || []).map((currency) => ({
    ...currency,
    categories: (currency.categories || []).map((category) => ({
      ...category,
      packs: (category.packs || []).map((pack) => (byId.has(pack.id) ? applied(pack, byId.get(pack.id)) : pack)),
    })),
  }));
}

/** One sheet pack among a game's: its mode and name, as the missing list and the add button pass it. */
export function gameinfoSheetPackKey(mode, name) {
  return `${mode}|${gameinfoSheetPackNameKey(name)}`;
}

/**
 * Sheet packs the GameInfo tree of their own mode has no pack of that name
 * for, coloured or not: [{ key, mode, name, tone, price, channel }]. A red
 * one has expired before it was ever added; the rest are still to be added.
 * `trees` is { uid: currencies, idpass: currencies }.
 */
export function gameinfoSheetMissingPacks(parsed, trees) {
  const names = { uid: new Set(), idpass: new Set() };
  for (const mode of Object.keys(names)) eachTreePack(trees?.[mode], (pack) => names[mode].add(gameinfoSheetPackNameKey(pack.name)));
  const out = new Map();
  eachSheetPack(parsed, (pack) => {
    const mode = pack.mode === "idpass" ? "idpass" : "uid";
    const key = gameinfoSheetPackKey(mode, pack.name);
    if (names[mode].has(gameinfoSheetPackNameKey(pack.name)) || out.has(key)) return;
    out.set(key, { key, mode, name: pack.name, tone: pack.tone || "", price: pack.price, channel: pack.channelsMain[0] || "" });
  });
  return [...out.values()];
}

// Where added packs go in their currency, for someone to sort later.
export const GAMEINFO_SHEET_ADDED_CATEGORY = "เพิ่มจากชีต";

function mostCommon(values) {
  const counts = new Map();
  for (const value of values) if (value) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

// A wallet's cost profile id, the one scripts/set-channel-costs.mjs gives it
// too ("ITUNES (USD)" → "sheet-itunesusd"), so a later run there replaces it.
function walletProfileId(channel) {
  return `sheet-${String(channel ?? "").replace(/[\s()]+/g, "").toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "-")}`;
}

/**
 * A cost profile for one wallet at the sheet's own rate: its rows' ต้นทุน ÷
 * amount (the median), read per wallet because one amount column can hold
 * NGN on Google rows and euros on iTunes rows. Null without a usable row.
 */
function walletProfile(parsed, mode, wallet, updatedAt = new Date().toISOString()) {
  const rates = [];
  eachSheetPack(parsed, (pack) => {
    if ((pack.mode === "idpass" ? "idpass" : "uid") !== mode || squash(pack.channelsMain[0]) !== squash(wallet)) return;
    if (Number(pack.cost) > 0 && Number(pack.amountChargedFee) > 0) rates.push(Number(pack.cost) / Number(pack.amountChargedFee));
  });
  if (!rates.length) return null;
  const currency = String(wallet).split(/[\s()]+/).find((word) => FIAT.has(word.toLocaleLowerCase("en"))) || "";
  return {
    id: walletProfileId(wallet),
    label: `${wallet} → THB (จากชีต)`,
    inputCurrency: currency.toUpperCase().slice(0, 12),
    baseValue: String(Number(median(rates).toPrecision(6))),
    rateFormula: "",
    updatedAt,
    updatedBy: null,
  };
}

/**
 * The chosen missing packs of one mode added to that mode's GameInfo packs
 * ({ currencies, costProfiles }), under "เพิ่มจากชีต" in the currency already
 * holding packs of their wallet, else the one named after their unit, else
 * (UID) the first currency or (ID-PASS, whose currencies are wallets) a new
 * one named after the wallet. A pack takes the cost profile its wallet's
 * packs use, else one at the sheet's rate for that wallet. Green rows come
 * in ใหม่; red rows (expired) and names GameInfo already has are never added.
 * → { currencies, costProfiles, added: [name] }
 */
export function addGameinfoSheetPacks(packs, parsed, mode, keys) {
  const wanted = new Set(keys);
  const have = new Set();
  eachTreePack(packs.currencies, (pack) => have.add(gameinfoSheetPackNameKey(pack.name)));
  const currencies = structuredClone(packs.currencies || []);
  const costProfiles = [...(packs.costProfiles || [])];
  const added = [];
  eachSheetPack(parsed, (pack, sheetCurrency) => {
    const nameKey = gameinfoSheetPackNameKey(pack.name);
    if ((pack.mode === "idpass" ? "idpass" : "uid") !== mode || !wanted.has(gameinfoSheetPackKey(mode, pack.name))) return;
    if (pack.tone === "red" || have.has(nameKey)) return;
    have.add(nameKey);
    const walletName = pack.channelsMain[0] || "";
    const wallet = squash(walletName);
    const sameWallet = (item) => wallet && squash(item.channelsMain?.[0]) === wallet;
    const walletCount = (currency) => (currency.categories || []).reduce((sum, category) => sum + (category.packs || []).filter(sameWallet).length, 0);
    let currency = [...currencies].sort((a, b) => walletCount(b) - walletCount(a)).find((item) => walletCount(item) > 0)
      || currencies.find((item) => sheetCurrency.unit && squash(item.name) === squash(sheetCurrency.unit))
      || (mode === "uid" ? currencies[0] : currencies.find((item) => wallet && squash(item.name) === wallet));
    if (!currency) {
      const name = mode === "uid" ? sheetCurrency.unit || walletName : walletName || sheetCurrency.unit;
      currency = { id: newId("c"), name: name || GAMEINFO_SHEET_ADDED_CATEGORY, image: "", categories: [] };
      currencies.push(currency);
    }
    let category = currency.categories.find((item) => item.name === GAMEINFO_SHEET_ADDED_CATEGORY);
    if (!category) {
      category = { id: newId("cat"), name: GAMEINFO_SHEET_ADDED_CATEGORY, packs: [] };
      currency.categories.push(category);
    }
    const walletPacks = [];
    eachTreePack(currencies, (item) => { if (sameWallet(item)) walletPacks.push(item); });
    let costProfileId = mostCommon(walletPacks.map((item) => item.costProfileId));
    if (!costProfileId && wallet) {
      const existing = costProfiles.find((item) => item.id === walletProfileId(walletName));
      const profile = existing || walletProfile(parsed, mode, walletName);
      if (profile) {
        if (!existing) costProfiles.push(profile);
        costProfileId = profile.id;
      }
    }
    category.packs.push({
      ...createBlankGameinfoPack(newId("pk")),
      name: pack.name,
      price: pack.price,
      amountChargedFee: pack.amountChargedFee,
      amountBeforeFee: pack.amountBeforeFee,
      amountReceived: pack.amountReceived,
      priceUsd: pack.priceUsd,
      link: pack.link,
      channelsMain: pack.channelsMain,
      channelsSecondary: pack.channelsSecondary,
      country: pack.country,
      ...gameinfoPackStatusPatch(TONE_STATUS[pack.tone] || "open"),
      expiresAt: pack.expiresAt,
      costProfileId,
    });
    added.push(pack.name);
  });
  return { currencies, costProfiles, added };
}

// GameInfo's shared ต้นทุน formula divides the amount by one fixed MMK rate.
// A game imported from the sheet gets a formula of its own instead, so its
// cost and profit match the sheet: each pack at its own profile's rate
// (the sheet's MMK rate with its bonus, USD, Razer SGD…).
export const GAMEINFO_SHEET_COST_COLUMN = "ต้นทุน";
export const GAMEINFO_SHEET_COST_FORMULA = "[ยอดที่กด + fee] * [อัตราต้นทุน]";

/**
 * The game's columns with that per-game formula on ต้นทุน, or null when the
 * game needs none: no cost profile from the sheet, or a formula of its own
 * already, which `replace` overrules for someone setting the game's rates.
 */
export function gameinfoSheetCostFormulaColumns(computedColumns, costProfiles, { replace = false } = {}) {
  if (!(costProfiles || []).some((profile) => String(profile.id).startsWith("sheet-"))) return null;
  const index = (computedColumns || []).findIndex((column) => String(column.label || "").trim() === GAMEINFO_SHEET_COST_COLUMN);
  const current = index < 0 ? "" : String(computedColumns[index].gameFormula || "").trim();
  if (index < 0 || current === GAMEINFO_SHEET_COST_FORMULA || (current && !replace)) return null;
  return computedColumns.map((column, i) => (i === index ? { ...column, gameFormula: GAMEINFO_SHEET_COST_FORMULA } : column));
}
