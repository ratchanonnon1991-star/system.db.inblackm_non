import { tablePage } from "./table-pagination.js";

const common = ["txid", "saleOrderId", "packName", "gameName", "cardName"];
export const PROFIT_HISTORY_FIELDS = {
  agenh2h: [...common, "account"], donshop: [...common, "account"], gamepoint: [...common, "account"],
  u9: [...common, "account"], wavepay: [...common, "account"],
  atom: [...common, "account", "invoiceTxnId"], smartsun: [...common, "account", "invoiceTxnId"], truemoney: [...common, "account", "invoiceTxnId"],
  codareseller: [...common, "invoiceNumber", "skuIds"], netease: [...common, "neteaseOrderNo", "purchaseEmail"],
  oxide: [...common, "cardSerial"], gocash: ["txid", "orderId", "saleOrderId", "packName", "game", "cardName", "cardSerial", "slotIndex"],
};

// The server reuses this index only for the same immutable report snapshot.
// Stable ties preserve feed order; invalid dates retain filter-then-sort behavior.
export function prepareProfitHistory(rows) {
  const records = rows.map((row) => ({ row, at: new Date(row.createdAt).getTime() }));
  const validDates = records.every(({ at }) => Number.isFinite(at));
  const sorted = new Map();
  return { records, validDates,
    games: [...new Set(rows.map((row) => row.gameName).filter(Boolean))].sort(),
    platforms: [...new Set(rows.map((row) => row.platform).filter(Boolean))].sort(),
    ordered(direction) {
      if (!validDates) return records;
      const key = direction === "asc" ? "asc" : "desc";
      if (!sorted.has(key)) sorted.set(key, [...records].sort((a, b) => key === "asc" ? a.at - b.at : b.at - a.at));
      return sorted.get(key);
    },
  };
}

export function profitHistoryPage(rows, provider, options = {}, prepared = prepareProfitHistory(rows)) {
  const fields = PROFIT_HISTORY_FIELDS[provider];
  if (!fields) throw new Error("Unknown history provider");
  const search = String(options.search || "").trim().toLowerCase();
  const orderId = String(options.orderId || "").trim().toLowerCase();
  const from = options.fromMs ? Number(options.fromMs) : null, to = options.toMs ? Number(options.toMs) : null;
  const game = options.game || "", platform = options.platform || "";
  const filtered = prepared.ordered(options.sort).filter(({ row, at }) => {
    if (from && at < from || to && at > to) return false;
    if (game === "__none__" ? row.gameName : game && row.gameName !== game) return false;
    if (platform === "__none__" ? row.platform : platform && row.platform !== platform) return false;
    if (orderId && ![row.saleOrderId, row.orderId, row.txid].some((value) => String(value || "").toLowerCase().includes(orderId))) return false;
    if (!search) return true;
    const hay = fields.map((field) => row[field]).filter((value) => value != null && value !== "").join(" ").toLowerCase();
    return hay.includes(search);
  });
  if (!prepared.validDates) filtered.sort((a, b) => options.sort === "asc" ? a.at - b.at : b.at - a.at);
  const pagination = tablePage(filtered.length, options.page, options.pageSize);
  return { history: filtered.slice(pagination.start, pagination.end).map(({ row }) => row), pagination,
    games: prepared.games, platforms: prepared.platforms };
}
