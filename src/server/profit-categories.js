// Live feeds: GoCash (sky_gocash_history), Multi Game Card + WavePay + U9
// + TrueMoney + ATOM + Smart-Sun (codashop_orders — see profit-*-*.js),
// Codareseller (CodashopUSD) + Donshop (DonShopIDR) + Gamepoint (GamePointClub)
// + Agenh2h (AgenH2HIDR) + Netease (netease_purchase_history). Everything else
// is local (team fills sale/cost by hand) until that provider has a DB feed.
//
// Codareseller ≠ Sky Codashop bot (payment_method 'Codashop').
// TrueMoney / ATOM / Smart/Sun come from codashop_auto_api fill.
//
// Groups:
//   bot  — wallet / card bots
//   api  — reseller / H2H API channels
//   human — manual worklists over live bot data (ไม่นับซ้ำในยอดรวม)
export const CATEGORIES = [
  // —— Bot ——
  { id: "wavepay", name: "Wavepay", group: "bot", source: "wavepay" },
  { id: "u9", name: "U9", group: "bot", source: "u9" },
  { id: "gocash", name: "GoCash", group: "bot", source: "gocash" },
  // Snapshot only — the bot overwrites card balance in place, no per-order
  // ledger exists. excludeFromTotals: balance is MOL points, not USD.
  { id: "oxide", name: "Multigamecard", group: "bot", source: "oxide", excludeFromTotals: true },
  { id: "netease", name: "Netease", group: "bot", source: "netease" },
  { id: "truemoney", name: "TrueMoney", group: "bot", source: "truemoney" },
  { id: "atom", name: "ATOM", group: "bot", source: "atom" },
  { id: "smartsun", name: "Smart-Sun", group: "bot", source: "smartsun" },

  // —— API ——
  { id: "codareseller", name: "Codareseller", group: "api", source: "codareseller" },
  { id: "donshop", name: "Donshop", group: "api", source: "donshop" },
  { id: "gamepoint", name: "Gamepoint", group: "api", source: "gamepoint" },
  { id: "agenh2h", name: "Agenh2h", group: "api", source: "agenh2h" },

  // —— Human (manual) worklists — live subsets; ไม่รวมยอดซ้ำ ——
  { id: "gocash-dust", name: "GoCash", group: "human", source: "gocash-dust", excludeFromTotals: true },
  { id: "oxide-merge", name: "Multigamecard", group: "human", source: "oxide-merge", excludeFromTotals: true },
];

// Old ids kept so bookmarks / local cards still resolve after the Bot/API rename.
export const LEGACY_CATEGORY_IDS = {
  unipin: "u9",
  codashop: "codareseller",
};

export function getCategory(id) {
  const resolved = LEGACY_CATEGORY_IDS[id] || id;
  return CATEGORIES.find((c) => c.id === resolved) || null;
}

/** Previous id(s) that now point at `id`, for reading leftover local cards. */
export function legacyIdsFor(id) {
  return Object.entries(LEGACY_CATEGORY_IDS)
    .filter(([, neo]) => neo === id)
    .map(([old]) => old);
}
