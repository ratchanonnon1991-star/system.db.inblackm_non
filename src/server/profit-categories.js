// Live GoCash from sky_gocash_history. Other categories are local (team fills
// sale/cost by hand) until those providers have a DB feed.
export const CATEGORIES = [
  { id: "gocash", name: "GoCash", group: "bot", source: "gocash" },
  // Snapshot only — the bot overwrites card balance in place, no per-order
  // ledger exists, so there's no history/deducted/remaining-over-time to show.
  // excludeFromTotals: balance is in MOL points, not USD — mixing it into the
  // dashboard's USD rollups would silently corrupt those totals.
  { id: "oxide", name: "Oxide", group: "bot", source: "oxide", excludeFromTotals: true },
  { id: "codashop", name: "Codashop", group: "bot", source: "manual" },
  { id: "unipin", name: "UniPin", group: "bot", source: "manual" },
  // Filtered view of the same live GoCash data (cards with unusable dust
  // balance) — a manual clearing worklist for humans, not bot-driven data,
  // so it lives under HUMAN (MANUAL) rather than nested under GoCash.
  // excludeFromTotals: it's a subset of the 'gocash' category above, so its
  // money must not be added a second time into dashboard rollups.
  { id: "gocash-dust", name: "GoCash", group: "human", source: "gocash-dust", excludeFromTotals: true },
];

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}
