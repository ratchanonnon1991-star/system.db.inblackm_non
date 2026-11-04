// What the accounting sheets say is in stock: the "Cash Flow" tables. 1.4 Cash Flow
// (Jan–Apr) has one tab per count, named by its date ("2542026" = 25 Apr 2026);
// 1.2 บัญชีแลกเงิน has one "Cash Flow" tab per month; "Stock to THB" (Jul–Aug) is a
// one-off count. Each table holds blocks side by side, each under its own header:
//   Stock | คงเหลือ | ยอดค้าง / ยังไม่ได้รับ | ต้นทุน | รวม ( THB )         top-up balances
//   Stock | ชื่อแพ็ค / USD / Currency | ราคา | คงเหลือ | ต้นทุน | รวม ( THB )   packs and codes
//   รายการยอดค้าง | USDT | USDT : THB | THB                              money owed
//   ยอดเงิน | ยอดคงเหลือ | เรท | THB                                    money in accounts
// Pure: the page and the tests share it. Read-only: nothing here writes Stock.

const squash = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const NUMBER = /^-?[\d,]*\.?\d+(e[-+]?\d+)?$/i;
const num = (value) => {
  const text = squash(value).replace(/,/g, "");
  return NUMBER.test(text) ? Number(text) : null;
};

const START = /^(stock( \(.*\))?|รายการยอดค้าง|ยอดเงิน)$/i;
const QTY = /^(คงเหลือ|ยอดคงเหลือ)$/;
const LABELS = {
  pack: /^(ชื่อแพ็ค|usd \/ currency)$/i,
  price: /^(ราคา|type)$/i,
  pending: /^(ยอดค้าง|ยังไม่ได้รับ)$/,
  unitCost: /^(ต้นทุน|เรท|rate|usdt : thb|discount)$/i,
  thb: /^(รวม \( ?thb ?\)|thb)$/i,
};

export const STOCK_GROUPS = {
  balance: "ยอดเงินเติม (Razer, Moniepoint, iTunes …)",
  pack: "แพ็กและโค้ดเกม",
  owed: "ยอดค้าง",
  money: "เงินในบัญชีและหน้าร้าน",
};

/** The tabs that hold a stock count. */
export function isStockTab(tab) {
  const file = squash(tab.fileName);
  return /^1\.4 cash flow/i.test(file) || (/^1\.2\b/.test(file) && /^cash flow$/i.test(squash(tab.tab))) || /^stock to thb$/i.test(file);
}

/**
 * When a count was taken: a 1.4 tab is named by its date ("2542026", "1142026",
 * "512026"), its month being the file's; other tabs only say their file's month.
 * → { date: "2026-04-25" | null, label }
 */
export function stockCountDate(tab) {
  const name = squash(tab.tab);
  const [year, month] = String(tab.period).split("-");
  if (/^1\.4/i.test(squash(tab.fileName))) {
    const m = String(Number(month));
    if (name.endsWith(`${m}${year}`)) {
      const day = Number(name.slice(0, name.length - m.length - year.length));
      if (day >= 1 && day <= 31) {
        const date = `${year}-${month}-${String(day).padStart(2, "0")}`;
        return { date, label: `นับวันที่ ${day}/${Number(month)}/${year}` };
      }
    }
  }
  return { date: null, label: `ไฟล์เดือน ${Number(month)}/${year} · ${name}` };
}

/** One header row → its blocks: [{ start, end, title, cols: { qty, pack, price, pending, unitCost, thb } }]. */
function headerBlocks(cells) {
  // "รายการยอดค้าง | USDT | USDT : THB | THB": the amount owed is the column after the title.
  const isQty = (col) => QTY.test(squash(cells[col])) || (col > 0 && /^รายการยอดค้าง$/.test(squash(cells[col - 1])) && /^[A-Z]{3,5}$/.test(squash(cells[col])));
  const qtyCols = cells.map((cell, col) => (isQty(col) ? col : -1)).filter((col) => col >= 0);
  if (!qtyCols.length) return [];
  const starts = [];
  for (const qty of qtyCols) {
    let start = -1;
    for (let col = qty - 1; col >= 0 && !qtyCols.includes(col); col -= 1) {
      if (START.test(squash(cells[col]))) { start = col; break; }
    }
    starts.push(start >= 0 ? start : Math.max(qty - 1, 0));
  }
  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] - 1 : cells.length - 1;
    const cols = { qty: qtyCols[index] };
    for (let col = start; col <= end; col += 1) {
      const label = squash(cells[col]);
      for (const [key, pattern] of Object.entries(LABELS)) if (cols[key] === undefined && pattern.test(label)) cols[key] = col;
    }
    const title = squash(cells[start]);
    const group = /รายการยอดค้าง/.test(title) ? "owed" : /^ยอดเงิน$/.test(title) ? "money" : cols.pack !== undefined || cols.price !== undefined ? "pack" : "balance";
    return { start, end, title, group, cols };
  });
}

/**
 * A stock tab's rows ([{ rowNo, cells }]) → its items: [{ group, block, name,
 * pack, price, qty, pending, unitCost, thb, rowNo }]. Totals ("ยอดรวม") and rows
 * without a count are left out; an item listed twice keeps its later row.
 */
export function readStockCount(rows) {
  let blocks = [];
  const items = [];
  for (const { rowNo, cells } of rows) {
    const found = headerBlocks(cells);
    const beside = (block) => found.every((next) => block.end < next.start || block.start > next.end);
    // A header row replaces the blocks it overlaps; blocks beside it carry on and may have data on that row.
    const reading = found.length ? blocks.filter(beside) : blocks;
    if (found.length) blocks = [...reading, ...found];
    for (const block of reading) {
      const range = cells.slice(block.start, block.end + 1).map(squash);
      if (range.includes("ยอดรวม")) continue;
      const qty = num(cells[block.cols.qty]);
      if (qty === null) continue;
      let name = "";
      for (let col = block.start; col < block.cols.qty; col += 1) {
        if (col === block.cols.pack || col === block.cols.price || col === block.cols.pending) continue;
        const text = squash(cells[col]);
        if (text && num(text) === null) { name = text; break; }
      }
      if (!name) continue;
      const read = (key) => (block.cols[key] === undefined ? null : num(cells[block.cols[key]]));
      items.push({
        group: block.group, block: block.title || STOCK_GROUPS[block.group], name,
        pack: block.cols.pack === undefined ? "" : squash(cells[block.cols.pack]),
        price: read("price"), qty, pending: read("pending"), unitCost: read("unitCost"), thb: read("thb"), rowNo,
      });
    }
  }
  // A table typed again further down (Stock to THB repeats its iOS table with new rates): the later one counts.
  const last = new Map(items.map((item) => [itemKey(item), item]));
  return items.filter((item) => last.get(itemKey(item)) === item);
}

const itemKey = (item) => `${item.group}|${item.name.toLowerCase()}|${item.pack.toLowerCase()}`;
export { itemKey as stockItemKey };

/**
 * Counts oldest first ([{ key, family, date, period, items }]) → each count's
 * items with the change since the count before of the same table (`family`;
 * null when the item was not in it), and that count's key as `previousKey`.
 */
export function withStockChanges(counts) {
  const before = new Map(); // family → the family's previous count, by item
  return counts.map((count) => {
    const family = count.family || "";
    const prev = before.get(family) || null;
    const items = count.items.map((item) => {
      const was = prev?.byItem.get(itemKey(item));
      return { ...item, change: was ? item.qty - was.qty : null };
    });
    before.set(family, { key: count.key, byItem: new Map(count.items.map((item) => [itemKey(item), item])) });
    return { ...count, previousKey: prev?.key || null, items };
  });
}

/** Sum of THB per group of one count's items. */
export function stockTotals(items) {
  const totals = {};
  for (const item of items) totals[item.group] = (totals[item.group] || 0) + (item.thb || 0);
  return totals;
}

/**
 * Stock tabs with their items ([{ tab, items }], tab as listAccountSheetTabs gives
 * it) → the counts, oldest first: [{ key, tabId, date, label, period, fileName, tab,
 * items, sameAs }]. The 1.2 "Cash Flow" tab carries the same numbers in every
 * month's file, so identical counts are kept once (the newest file), with
 * `sameAs` naming the months that repeat it. Undated counts sort at their month's end.
 */
export function groupStockCounts(tabs) {
  const signature = (items) => items.map((item) => `${itemKey(item)}=${item.qty}`).sort().join(";");
  const byItems = new Map();
  for (const { tab, items } of tabs) {
    if (!items.length) continue;
    const when = stockCountDate(tab);
    // Cash Flow (1.4 and 1.2) is one table counted again and again; each Stock to THB sheet is its own.
    const family = /^stock to thb$/i.test(squash(tab.fileName)) ? `stock-to-thb:${squash(tab.tab)}` : "cash-flow";
    const count = { key: String(tab.id), tabId: tab.id, family, date: when.date, label: when.label, period: tab.period, fileName: tab.fileName, tab: tab.tab, items, sameAs: [] };
    const sig = `${when.date ? `${when.date}|` : ""}${signature(items)}`;
    const seen = byItems.get(sig);
    if (!seen) byItems.set(sig, count);
    else if (count.period > seen.period) byItems.set(sig, { ...count, sameAs: [...seen.sameAs, seen.period] });
    else seen.sameAs.push(count.period);
  }
  // An undated table that is really a dated count copied along (1.2 › Cash Flow is the 5 Jan
  // count in every month's file): folded into that count, which notes where it was copied.
  const kept = [...byItems.values()];
  const qtyOf = (count) => new Map(count.items.map((item) => [itemKey(item), item.qty]));
  for (const copy of kept.filter((count) => !count.date)) {
    const mine = qtyOf(copy);
    const source = kept.find((count) => count.date && count.family === copy.family && (() => {
      const theirs = qtyOf(count);
      const same = [...mine].filter(([key, qty]) => theirs.get(key) === qty).length;
      return same >= 0.9 * mine.size;
    })());
    if (!source) continue;
    source.copiedIn = [...(source.copiedIn || []), `${copy.fileName} › ${copy.tab}`, ...copy.sameAs.map((period) => `${copy.tab} (${period})`)];
    kept.splice(kept.indexOf(copy), 1);
  }
  const sortKey = (count) => count.date || `${count.period}-31`;
  return kept.map((count) => ({
    ...count,
    label: count.sameAs.length ? `${count.fileName} › ${count.tab} (ตัวเลขชุดเดียวกันในไฟล์ ${count.sameAs.length + 1} เดือน)` : count.label,
  })).sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.tabId - b.tabId);
}
