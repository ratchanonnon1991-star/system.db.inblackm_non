// Live GoCash from sky_gocash_history, live Multi Game Card and WavePay from
// codashop_orders (see profit-oxide.js / profit-wavepay.js). Other
// categories are local (team fills sale/cost by hand) until those providers
// have a DB feed of their own.
export const CATEGORIES = [
  { id: "gocash", name: "GoCash", group: "bot", source: "gocash" },
  // Snapshot only — the bot overwrites card balance in place, no per-order
  // ledger exists, so there's no history/deducted/remaining-over-time to show.
  // excludeFromTotals: balance is in MOL points, not USD — mixing it into the
  // dashboard's USD rollups would silently corrupt those totals.
  { id: "oxide", name: "Multi Game Card", group: "bot", source: "oxide", excludeFromTotals: true },
  { id: "codashop", name: "Codashop", group: "bot", source: "manual" },
  { id: "unipin", name: "UniPin", group: "bot", source: "manual" },
  // Live WavePay wallet accounts (codashop_orders WHERE payment_method =
  // 'WavePay'). One card pool shared across several games (Love and
  // Deepspace, Harry Potter: Magic Awakened, The Division Resurgence,
  // ZEPETO, ...) -- see the "เกม" picker on its category page, same as
  // Oxide, populated from real game_name data, not hand-tagged.
  { id: "wavepay", name: "Wavepay", group: "bot", source: "wavepay" },
  // Filtered view of the same live GoCash data (cards with unusable dust
  // balance) — a manual clearing worklist for humans, not bot-driven data,
  // so it lives under HUMAN (MANUAL) rather than nested under GoCash.
  // excludeFromTotals: it's a subset of the 'gocash' category above, so its
  // money must not be added a second time into dashboard rollups.
  { id: "gocash-dust", name: "GoCash", group: "human", source: "gocash-dust", excludeFromTotals: true },
  // Filtered view of the same live Multi Game Card data (cards sitting idle
  // 12h+ with a leftover balance) — a manual consolidation worklist, same
  // idea as gocash-dust above just triggered by idle time instead of a dust
  // balance threshold (Multi Game Card has no dust concept -- points don't
  // go stale the way a sub-$1 USD remainder does).
  // excludeFromTotals: it's a subset of the 'oxide' category above.
  { id: "oxide-merge", name: "Multi Game Card", group: "human", source: "oxide-merge", excludeFromTotals: true },
];

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}
