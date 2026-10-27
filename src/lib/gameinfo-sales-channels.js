// Where a game is sold outside top-up itself, and how it is doing there:
// one row per channel with a selling status, how our price compares with the
// market, and the margin. The channels and their labels mirror the columns
// of the "1.1 ข้อมูลเติมเกม UID" sheet (GAMELIST, List Game เปิด-ปิด), which is
// where this data lived before GameInfo.

export const GAMEINFO_SALES_CHANNELS = [
  { key: "page", label: "เพจ Inblackm" },
  { key: "kaleoz", label: "Kaleoz" },
  { key: "itemku", label: "ITEMKU" },
  { key: "g2g", label: "G2G" },
  { key: "funpay", label: "FUNPAY" },
  { key: "russia", label: "Russia" },
  { key: "playerok_topupman", label: "Playerok Topupman" },
  { key: "playerok_allin", label: "Playerok Allin" },
  { key: "playerok_inblackm", label: "Playerok Inblackm" },
  { key: "playerok_oxide", label: "Playerok OXIDE NO 1" },
];
const CHANNEL_KEYS = new Set(GAMEINFO_SALES_CHANNELS.map((channel) => channel.key));

export const GAMEINFO_SALES_STATUSES = [
  { key: "open", label: "เปิดขายแล้ว", tone: "ok" },
  { key: "listing", label: "กำลังลงสินค้า", tone: "info" },
  { key: "verify", label: "รอ verify", tone: "info" },
  { key: "paused", label: "ปิดชั่วคราว", tone: "warn" },
  { key: "closed", label: "ปิดการขาย", tone: "muted" },
  { key: "none", label: "ไม่มีเกม", tone: "muted" },
  { key: "removed", label: "ลบแล้ว", tone: "muted" },
];

export const GAMEINFO_MARKET_RESULTS = [
  { key: "win_all", label: "ชนะทุกแพ็ค", tone: "ok" },
  { key: "win_some", label: "ชนะบางแพ็ค", tone: "warn" },
  { key: "lose_all", label: "แพ้ทุกแพ็ค", tone: "bad" },
  { key: "off", label: "OFF", tone: "muted" },
];

const STATUS_KEYS = new Set(GAMEINFO_SALES_STATUSES.map((status) => status.key));
const MARKET_KEYS = new Set(GAMEINFO_MARKET_RESULTS.map((result) => result.key));

export function gameinfoSalesStatus(key) {
  return GAMEINFO_SALES_STATUSES.find((status) => status.key === key) || null;
}

export function gameinfoMarketResult(key) {
  return GAMEINFO_MARKET_RESULTS.find((result) => result.key === key) || null;
}

function squash(value) {
  return String(value ?? "").replace(/\s+/g, "").toLocaleLowerCase("th");
}

// The sheet's wording, typos included ("เปิดขา่ยแล้ว" is in it 20+ times).
const STATUS_WORDS = {
  เปิดขายแล้ว: "open",
  เปิดขา่ยแล้ว: "open",
  open: "open",
  กำลังลงสินค้า: "listing",
  รอverify: "verify",
  ปิดชั่วคราว: "paused",
  ปิดการขาย: "closed",
  off: "closed",
  ไม่มีเกม: "none",
  del: "removed",
};
const MARKET_WORDS = {
  ชนะทุกแพ็ค: "win_all",
  ชนะบางแพ็ค: "win_some",
  แพ้ทุกแพ็ค: "lose_all",
  off: "off",
};

export function normalizeGameinfoSalesStatus(value) {
  return STATUS_WORDS[squash(value)] || "";
}

export function normalizeGameinfoMarketResult(value) {
  return MARKET_WORDS[squash(value)] || "";
}

/** "4.23%" → 4.23; blank or unreadable → null. */
export function parseGameinfoMargin(value) {
  const text = String(value ?? "").replace(/[%,\s]/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

/** One channel row as stored: only known keys, nothing else. */
export function sanitizeGameinfoSalesChannel(input) {
  const channel = String(input?.channel || "");
  if (!CHANNEL_KEYS.has(channel)) return null;
  const margin = input?.margin === "" || input?.margin == null ? null : Number(input.margin);
  return {
    channel,
    status: STATUS_KEYS.has(input?.status) ? input.status : "",
    market: MARKET_KEYS.has(input?.market) ? input.market : "",
    margin: Number.isFinite(margin) ? Math.round(margin * 100) / 100 : null,
    note: String(input?.note ?? "").trim().slice(0, 200),
  };
}

export function isEmptyGameinfoSalesChannel(row) {
  return !row || (!row.status && !row.market && row.margin == null && !row.note);
}

// --- the sheet ---------------------------------------------------------

/** The key two spellings of one game name share ("HONKAI IMPACT " = "Honkai Impact"). */
export function gameinfoSheetGameKey(name) {
  return String(name ?? "").split("\n")[0].replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}

// A GAMELIST game cell can carry a warning under the name, always flagged
// with ⚠️: "HONKAI IMPACT \n⚠️*ระวังเติมผิดBchip / Crystal*⚠️". Other second
// lines are part of the name ("BLACK DESERT \nPC/CONSOLE (Razer Link)").
function splitGameCell(cell) {
  const [first, ...rest] = String(cell ?? "").split("\n");
  const extra = rest.join("\n");
  const warning = /⚠/.test(extra)
    ? extra.replace(/⚠️|⚠/g, "").replace(/\*/g, "").replace(/\s+/g, " ").trim()
    : "";
  return { name: first.replace(/\s+/g, " ").trim(), warning };
}

function columnIndex(header, label) {
  const target = squash(label);
  return header.findIndex((cell) => squash(cell) === target);
}

// GAMELIST column per channel: its status column is named after the channel,
// the market result is the "ราคาตลาด" column right after it.
const GAMELIST_STATUS_COLUMNS = {
  page: "PAGE",
  kaleoz: "Kaleoz",
  g2g: "G2G",
  itemku: "ITEMKU",
  funpay: "FUNPAY",
  playerok_topupman: "Player OK Topupman",
  playerok_allin: "Player OK Allin",
  playerok_inblackm: "Player OK Inblackm",
  playerok_oxide: "Player OK OXIDE NO 1",
};
const GAMELIST_MARGIN_COLUMNS = {
  page: "Inblackm Margin (%)",
  kaleoz: "Kaleoz Margin (%)",
  itemku: "Itemku Margin (%)",
  playerok_topupman: "Playerok Margin (%)",
  g2g: "G2G Margin (%)",
  russia: "Russia Margin (%)",
};
// "List Game เปิด-ปิด" keeps a second OPEN/OFF/DEL per channel; GAMELIST's
// own status wins where both exist, and Russia only appears here.
const ONOFF_COLUMNS = { page: "PAGE", kaleoz: "KALEOZ", russia: "RUSSIA", itemku: "ITEMKU" };

/**
 * Both tabs, as rows of cells (the header row first), into one entry per game:
 * { key, name, warning, publisher, category, remark, channels: { [channel]: row } }.
 */
export function parseGameinfoSourceSheet({ gamelist = [], onoff = [] }) {
  const games = new Map();
  const header = (gamelist[0] || []).map((cell) => String(cell ?? ""));
  const col = (label) => columnIndex(header, label);
  const gameCol = col("Game");
  if (gameCol >= 0) {
    const publisherCol = col("ค่ายเกม");
    const categoryCol = col("ประเภทเกม");
    const remarkCol = col("หมายเหตุ");
    const statusCols = Object.fromEntries(Object.entries(GAMELIST_STATUS_COLUMNS).map(([key, label]) => [key, col(label)]));
    const marginCols = Object.fromEntries(Object.entries(GAMELIST_MARGIN_COLUMNS).map(([key, label]) => [key, col(label)]));
    for (const row of gamelist.slice(1)) {
      const { name, warning } = splitGameCell(row[gameCol]);
      const key = gameinfoSheetGameKey(name);
      if (!key || games.has(key)) continue;
      const cell = (index) => (index >= 0 ? String(row[index] ?? "").trim() : "");
      const channels = {};
      for (const { key: channel } of GAMEINFO_SALES_CHANNELS) {
        const statusIndex = statusCols[channel] ?? -1;
        const entry = sanitizeGameinfoSalesChannel({
          channel,
          status: normalizeGameinfoSalesStatus(cell(statusIndex)),
          market: statusIndex >= 0 ? normalizeGameinfoMarketResult(cell(statusIndex + 1)) : "",
          margin: parseGameinfoMargin(cell(marginCols[channel] ?? -1)),
        });
        if (!isEmptyGameinfoSalesChannel(entry)) channels[channel] = entry;
      }
      games.set(key, {
        key,
        name,
        warning,
        publisher: cell(publisherCol),
        category: cell(categoryCol),
        remark: cell(remarkCol),
        channels,
      });
    }
  }

  // The on/off tab's header is its second row ("PAGE", "KALEOZ", …) and the
  // game name sits in the column right before PAGE.
  const onoffHeaderIndex = onoff.findIndex((row) => row.some((cell) => squash(cell) === "page"));
  if (onoffHeaderIndex >= 0) {
    const onoffHeader = onoff[onoffHeaderIndex].map((cell) => String(cell ?? ""));
    const pageCol = columnIndex(onoffHeader, "PAGE");
    for (const row of onoff.slice(onoffHeaderIndex + 1)) {
      const { name } = splitGameCell(row[pageCol - 1]);
      const key = gameinfoSheetGameKey(name);
      if (!key) continue;
      const game = games.get(key) || { key, name, warning: "", publisher: "", category: "", remark: "", channels: {} };
      for (const [channel, label] of Object.entries(ONOFF_COLUMNS)) {
        const status = normalizeGameinfoSalesStatus(row[columnIndex(onoffHeader, label)]);
        if (!status) continue;
        const current = game.channels[channel] || sanitizeGameinfoSalesChannel({ channel });
        if (!current.status) game.channels[channel] = { ...current, status };
      }
      games.set(key, game);
    }
  }
  return [...games.values()];
}
