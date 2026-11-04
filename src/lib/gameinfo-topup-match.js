// Name matching between GameInfo and the TopUp website, which name the same
// game and the same pack a little differently ("HONKAI IMPACT" + region ASIA
// vs "Honkai Impact 3 (ASIA)"; "6,600 B-Chips × 2" vs "6600 B-Chips X 2").
// Only ever a suggestion for games — an editor confirms the link — but packs
// are matched by it outright, so it stays strict: same words, same numbers.

function words(value) {
  return String(value ?? "")
    .toLocaleLowerCase("en")
    .replace(/(\d),(?=\d{3})/g, "$1")
    .replace(/[×✕]/g, " x ")
    .split(/[^a-z0-9ก-๙]+/)
    .filter(Boolean);
}

// How well `name` fits `target` (0 = no shared word). Shared words weigh
// most; the region breaks ties between the many regional copies of one game;
// extra words cost a little.
function scoreName(targetWords, regionWords, name) {
  const own = words(name);
  const ownSet = new Set(own);
  const shared = [...targetWords].filter((word) => ownSet.has(word)).length;
  if (!shared) return 0;
  const regionHit = [...regionWords].some((word) => ownSet.has(word)) ? 1 : 0;
  return shared / targetWords.size + regionHit * 0.5 - Math.max(0, own.length - shared) * 0.02;
}

/** Website games ordered by how well their name fits this GameInfo game; best first, misses dropped. */
export function rankTopupWebGames(gameName, region, games, limit = 8) {
  const target = new Set(words(gameName));
  const regionWords = new Set(words(region));
  if (!target.size) return [];
  return (games || [])
    .map((game) => ({ game, score: scoreName(target, regionWords, game.name) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ game }) => game);
}

/**
 * The single best fit, only when it is a confident one: most of the target's
 * words found. Used to pre-pick a link and to warn about likely duplicates.
 */
export function confidentNameMatch(name, candidates, getName = (item) => item.name) {
  const target = new Set(words(name));
  if (!target.size) return null;
  let best = null;
  for (const item of candidates || []) {
    const score = scoreName(target, new Set(), getName(item));
    if (score >= 0.6 && (!best || score > best.score)) best = { item, score };
  }
  return best?.item || null;
}

/** Key two pack names share when they name the same pack. */
export function gameinfoPackMatchKey(name) {
  return words(name).join(" ");
}

/** Website package for each GameInfo pack name, matched by exact word key. */
export function matchTopupWebPackages(packNames, packages) {
  const byKey = new Map();
  for (const pkg of packages || []) {
    for (const candidate of [pkg.label, pkg.amountDisplay]) {
      const key = gameinfoPackMatchKey(candidate);
      if (key && !byKey.has(key)) byKey.set(key, pkg);
    }
  }
  return new Map((packNames || []).map((name) => [name, byKey.get(gameinfoPackMatchKey(name)) || null]));
}

// "เติมจากเว็บ" hands missing packs to the pack editor through this window
// event, so they join the editor's unsaved draft instead of being written
// behind its back.
export const GAMEINFO_ADD_WEB_PACKS_EVENT = "gameinfo:add-web-packs";
// Same idea for pictures of packs GameInfo already has: { images: [{ packId, image }] }.
export const GAMEINFO_SET_WEB_PACK_IMAGES_EVENT = "gameinfo:set-web-pack-images";
export const GAMEINFO_WEB_PACK_CATEGORY = "เพิ่มจากเว็บ TopUp";

/** Website packages (for one mode) that no GameInfo pack is named after yet. */
export function missingTopupWebPacks(packages, gameinfoPackNames, dataMode = "uid") {
  const have = new Set((gameinfoPackNames || []).map(gameinfoPackMatchKey));
  const idpass = dataMode === "idpass";
  return (packages || [])
    .map((pkg) => ({
      name: pkg.label,
      price: idpass ? pkg.priceIdpass : pkg.price,
      active: pkg.isActive && (idpass ? pkg.idpassActive : pkg.uidActive),
      image: pkg.image || "",
    }))
    .filter((pack) => pack.price != null && pack.name && !have.has(gameinfoPackMatchKey(pack.name)));
}

/** GameInfo packs with no picture whose website package of the same name has one. */
export function topupWebPackImageFills(packages, gameinfoPacks) {
  const imageByKey = new Map();
  for (const pkg of packages || []) {
    if (!pkg.image) continue;
    for (const candidate of [pkg.label, pkg.amountDisplay]) {
      const key = gameinfoPackMatchKey(candidate);
      if (key && !imageByKey.has(key)) imageByKey.set(key, pkg.image);
    }
  }
  return (gameinfoPacks || [])
    .filter((pack) => !String(pack.image || "").trim() && imageByKey.has(gameinfoPackMatchKey(pack.name)))
    .map((pack) => ({ packId: pack.id, name: pack.name, image: imageByKey.get(gameinfoPackMatchKey(pack.name)) }));
}

// "Weekly Protocore Pack I x3" is the website's "Weekly Protocore Pack I"
// bought several times, so it belongs where that pack does.
function withoutTimes(name) {
  return String(name ?? "").replace(/\s*[x×✕]\s*\d+\s*$/i, "");
}

/**
 * The website category ("Crystals", "Aurum Pass"...) of each GameInfo pack name,
 * by the website package of the same name; "" when no package matches.
 * A package's shown amount ("Account Limit 1/1") only counts when it points
 * at one category, since many packages share one.
 */
export function topupWebPackCategories(packNames, packages) {
  const byLabel = new Map();
  const byAmount = new Map();
  for (const pkg of packages || []) {
    const category = String(pkg.category || "").trim();
    if (!category) continue;
    const label = gameinfoPackMatchKey(pkg.label);
    if (label && !byLabel.has(label)) byLabel.set(label, category);
    const amount = gameinfoPackMatchKey(pkg.amountDisplay);
    if (amount) byAmount.set(amount, byAmount.has(amount) && byAmount.get(amount) !== category ? null : category);
  }
  const find = (name) => {
    const key = gameinfoPackMatchKey(name);
    return byLabel.get(key) || byAmount.get(key) || "";
  };
  return new Map((packNames || []).map((name) => [name, find(name) || find(withoutTimes(name))]));
}

/**
 * Regroups every currency's packs into the website's categories, in the
 * website's order, packs in the website's order inside each. Categories keep
 * their id when one of the same name exists already. Packs the website does
 * not have stay in the category they were in; a category left empty by the
 * move goes, one that was empty already stays.
 */
export function regroupByTopupWebCategories(currencies, packages, makeId) {
  const categoryOrder = [];
  const rankByKey = new Map();
  (packages || []).forEach((pkg, index) => {
    const category = String(pkg.category || "").trim();
    if (category && !categoryOrder.includes(category)) categoryOrder.push(category);
    for (const candidate of [pkg.label, pkg.amountDisplay]) {
      const key = gameinfoPackMatchKey(candidate);
      if (key && !rankByKey.has(key)) rankByKey.set(key, index);
    }
  });
  const rank = (name) => rankByKey.get(gameinfoPackMatchKey(name)) ?? rankByKey.get(gameinfoPackMatchKey(withoutTimes(name))) ?? Infinity;
  let moved = 0;
  let matched = 0;
  let unmatched = 0;
  const next = (currencies || []).map((currency) => {
    const packs = currency.categories.flatMap((category) => category.packs.map((pack) => ({ pack, from: category })));
    const webCategory = topupWebPackCategories(packs.map(({ pack }) => pack.name), packages);
    const byName = new Map();
    for (const category of currency.categories) {
      const name = String(category.name || "").trim();
      if (categoryOrder.includes(name) && !byName.has(name)) byName.set(name, category);
    }
    const webBuckets = new Map(categoryOrder.map((name) => [name, []]));
    const stay = new Map(currency.categories.map((category) => [category, []]));
    for (const entry of packs) {
      const target = webCategory.get(entry.pack.name);
      if (target) {
        matched += 1;
        if (String(entry.from.name || "").trim() !== target) moved += 1;
        webBuckets.get(target).push(entry.pack);
      } else {
        unmatched += 1;
        // Already in a category the website has: it stays there, after the website's packs.
        const fromName = String(entry.from.name || "").trim();
        if (byName.get(fromName) === entry.from) webBuckets.get(fromName).push(entry.pack);
        else stay.get(entry.from).push(entry.pack);
      }
    }
    const categories = [];
    for (const name of categoryOrder) {
      const bucket = webBuckets.get(name);
      if (!bucket.length) continue;
      const sorted = bucket.map((pack, index) => ({ pack, index })).sort((a, b) => rank(a.pack.name) - rank(b.pack.name) || a.index - b.index).map(({ pack }) => pack);
      const existing = byName.get(name);
      categories.push(existing ? { ...existing, packs: sorted } : { id: makeId(), name, packs: sorted });
    }
    for (const category of currency.categories) {
      if (byName.get(String(category.name || "").trim()) === category) continue;
      const kept = stay.get(category);
      if (kept.length || !category.packs.length) categories.push({ ...category, packs: kept });
    }
    return { ...currency, categories };
  });
  return { currencies: next, moved, matched, unmatched, categories: categoryOrder };
}
