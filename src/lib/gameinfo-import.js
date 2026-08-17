// CSV <-> pack-tree mapping for the gameinfo importer. Ported from the
// reference app's lib/import.ts, packs only (no gamelist import, no per-pack
// `formulas` field — this module's pack model doesn't have overrides).
//
// The pack tree it produces/consumes is the same Currency -> Category -> Pack
// shape the pack editor and game view already use, so import output feeds
// straight into saveGameinfoPacks.

const norm = (s) => (typeof s === "string" ? s.trim() : s == null ? "" : String(s).trim());
const keyOf = (s) => norm(s).toLowerCase();

// Several channels can share one cell, separated by , ; | or a newline.
export function splitList(value) {
  return norm(value)
    .split(/[,;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function genId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

// Header order is identical to the reference app so exported files round-trip.
export const PACK_HEADERS = [
  "game_id",
  "game_name",
  "currency_name",
  "currency_image",
  "category_name",
  "pack_name",
  "pack_image",
  "price",
  "amount_charged_fee",
  "channel_main",
  "channel_secondary",
  "country",
];

// Worked examples shipped inside the downloadable template so users see the
// expected format (multi-channel cell, Thai category, etc.).
export const PACK_SAMPLE = [
  {
    game_id: "1",
    game_name: "ตัวอย่างเกม",
    currency_name: "Diamonds",
    currency_image: "",
    category_name: "เติมปกติ",
    pack_name: "86 Diamonds",
    pack_image: "",
    price: "30",
    amount_charged_fee: "103",
    channel_main: "ช่องหลัก A",
    channel_secondary: "ช่องรอง B",
    country: "",
  },
  {
    game_id: "1",
    game_name: "ตัวอย่างเกม",
    currency_name: "Diamonds",
    currency_image: "",
    category_name: "เติมปกติ",
    pack_name: "172 Diamonds",
    pack_image: "",
    price: "60",
    amount_charged_fee: "206",
    channel_main: "ช่องหลัก A, ช่องหลัก B",
    channel_secondary: "",
    country: "",
  },
];

// Rebuild a full Currency->Category->Pack tree from one game's rows. Rows with
// no pack data are skipped; currency/category grouping is by case-insensitive
// name, insertion order preserved. Fresh ids are generated for every node.
export function buildPackTree(groupRows) {
  const currencyOrder = [];
  const currencyMap = new Map();
  let packCount = 0;

  for (const row of groupRows) {
    const currencyName = norm(row["currency_name"]);
    const catName = norm(row["category_name"]);
    const packName = norm(row["pack_name"]);

    const hasPackData =
      packName ||
      norm(row["price"]) ||
      norm(row["amount_charged_fee"]);
    if (!hasPackData) continue;

    const cKey = keyOf(currencyName) || "__default__";
    if (!currencyMap.has(cKey)) {
      currencyMap.set(cKey, { name: currencyName, image: "", catOrder: [], cats: new Map() });
      currencyOrder.push(cKey);
    }
    const cur = currencyMap.get(cKey);
    if (currencyName && !cur.name) cur.name = currencyName;
    if (!cur.image && norm(row["currency_image"])) cur.image = norm(row["currency_image"]);

    const catKey = keyOf(catName) || "__default__";
    if (!cur.cats.has(catKey)) {
      cur.cats.set(catKey, { id: genId("cat"), name: catName, packs: [] });
      cur.catOrder.push(catKey);
    }
    const cat = cur.cats.get(catKey);

    cat.packs.push({
      id: genId("pk"),
      name: packName,
      image: norm(row["pack_image"]),
      price: norm(row["price"]),
      amountChargedFee: norm(row["amount_charged_fee"]),
      channelsMain: splitList(row["channel_main"]),
      channelsSecondary: splitList(row["channel_secondary"]),
      country: norm(row["country"]),
    });
    packCount += 1;
  }

  const currencies = currencyOrder.map((cKey) => {
    const cur = currencyMap.get(cKey);
    return {
      id: genId("c"),
      name: cur.name,
      image: cur.image,
      categories: cur.catOrder.map((catKey) => cur.cats.get(catKey)),
    };
  });

  return { currencies, packCount };
}

// "Add" mode: match currency/category by case-insensitive name and append the
// incoming packs; unmatched currencies/categories are appended whole. Packs
// are never de-duplicated, so re-importing the same file duplicates packs —
// matching the reference behavior. Deep-clones `existing` so React state the
// caller still holds is never mutated.
export function mergeCurrencies(existing, incoming) {
  const cloneCategory = (cat) => ({ ...cat, packs: [...cat.packs] });
  const cloneCurrency = (c) => ({ ...c, categories: c.categories.map(cloneCategory) });

  const merged = (existing || []).map(cloneCurrency);

  for (const inc of incoming || []) {
    const cKey = keyOf(inc.name);
    const cur = merged.find((c) => keyOf(c.name) === cKey);
    if (!cur) {
      merged.push(cloneCurrency(inc));
      continue;
    }
    for (const incCat of inc.categories) {
      const catKey = keyOf(incCat.name);
      const cat = cur.categories.find((c) => keyOf(c.name) === catKey);
      if (!cat) {
        cur.categories.push(cloneCategory(incCat));
        continue;
      }
      cat.packs.push(...incCat.packs);
    }
  }

  return merged;
}

// Multi-game parse: group rows by the game_id column (first-seen order kept),
// build a tree per game. `game_name` is display-only; linking is by id.
export function parsePacks(rows) {
  const errors = legacyAmountWarnings(rows);
  const order = [];
  const groups = new Map();

  rows.forEach((row, idx) => {
    const idRaw = norm(row["game_id"]);
    const hasData = Object.values(row).some((v) => norm(v) !== "");
    if (!idRaw) {
      if (hasData) errors.push(`แถวที่ ${idx + 2}: ไม่มี game_id จึงถูกข้าม`);
      return;
    }
    const gameId = parseInt(idRaw, 10);
    if (Number.isNaN(gameId) || gameId <= 0) {
      errors.push(`แถวที่ ${idx + 2}: game_id "${idRaw}" ไม่ถูกต้อง`);
      return;
    }
    if (!groups.has(gameId)) {
      groups.set(gameId, { gameName: norm(row["game_name"]), rows: [] });
      order.push(gameId);
    }
    const g = groups.get(gameId);
    if (!g.gameName && norm(row["game_name"])) g.gameName = norm(row["game_name"]);
    g.rows.push(row);
  });

  const perGame = order.map((gameId) => {
    const { gameName, rows: groupRows } = groups.get(gameId);
    const tree = buildPackTree(groupRows);
    return { gameId, gameName, currencies: tree.currencies, packCount: tree.packCount };
  });

  return { perGame, errors };
}

// Single-game parse (used inside one game's pack editor): the game_id column
// in the file is ignored — every non-empty row belongs to the given gameId.
export function parsePacksForGame(rows, gameId, fallbackGameName) {
  const dataRows = rows.filter((row) => Object.values(row).some((v) => norm(v) !== ""));
  const tree = buildPackTree(dataRows);
  const gameNameFromFile = dataRows.map((r) => norm(r["game_name"])).find((n) => n);
  return {
    game: {
      gameId,
      gameName: gameNameFromFile || fallbackGameName,
      currencies: tree.currencies,
      packCount: tree.packCount,
    },
    errors: legacyAmountWarnings(rows),
  };
}

// Export: 1 row per pack. A game with no packs still emits one blank-pack row
// so its game_id survives an Export -> edit -> Import round-trip.
export function gamesToPackRows(games) {
  const out = [];
  for (const g of games) {
    let emitted = false;
    for (const c of g.currencies || []) {
      for (const cat of c.categories || []) {
        for (const p of cat.packs || []) {
          out.push({
            game_id: String(g.id),
            game_name: g.gameName,
            currency_name: c.name,
            currency_image: c.image ?? "",
            category_name: cat.name,
            pack_name: p.name,
            pack_image: p.image ?? "",
            price: p.price ?? "",
            amount_charged_fee: p.amountChargedFee ?? "",
            channel_main: (p.channelsMain || []).join(", "),
            channel_secondary: (p.channelsSecondary || []).join(", "),
            country: p.country ?? "",
          });
          emitted = true;
        }
      }
    }
    if (!emitted) {
      out.push({
        game_id: String(g.id),
        game_name: g.gameName,
        currency_name: "",
        currency_image: "",
        category_name: "",
        pack_name: "",
        pack_image: "",
        price: "",
        amount_charged_fee: "",
        channel_main: "",
        channel_secondary: "",
        country: "",
      });
    }
  }
  return out;
}

export function validatePackRows(rows) {
  const errors = [];
  rows.forEach((row, index) => {
    const hasPackData = PACK_HEADERS.filter(
      (field) => field !== "game_id" && field !== "game_name"
    ).some((field) => norm(row[field]));
    if (!hasPackData) return;
    const missing = [];
    if (!norm(row.pack_name)) missing.push("pack_name");
    if (!norm(row.price)) missing.push("price");
    if (!norm(row.amount_charged_fee)) missing.push("amount_charged_fee");
    if (!splitList(row.channel_main).length) missing.push("channel_main");
    if (missing.length) errors.push(`แถวที่ ${index + 2}: ข้อมูลไม่ครบ (${missing.join(", ")})`);
  });
  return errors;
}

function legacyAmountWarnings(rows) {
  const count = (rows || []).filter((row) => norm(row?.amount_charged) !== "").length;
  return count
    ? [`พบคอลัมน์ amount_charged ${count} แถว — ระบบเลิกใช้แล้วและจะไม่นำเข้าค่านี้`]
    : [];
}
