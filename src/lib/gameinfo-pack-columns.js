import { formatCell } from "@/lib/gamedb-layout";

export const GAMEINFO_PACK_BASE_COLUMNS = [
  { id: "serviceEnabled", label: "สถานะ", field: "serviceEnabled", track: "70px" },
  { id: "image", label: "รูป", field: "image", track: "40px" },
  { id: "name", label: "ชื่อ pack", field: "name", track: "minmax(110px, 1.6fr)", required: true },
  { id: "price", label: "ราคา", field: "price", track: "minmax(60px, 0.7fr)", required: true },
  {
    id: "amountChargedFee",
    label: "ยอดที่กด + fee",
    field: "amountChargedFee",
    track: "minmax(70px, 0.8fr)",
    required: true,
  },
  {
    id: "channelsMain",
    label: "ช่องทางหลัก",
    field: "channelsMain",
    track: "minmax(90px, 1fr)",
    required: true,
  },
  {
    id: "channelsSecondary",
    label: "ช่องทางรอง",
    field: "channelsSecondary",
    track: "minmax(90px, 1fr)",
  },
  { id: "country", label: "ประเทศ", field: "country", track: "minmax(80px, 0.8fr)", required: true },
];

export const GAMEINFO_PACK_SYMBOLS = ["", "$", "฿", "%"];

export function buildGameinfoPackColumns(computedColumns = []) {
  return [
    ...GAMEINFO_PACK_BASE_COLUMNS.map((column) => ({ ...column, kind: "base" })),
    ...(computedColumns || []).filter((computed) => computed.kind !== "market" || computed.enabled !== false).map((computed) => ({
      id: `computed:${computed.key}`,
      label: computed.label,
      kind: "computed",
      track: "minmax(70px, 0.8fr)",
      computed,
      type: computed.type,
      symbol: typeof computed.symbol === "string" ? computed.symbol.slice(0, 24) : "",
    })),
  ];
}

export function normalizeGameinfoPackLayout(raw, columns) {
  const ids = columns.map((column) => column.id);
  const known = new Set(ids);
  const statusId = known.has("serviceEnabled") ? "serviceEnabled" : null;
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

export function reorderGameinfoPackColumns(layout, activeId, overId) {
  if (activeId === "serviceEnabled") return layout;
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
