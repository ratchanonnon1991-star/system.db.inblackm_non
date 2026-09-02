import { formatCell } from "@/lib/gamedb-layout";

export const GAMEINFO_PACK_BASE_COLUMNS = [
  { id: "serviceEnabled", label: "สถานะ", field: "serviceEnabled", track: "70px", minWidth: 70, maxWidth: 90 },
  { id: "image", label: "รูป", field: "image", track: "40px", minWidth: 40, maxWidth: 56 },
  { id: "name", label: "ชื่อ pack", field: "name", track: "minmax(110px, 1.6fr)", minWidth: 140, maxWidth: 360, required: true },
  { id: "price", label: "ราคา", field: "price", track: "minmax(60px, 0.7fr)", minWidth: 80, maxWidth: 140, required: true },
  {
    id: "amountChargedFee",
    label: "ยอดที่กด + fee",
    field: "amountChargedFee",
    track: "minmax(70px, 0.8fr)",
    minWidth: 120,
    maxWidth: 180,
    required: true,
  },
  {
    id: "channelsMain",
    label: "ช่องทางหลัก",
    field: "channelsMain",
    track: "minmax(90px, 1fr)",
    minWidth: 120,
    maxWidth: 720,
    required: true,
  },
  {
    id: "channelsSecondary",
    label: "ช่องทางรอง",
    field: "channelsSecondary",
    track: "minmax(90px, 1fr)",
    minWidth: 120,
    maxWidth: 720,
  },
  { id: "country", label: "ประเทศ", field: "country", track: "minmax(80px, 0.8fr)", minWidth: 100, maxWidth: 220, required: true },
];

/* The status column doubles as the row-select checkbox, so it stays pinned
   first and always visible — column presets cannot hide or move it. */
export const GAMEINFO_PACK_PINNED_COLUMN_ID = "serviceEnabled";

export function isGameinfoPackColumnPinned(column) {
  return (typeof column === "string" ? column : column?.id) === GAMEINFO_PACK_PINNED_COLUMN_ID;
}

export const GAMEINFO_PACK_SYMBOLS = ["", "$", "฿", "%"];

export function buildGameinfoPackColumns(computedColumns = []) {
  return [
    ...GAMEINFO_PACK_BASE_COLUMNS.map((column) => ({ ...column, kind: "base" })),
    ...(computedColumns || []).filter((computed) => computed.kind !== "market" || computed.enabled !== false).map((computed) => ({
      id: `computed:${computed.key}`,
      label: computed.label,
      kind: "computed",
      track: "minmax(70px, 0.8fr)",
      minWidth: 100,
      maxWidth: 240,
      computed,
      type: computed.type,
      symbol: typeof computed.symbol === "string" ? computed.symbol.slice(0, 24) : "",
    })),
  ];
}

export function gameinfoPackColumnWidth(column, values = []) {
  const minWidth = Number(column?.minWidth) || 100;
  const maxWidth = Math.max(minWidth, Number(column?.maxWidth) || 240);
  const textLength = (value) => {
    const items = Array.isArray(value) ? value : [value];
    const text = items.map((item) => String(item ?? "")).join(" ");
    return Array.from(text).length + Math.max(0, items.length - 1) * 3;
  };
  const longest = Math.max(textLength(column?.label), ...values.map(textLength));
  const inputReserve = ["channelsMain", "channelsSecondary"].includes(column?.id) ? 96 : 0;
  return Math.min(maxWidth, Math.max(minWidth, Math.ceil(32 + longest * 7.5 + inputReserve)));
}

export function normalizeGameinfoPackLayout(raw, columns) {
  const ids = columns.map((column) => column.id);
  const known = new Set(ids);
  const statusId = known.has(GAMEINFO_PACK_PINNED_COLUMN_ID) ? GAMEINFO_PACK_PINNED_COLUMN_ID : null;
  const order = [];
  if (statusId) order.push(statusId);
  for (const id of Array.isArray(raw?.order) ? raw.order : []) {
    if (known.has(id) && !order.includes(id)) order.push(id);
  }
  for (const id of ids) {
    if (!order.includes(id)) order.push(id);
  }
  const hidden = [];
  for (const id of Array.isArray(raw?.hidden) ? raw.hidden : []) {
    if (id === statusId) continue;
    if (known.has(id) && !hidden.includes(id)) hidden.push(id);
  }
  // Columns are shared by every game now, so new ones appear in games that had
  // nothing to do with creating them. A saved preset is a deliberate choice of
  // what to look at, so anything registered after it was saved starts hidden
  // and the user opts in. `knownIds` records what existed at save time;
  // presets saved before it was recorded keep the old show-everything
  // behaviour rather than suddenly hiding columns their owner relies on.
  if (Array.isArray(raw?.knownIds)) {
    const knownAtSave = new Set(raw.knownIds);
    for (const id of ids) {
      if (id === statusId || knownAtSave.has(id) || hidden.includes(id)) continue;
      hidden.push(id);
    }
  }
  const filters = [];
  for (const filter of Array.isArray(raw?.filters) ? raw.filters : []) {
    const columnId = String(filter?.columnId || "");
    const operator = ["contains", "equals", "not_empty", "empty"].includes(filter?.operator)
      ? filter.operator
      : "contains";
    if (!known.has(columnId)) continue;
    filters.push({ columnId, operator, value: String(filter?.value ?? "").slice(0, 200) });
    if (filters.length >= 10) break;
  }
  return { order, hidden, filters };
}

/** The column ids to record on a preset so later additions start hidden. */
export function gameinfoPackLayoutKnownIds(columns) {
  return (columns || []).map((column) => column.id);
}

// A shared column is registered for every game, but most games have nothing to
// put in most columns. "Has data here" is simply: at least one pack in this
// game produces a value. Computed values are never stored — they are derived
// on render — so this asks the same evaluator the table does, and a column
// that gets its first value stops counting as empty with no flag to maintain.
export function gameinfoColumnsWithData(columns, packs, getValue) {
  const withData = new Set();
  for (const column of columns || []) {
    if (column.kind !== "computed") {
      withData.add(column.id);
      continue;
    }
    for (const pack of packs || []) {
      const value = getValue(column, pack);
      if (value !== undefined && value !== null && value !== "") {
        withData.add(column.id);
        break;
      }
    }
  }
  return withData;
}

export function reorderGameinfoPackColumns(layout, activeId, overId) {
  if (isGameinfoPackColumnPinned(activeId)) return layout;
  const order = [...layout.order];
  const from = order.indexOf(activeId);
  const to = order.indexOf(overId);
  if (from === -1 || to === -1 || from === to) return layout;
  order.splice(from, 1);
  order.splice(Math.max(1, to), 0, activeId);
  return { ...layout, order };
}

export function orderGameinfoPackColumns(columns, layout) {
  const byId = new Map(columns.map((column) => [column.id, column]));
  return layout.order.map((id) => byId.get(id)).filter(Boolean);
}

export function formatGameinfoPackColumnValue(value, column) {
  const formatted = formatCell(value, column?.type);
  if (formatted === "—" || !column?.symbol) return formatted;
  return column.symbol === "%" ? `${formatted}%` : `${column.symbol}${formatted}`;
}

export function matchesGameinfoPackFilters(pack, filters, resolveValue) {
  return (filters || []).every((filter) => {
    const raw = resolveValue(filter.columnId, pack);
    const text = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "");
    const actual = text.trim().toLocaleLowerCase("th");
    const expected = String(filter.value ?? "").trim().toLocaleLowerCase("th");
    if (filter.operator === "empty") return !actual;
    if (filter.operator === "not_empty") return Boolean(actual);
    if (filter.operator === "equals") return actual === expected;
    return actual.includes(expected);
  });
}

export function gameinfoPackLayoutStorageKey({ userId, gameId, surface }) {
  return `gameinfo:pack-columns:v1:${String(userId)}:${String(gameId)}:${surface}`;
}
