// The iOS stock IDs, their packs, purchase orders and counts, read from the accounting
// sheets of the whole year:
//   1.1 บัญชีสั่งซื้อสินค้า › "N.รายการสั่งซื้อ Stock iOS (YAYA | BAO | Be | T002)": one row
//     per order: Date, GAME, Stock ID, then Pack (price in USD) / Amount / Price slots,
//     Total USD, Product Rate (CNY per USD), CNY Rate (CNY per USDT), TOTAL (USDT paid),
//     ลิงค์ใบเสร็จ, paid.
//   1.4 Cash Flow (dated tabs): what was left of each game's packs on that day.
// The sheets name a pack by its price, so a stock item is one price tier of one stock ID
// ("10 USD"), with the Cash Flow pack names of that tier as its pack name.
// Pure: the importer and the tests share it.
import { readStockCount, stockCountDate } from "@/lib/sheet-stock";

const squash = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const NUMBER = /^-?[\d,]*\.?\d+(e[-+]?\d+)?$/i;
const num = (value) => {
  const text = squash(value).replace(/,/g, "");
  return NUMBER.test(text) ? Number(text) : null;
};

/** Each game's stock ID; the sheets' other spellings of an ID. */
export const SHEET_GAMES = [
  { match: /^e ?football/i, code: "pes1", game: "eFootball" },
  { match: /^wuthering/i, code: "wuthering01", game: "Wuthering Waves" },
  { match: /^last ?war/i, code: "lastwar1", game: "Last War" },
  { match: /^pok[eé]mon( go)?$/i, code: "pokego", game: "Pokémon GO" },
  { match: /^diablo/i, code: "diablo01", game: "Diablo Immortal" },
  { match: /^honkai/i, code: "hsr", game: "Honkai: Star Rail" },
  { match: /^(zzz|zenless)/i, code: "zzz", game: "Zenless Zone Zero" },
  { match: /^moonlight/i, code: "moonlight", game: "Moonlight" },
];
export const SHEET_ID_ALIASES = { poekgo: "pokego", lastwar01: "lastwar1" };

export const sheetGame = (name) => SHEET_GAMES.find((entry) => entry.match.test(squash(name))) || null;

/** The stock ID a purchase row means: its own (spelling fixed), else its game's. */
export function sheetStockCode(game, id) {
  const typed = squash(id).toLowerCase();
  if (typed && typed !== "0") return SHEET_ID_ALIASES[typed] || typed;
  return sheetGame(game)?.code || "";
}

/** 10 → "10 USD", 4.8 → "4.8 USD". */
export const tierLabel = (price) => `${Number(price.toFixed(2))} USD`;

/** "1.รายการสั่งซื้อ Stock iOS (yay" → "YAYA"; not a purchase list → null. */
export function supplierOfTab(tab) {
  const name = squash(tab).toLowerCase();
  if (!/รายการสั่งซื้อ stock ios/.test(name)) return null;
  if (/\(.*ya/.test(name)) return "YAYA";
  if (/\(.*bao/.test(name)) return "BAO";
  if (/\(.*t0/.test(name)) return "T002";
  if (/\(.*be/.test(name)) return "Be";
  return squash(tab).replace(/^.*\(/, "").trim() || "ไม่ระบุ";
}

/**
 * One purchase list's rows ([{ rowNo, cells }], dates already readable) → its
 * orders: [{ rowNo, date, game, code, lines: [{ price, qty }], totalUsd,
 * productRate, cnyRate, usdt, receiptUrl, paid }] and problems.
 */
export function readPurchaseList(rows) {
  const orders = [];
  const problems = [];
  let cols = null;
  rows.forEach(({ rowNo, cells }, index) => {
    const labels = cells.map(squash);
    if (labels.includes("GAME") && labels.includes("Stock ID")) {
      const at = (label) => labels.indexOf(label);
      const below = (rows[index + 1]?.cells || []).map(squash);
      const packs = below.map((label, col) => (label === "Pack" ? col : -1)).filter((col) => col >= 0);
      cols = { date: at("Date"), game: at("GAME"), id: at("Stock ID"), packs, totalUsd: at("Total USD"), productRate: at("Product Rate"),
        cnyRate: at("CNY Rate"), usdt: at("TOTAL"), receipt: at("ลิงค์ใบเสร็จ"), paid: at("paid") };
      return;
    }
    if (!cols || labels.includes("Pack")) return;
    const game = labels[cols.game];
    const date = labels[cols.date];
    if (!game || game === "0" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const lines = [];
    for (const col of cols.packs) {
      let price = num(cells[col]);
      let qty = num(cells[col + 1]);
      if (!(price > 0) || !(qty > 0)) continue;
      // The slot's own Price column is pack × amount: a slot holding the order's totals fails it.
      const total = num(cells[col + 2]);
      if (total !== null && total > 0 && Math.abs(price * qty - total) > Math.max(0.5, total * 0.01)) {
        problems.push({ rowNo, reason: `ช่องแพ็ค ${price} × ${qty} ไม่เท่ากับ ${total} ข้ามช่องนี้` });
        continue;
      }
      // Pack and Amount typed the other way round (50 | 1.2 | 60).
      if (!Number.isInteger(qty) && Number.isInteger(price)) [price, qty] = [qty, price];
      if (!Number.isInteger(qty)) problems.push({ rowNo, reason: `จำนวน ${qty} ไม่เป็นจำนวนเต็ม ปัดเป็น ${Math.round(qty)}` });
      if (Math.round(qty) > 0) lines.push({ price, qty: Math.round(qty) });
    }
    if (!lines.length) return;
    const code = sheetStockCode(game, labels[cols.id]);
    if (!code) {
      problems.push({ rowNo, reason: `ไม่รู้ว่าเกม ${game} อยู่ไอดีไหน` });
      return;
    }
    const pick = (col) => (col >= 0 ? num(cells[col]) : null);
    const receipt = cols.receipt >= 0 ? labels[cols.receipt] : "";
    orders.push({
      rowNo, date, game, code, lines,
      totalUsd: pick(cols.totalUsd), productRate: pick(cols.productRate), cnyRate: pick(cols.cnyRate), usdt: pick(cols.usdt),
      receiptUrl: /^https:\/\//i.test(receipt) ? receipt.slice(0, 2000) : "",
      paid: cols.paid >= 0 ? labels[cols.paid] : "",
    });
  });
  return { orders, problems };
}

/**
 * Everything the year's sheets say about the iOS stock IDs →
 *   accounts: [{ code, game, items: [{ label, unitUsd, packNames }] }]
 *   events, oldest first: { type: "order", when, code, supplier, ref, lines: [{ label, qty }], … }
 *                          { type: "count", when, label, source, counts: { code: { label: qty } } }
 *   problems: [{ where, reason }]
 * `purchaseTabs`: [{ period, fileName, tab, rows }]; `countTabs`: [{ tab, rows }]
 * (dated 1.4 Cash Flow tabs). A row a later month's file repeats is kept once.
 */
export function planSheetInventory({ purchaseTabs = [], countTabs = [] }) {
  const accounts = new Map();
  const problems = [];
  const account = (code, game) => {
    if (!accounts.has(code)) accounts.set(code, { code, game: game || "", items: new Map() });
    const found = accounts.get(code);
    if (!found.game && game) found.game = game;
    return found;
  };
  const item = (code, price, packName = "") => {
    const label = tierLabel(price);
    const items = account(code).items;
    if (!items.has(label)) items.set(label, { label, unitUsd: Number(price.toFixed(2)), packNames: new Set() });
    if (packName) items.get(label).packNames.add(packName);
    return label;
  };

  const events = [];
  const seen = new Map();
  // Oldest file first, so a row carried into the next month's file points at the file it was typed in.
  for (const sheet of [...purchaseTabs].sort((a, b) => a.period.localeCompare(b.period))) {
    const supplier = supplierOfTab(sheet.tab);
    if (!supplier) continue;
    const { orders, problems: rowProblems } = readPurchaseList(sheet.rows);
    for (const problem of rowProblems) problems.push({ where: `${sheet.period} · ${sheet.tab} แถว ${problem.rowNo}`, reason: problem.reason });
    for (const order of orders) {
      const key = [supplier, order.date, order.code, order.lines.map((line) => `${line.price}x${line.qty}`).join("+")].join("|");
      const firstIn = seen.get(key);
      if (firstIn && firstIn.period !== sheet.period) continue; // the next month's file carried it along
      seen.set(key, { period: sheet.period });
      account(order.code, sheetGame(order.game)?.game || order.game);
      events.push({
        type: "order", when: `${order.date}T12:00:00+07:00`, code: order.code, supplier,
        ref: `account-sheet:${sheet.period}:${sheet.tab}:${order.rowNo}`.slice(0, 120),
        sheet: { period: sheet.period, fileName: sheet.fileName, tab: sheet.tab, rowNo: order.rowNo },
        lines: order.lines.map((line) => ({ label: item(order.code, line.price), qty: line.qty })),
        totalUsd: order.totalUsd, productRate: order.productRate, cnyRate: order.cnyRate, usdt: order.usdt, receiptUrl: order.receiptUrl, paid: order.paid,
      });
    }
  }

  for (const { tab, rows } of countTabs) {
    const when = stockCountDate(tab);
    if (!when.date) continue;
    const counts = {};
    for (const entry of readStockCount(rows)) {
      if (entry.group !== "pack" || !(entry.price > 0)) continue;
      const game = sheetGame(entry.name);
      if (!game) continue;
      account(game.code, game.game);
      const label = item(game.code, entry.price, entry.pack);
      counts[game.code] ||= {};
      counts[game.code][label] = (counts[game.code][label] || 0) + Math.round(entry.qty);
    }
    if (Object.keys(counts).length) {
      events.push({ type: "count", when: `${when.date}T23:59:00+07:00`, label: when.label, source: `${tab.fileName} › ${tab.tab}`,
        sheet: { period: tab.period, fileName: tab.fileName, tab: tab.tab, tabId: tab.id }, counts });
    }
  }
  events.sort((a, b) => a.when.localeCompare(b.when) || (a.type === b.type ? 0 : a.type === "order" ? -1 : 1));

  return {
    accounts: [...accounts.values()].map((entry) => ({
      code: entry.code, game: entry.game,
      items: [...entry.items.values()].sort((a, b) => a.unitUsd - b.unitUsd)
        .map((it) => ({ label: it.label, unitUsd: it.unitUsd, packName: [...it.packNames].join(" / ").slice(0, 255) })),
    })),
    events,
    problems,
  };
}

/**
 * Plays the events in order → the stock moves to store: each order a receipt
 * ("in"), each count a correction ("adjust") of the difference between the
 * count and what the moves so far left (only for the IDs and tiers it counts).
 * Returns { moves: [{ when, code, kind, note, lines: [{ label, qty }], order? }], balances }.
 */
export function sheetInventoryMoves(events) {
  const balances = {};
  const moves = [];
  const add = (code, label, qty) => {
    balances[code] ||= {};
    balances[code][label] = (balances[code][label] || 0) + qty;
  };
  for (const event of events) {
    if (event.type === "order") {
      for (const line of event.lines) add(event.code, line.label, line.qty);
      moves.push({ when: event.when, code: event.code, kind: "in", note: `ใบสั่งซื้อจากชีต ${event.supplier} · ${event.sheet.tab} แถว ${event.sheet.rowNo}`, lines: event.lines, order: event });
      continue;
    }
    for (const [code, tiers] of Object.entries(event.counts)) {
      const lines = [];
      for (const [label, counted] of Object.entries(tiers)) {
        const diff = counted - (balances[code]?.[label] || 0);
        if (diff) lines.push({ label, qty: diff });
        add(code, label, diff);
      }
      if (lines.length) moves.push({ when: event.when, code, kind: "adjust", note: `ปรับตามยอดนับในชีต ${event.label} (${event.source}) · ส่วนต่างคือที่ขายหรือใช้ไประหว่างนับ`, lines });
    }
  }
  return { moves, balances };
}
