// 1.4 Multi Game Card: the MOL Multi Game Cards bought on OffGamer, one tab per
// OffGamer account ("Offgamer Ptos", "Offgamer Beer" …) plus "Offgamer List" (the
// accounts, their owner, rank and notices). An order is a block of rows: one with
// "USDT ที่ได้รับ" (the USDT put in for it), then one row per card with "USDT ที่ออก",
// its Serial and Expiry. The PIN column is dropped on import (src/lib/account-sheets.js)
// and never reaches here: this keeps what was bought, not the codes.
// Pure: the page and the tests share it.
import { excelDate } from "@/lib/account-sheets";

const squash = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const money = (value) => {
  const text = squash(value).replace(/,/g, "");
  if (!text) return 0;
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : 0;
};
const round = (n, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

/** "Offgamer Ptos" → "Ptos"; null for the list tab or a tab that is not an account. */
export function offgamerAccount(tab) {
  const match = /^offgamer\s+(.+)$/i.exec(squash(tab));
  if (!match || /^list$/i.test(match[1])) return null;
  return match[1];
}
export const isOffgamerFile = (fileName) => /^1\.4\s+multi\s*game\s*card/i.test(squash(fileName));

/** The sheet's order number, typed as a number ("4.6054901E7") → "46054901". */
export function orderNumber(value) {
  const text = squash(value);
  if (!text) return "";
  const n = Number(text);
  return Number.isFinite(n) && /e|\./i.test(text) ? String(Math.round(n)) : text;
}

function readDate(value) {
  const text = squash(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return excelDate(text);
}

const ORDER_TEXT = /ORDER\s*#\s*(\d{5,})/i;

/**
 * One account tab's rows → [{ account, order, key, date, buyer, received, rowNo, cards:
 * [{ serial, usdt, expiry, checked, rowNo }] }] in sheet order.
 * Two layouts: older blocks carry the order number on every row (ORDER column); newer ones
 * leave ORDER blank, start each order with its "USDT ที่ได้รับ" row (that row may say
 * "ORDER # 47418137 (01 Oct 2026)") and list its cards under it. `order` is "" when the
 * sheet never names it; `key` tells orders apart either way.
 */
export function readOffgamerTab(tab, rows = []) {
  const account = offgamerAccount(tab);
  if (!account) return [];
  const orders = [];
  const byNumber = new Map();
  let col = null;
  let current = null;
  const open = (order, date, buyer, rowNo) => {
    if (order && byNumber.has(order)) return byNumber.get(order);
    const entry = { account, order, key: order || `${date}#${rowNo}`, date, buyer, received: 0, rowNo, cards: [] };
    orders.push(entry);
    if (order) byNumber.set(order, entry);
    return entry;
  };
  for (const { rowNo, cells = [] } of rows) {
    const labels = cells.map(squash);
    if (/^date$/i.test(labels[0] || "") && labels.some((label) => /^order$/i.test(label))) {
      const at = (re) => labels.findIndex((label) => re.test(label));
      col = { date: 0, order: at(/^order$/i), in: at(/^USDT ที่ได้รับ$/), out: at(/^USDT ที่ออก$/), buyer: at(/^ผู้สั่งซื้อ$/), serial: at(/^serial$/i), check: at(/^check$/i), expiry: at(/^expiry$/i) };
      current = null;
      continue;
    }
    if (!col) continue;
    const get = (index) => (index >= 0 ? squash(cells[index]) : "");
    const date = readDate(get(col.date));
    if (!date) continue;
    const received = money(get(col.in));
    const usdt = money(get(col.out));
    const serial = get(col.serial);
    const named = orderNumber(get(col.order)) || (labels.join(" ").match(ORDER_TEXT)?.[1] ?? "");
    const buyer = get(col.buyer);
    if (received) {
      if (!(current && named && current.order === named)) current = open(named, date, buyer, rowNo);
      current.received = round(current.received + received, 4);
      continue;
    }
    if (!usdt && !serial) continue;
    if (named && current?.order !== named) current = open(named, date, buyer, rowNo);
    else if (!current) current = open("", date, buyer, rowNo);
    if (!current.buyer) current.buyer = buyer;
    current.cards.push({ serial, usdt, expiry: readDate(get(col.expiry)), checked: /✅|✓|ok|true/i.test(get(col.check)), rowNo });
  }
  return orders;
}

/**
 * Tabs ([{ tabId, tab, period, rows }]) from several months' files → every order once.
 * The same order can sit in more than one month's file: the newest file's copy wins.
 */
export function mergeOffgamerTabs(tabs = []) {
  const seen = new Map();
  const ordered = [...tabs].sort((a, b) => String(b.period).localeCompare(String(a.period)));
  for (const { tabId, tab, period, rows } of ordered) {
    for (const order of readOffgamerTab(tab, rows)) {
      // An unnamed order is the same one in two files when its date, top-up and first card match.
      const key = order.order ? `${order.account.toLowerCase()}|${order.order}` : `${order.account.toLowerCase()}|${order.date}|${order.received}|${order.cards[0]?.serial || ""}`;
      if (!seen.has(key)) seen.set(key, { ...order, tabId, period, spent: round(order.cards.reduce((sum, card) => sum + card.usdt, 0), 4) });
    }
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date) || b.order.localeCompare(a.order));
}

/**
 * orders → { accounts: [{ account, orders, cards, received, spent, lastDate }], months:
 * [{ month, orders, cards, spent }] newest first, totals: { orders, cards, received, spent } }.
 */
export function summarizeOffgamer(orders = []) {
  const accounts = new Map();
  const months = new Map();
  const totals = { orders: 0, cards: 0, received: 0, spent: 0 };
  for (const order of orders) {
    const a = accounts.get(order.account) || { account: order.account, orders: 0, cards: 0, received: 0, spent: 0, lastDate: null };
    a.orders += 1;
    a.cards += order.cards.length;
    a.received += order.received;
    a.spent += order.spent;
    if (!a.lastDate || order.date > a.lastDate) a.lastDate = order.date;
    accounts.set(order.account, a);
    const month = order.date.slice(0, 7);
    const m = months.get(month) || { month, orders: 0, cards: 0, spent: 0 };
    m.orders += 1;
    m.cards += order.cards.length;
    m.spent += order.spent;
    months.set(month, m);
    totals.orders += 1;
    totals.cards += order.cards.length;
    totals.received += order.received;
    totals.spent += order.spent;
  }
  const tidy = (row) => ({ ...row, received: row.received === undefined ? undefined : round(row.received), spent: round(row.spent) });
  return {
    accounts: [...accounts.values()].map(tidy).sort((a, b) => b.spent - a.spent || a.account.localeCompare(b.account)),
    months: [...months.values()].map(({ month, orders: count, cards, spent }) => ({ month, orders: count, cards, spent: round(spent) })).sort((a, b) => b.month.localeCompare(a.month)),
    totals: { ...totals, received: round(totals.received), spent: round(totals.spent) },
  };
}

/**
 * "Offgamer List" rows → [{ no, email, owner, rank, notice }]: the accounts as the sheet
 * lists them (the password column is dropped on import).
 */
export function readOffgamerList(rows = []) {
  const list = [];
  let col = null;
  for (const { cells = [] } of rows) {
    const labels = cells.map(squash);
    if (labels.includes("เมล") && labels.some((label) => /^เจ้าของ/.test(label))) {
      col = { no: labels.indexOf("ลำดับ"), email: labels.indexOf("เมล"), owner: labels.findIndex((label) => /^เจ้าของ/.test(label)), rank: labels.indexOf("แรงค์"), notice: labels.indexOf("NOTICE") };
      continue;
    }
    if (!col) continue;
    const get = (index) => (index >= 0 ? squash(cells[index]) : "");
    const email = get(col.email);
    if (!/@/.test(email)) continue;
    const notice = [get(col.notice), get(col.notice + 1)].filter((text) => text && !/^\d+(\.\d+)?$/.test(text)).join(" · ");
    list.push({ no: orderNumber(get(col.no)), email, owner: get(col.owner), rank: get(col.rank), notice });
  }
  return list;
}
