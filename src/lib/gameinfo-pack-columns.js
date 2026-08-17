import { formatCell } from "@/lib/gamedb-layout";

export const GAMEINFO_PACK_BASE_COLUMNS = [
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
  { id: "country", label: "ประเทศ", field: "country", track: "minmax(80px, 0.8fr)" },
];

export const GAMEINFO_PACK_SYMBOLS = ["", "$", "฿", "%"];

export function buildGameinfoPackColumns(computedColumns = []) {
  return [
    ...GAMEINFO_PACK_BASE_COLUMNS.map((column) => ({ ...column, kind: "base" })),
    ...(computedColumns || []).map((computed) => ({
      id: `computed:${computed.key}`,
      label: computed.label,
      kind: "computed",
      track: "minmax(70px, 0.8fr)",
      computed,
      type: computed.type,
      symbol: GAMEINFO_PACK_SYMBOLS.includes(computed.symbol) ? computed.symbol : "",
    })),
  ];
}

export function normalizeGameinfoPackLayout(raw, columns) {
  const ids = columns.map((column) => column.id);
  const known = new Set(ids);
  const order = [];
  for (const id of Array.isArray(raw?.order) ? raw.order : []) {
    if (known.has(id) && !order.includes(id)) order.push(id);
  }
  for (const id of ids) {
    if (!order.includes(id)) order.push(id);
  }
  const hidden = [];
  for (const id of Array.isArray(raw?.hidden) ? raw.hidden : []) {
    if (known.has(id) && !hidden.includes(id)) hidden.push(id);
  }
  return { order, hidden };
}

export function reorderGameinfoPackColumns(layout, activeId, overId) {
  const order = [...layout.order];
  const from = order.indexOf(activeId);
  const to = order.indexOf(overId);
  if (from === -1 || to === -1 || from === to) return layout;
  order.splice(from, 1);
  order.splice(to, 0, activeId);
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

export function gameinfoPackLayoutStorageKey({ userId, gameId, surface }) {
  return `gameinfo:pack-columns:v1:${String(userId)}:${String(gameId)}:${surface}`;
}
