import { evaluateGameinfoComputedColumn } from "@/lib/gameinfo-computed-evaluator";
import { gameinfoPackStatus } from "@/lib/gameinfo-pack-model";

// The game page's pack list: per pack, what it gets, its cost and one selling
// channel's price, profit and margin; the rest opens under the row.

// Margins below LOW are flagged; GOOD and up read as healthy.
export const GAMEINFO_MARGIN_LOW = 10;
export const GAMEINFO_MARGIN_GOOD = 18;

// Where a pack is sold, by the column holding its price there. Columns are
// shared by every game and named by people, so they are found by name, the way
// the default column order finds them (gameinfo-pack-columns.js). The page's
// own price is the pack's ราคา field.
export const GAMEINFO_PRICE_CHANNELS = [
  { key: "page", label: "เพจ Inblackm", short: "เพจ", column: "" },
  { key: "kaleoz", label: "Kaleoz", short: "Kaleoz", column: "ราคาขาย(kaleoz)" },
  { key: "kaleoz5", label: "Kaleoz ลด 5%", short: "Kaleoz −5%", column: "kaleoz5%" },
  { key: "russia", label: "Russia", short: "Russia", column: "ราคาrussia" },
];
const COST_COLUMN = "ต้นทุน";

const squash = (label) => String(label ?? "").replace(/\s+/g, "").toLowerCase();

/** A plain number, or null for blanks and text such as "236155 X 2". */
export function gameinfoListNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : null;
}

export function gameinfoMarginTone(margin) {
  if (margin === null || !Number.isFinite(margin)) return "";
  if (margin >= GAMEINFO_MARGIN_GOOD) return "green";
  return margin >= GAMEINFO_MARGIN_LOW ? "amber" : "red";
}

/** The cost column and each channel's price column among the columns given. */
export function gameinfoPackListColumns(columns) {
  const byName = new Map((columns || []).filter((column) => column.kind === "computed").map((column) => [squash(column.label), column]));
  return {
    cost: byName.get(COST_COLUMN) || null,
    channels: GAMEINFO_PRICE_CHANNELS
      .map((channel) => ({ ...channel, priceColumn: channel.column ? byName.get(channel.column) || null : null }))
      .filter((channel) => !channel.column || channel.priceColumn),
  };
}

function figures(price, cost) {
  const profit = price !== null && cost !== null ? price - cost : null;
  return { price, profit, margin: profit !== null && price > 0 ? (profit / price) * 100 : null };
}

/**
 * One row per pack of the currency, its computed columns worked out once.
 * `channels` keeps only those with a price on some pack.
 */
export function buildGameinfoPackListRows(currency, columns, game, context = {}) {
  const computed = (columns || []).filter((column) => column.kind === "computed");
  const definitions = computed.map((column) => column.computed);
  const { cost, channels } = gameinfoPackListColumns(columns);
  const rows = (currency?.categories || []).flatMap((category, categoryIndex) => (category.packs || []).map((pack) => {
    const values = {};
    const errors = new Set();
    for (const column of computed) {
      try {
        values[column.id] = evaluateGameinfoComputedColumn(column.computed, definitions, pack, game, { ...context, categoryId: category.id });
      } catch {
        values[column.id] = null;
        errors.add(column.id);
      }
    }
    const costValue = cost ? gameinfoListNumber(values[cost.id]) : null;
    const byChannel = Object.fromEntries(channels.map((channel) => [
      channel.key,
      figures(channel.priceColumn ? gameinfoListNumber(values[channel.priceColumn.id]) : gameinfoListNumber(pack.price), costValue),
    ]));
    return { pack, category, categoryIndex, values, errors, cost: costValue, channels: byChannel, status: gameinfoPackStatus(pack) };
  }));
  return {
    rows,
    costColumn: cost,
    channels: channels.filter((channel) => rows.some((row) => row.channels[channel.key].price !== null)),
  };
}

// The status tabs on the game page and in the pack editor: a pack on sale is
// Active, one switched off by hand Closed.
export const GAMEINFO_PACK_LIST_STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "new", label: "New" },
  { id: "expired", label: "Expired" },
  { id: "closed", label: "Closed" },
];
const STATUS_TAB = { open: "active", new: "new", expired: "expired", closed: "closed" };

export function gameinfoPackListStatusTab(row) {
  return STATUS_TAB[row.status] || "active";
}

/**
 * Search, group chip ("all", "low", "bot" or a category id), status tab and
 * sort, as the list shows them. "bot" keeps the rows marked `auto`.
 */
export function filterGameinfoPackListRows(rows, { query = "", chip = "all", status = "all", sort = "default", channel = "page" } = {}) {
  const needle = query.trim().toLowerCase();
  const margin = (row) => row.channels[channel]?.margin ?? null;
  const price = (row) => row.channels[channel]?.price ?? gameinfoListNumber(row.pack.price);
  let list = rows.filter((row) => !needle || String(row.pack.name || "").toLowerCase().includes(needle));
  if (chip === "low") list = list.filter((row) => margin(row) !== null && margin(row) < GAMEINFO_MARGIN_LOW);
  else if (chip === "bot") list = list.filter((row) => row.auto);
  else if (chip !== "all") list = list.filter((row) => row.category.id === chip);
  if (status !== "all") list = list.filter((row) => gameinfoPackListStatusTab(row) === status);
  const by = (read, direction) => (left, right) => {
    const a = read(left);
    const b = read(right);
    if (a === null || b === null) return a === null ? (b === null ? 0 : 1) : -1;
    return (a - b) * direction;
  };
  if (sort === "margin-asc") return [...list].sort(by(margin, 1));
  if (sort === "margin-desc") return [...list].sort(by(margin, -1));
  if (sort === "price") return [...list].sort(by(price, 1));
  return list;
}

/** Average and lowest margin over the rows that have one, and how many are low. */
export function summarizeGameinfoPackList(rows, channel) {
  const priced = rows.filter((row) => row.channels[channel]?.margin !== null && row.channels[channel]?.margin !== undefined);
  if (!priced.length) return null;
  const margins = priced.map((row) => row.channels[channel].margin);
  const lowest = priced.reduce((min, row) => (row.channels[channel].margin < min.channels[channel].margin ? row : min));
  return {
    count: priced.length,
    average: margins.reduce((sum, value) => sum + value, 0) / margins.length,
    lowest,
    low: margins.filter((value) => value < GAMEINFO_MARGIN_LOW).length,
  };
}
