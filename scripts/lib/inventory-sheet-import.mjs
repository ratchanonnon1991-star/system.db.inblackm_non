// Pure: the Center / NP / SLY account workbooks -> inventory ledger rows. One tab = one
// registered account (key from the channel registry). Only columns named below are read:
// the header rows of these sheets also hold account logins, cards and wallet addresses.
import { excelDay, rowRequestId } from "./razer-sheet-import.mjs";

// Order logs, stock lots and bank statements are not account ledgers.
export const SKIPPED_WORKBOOK = /STOCK|GAME CARD|Roblox|BANK STATEMENT|Order|Preorder|Market Place/i;
const FIRST_DAY = "2024-01-01";

const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const colIndex = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const money = (value) => {
  const n = Number(String(value ?? "").replaceAll(",", ""));
  // shortcut: rounded to 2 places like the Razer import; upgrade if a currency needs more.
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
};
/** Workbook file name -> registry category, trimmed exactly as the registry import trims it (inner spaces kept). */
export const workbookCategory = (file) => String(file).split(/[\\/]/).pop().replace(/\.xlsx$/i, "").trim().replace(/[_\s]+$/, "");
export const isBotOperator = (name) => /\bbot\b/i.test(name);

/** An Excel day number, or text typed day first: "1/11/2026", "01/11/26", "1/11/2569" (Buddhist year). */
export function sheetDay(value) {
  const serial = excelDay(value);
  if (serial) return serial;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year = year >= 50 ? 2500 + year : 2000 + year; // "69" is 2569
  if (year > 2400) year -= 543;
  const day = Number(m[1]), month = Number(m[2]), at = new Date(Date.UTC(year, month - 1, day));
  return at.getUTCMonth() === month - 1 && at.getUTCDate() === day ? at.toISOString().slice(0, 10) : null;
}

/** Money columns of one header: kind by name, or null when the layout is not one we know. */
function moneyColumns(header) {
  const kinds = {};
  for (const [col, text] of header) {
    if (/ตรวจ|คงเหลือ/.test(text)) continue;
    const kind = /เข้า/.test(text) ? (/อื่น/.test(text) ? "adjust_in" : "deposit") : /ออก/.test(text) ? (/อื่น/.test(text) ? "adjust_out" : "use") : null;
    if (!kind) continue;
    if (kinds[kind]) return null; // two columns of one kind (several packs or wallets in one tab)
    kinds[kind] = col;
  }
  return kinds.deposit || kinds.use ? kinds : null;
}

/**
 * @param sheets  readXlsxSheetsWithImages(buffer, { numbers: true }).sheets
 * @returns {{ tabs: Map<string, {category, tab, rows}>, skipped: {where, reason}[] }} rows in sheet order
 */
export function parseAccountWorkbook(sheets, file, today) {
  const category = workbookCategory(file), tabs = new Map(), skipped = [];
  for (const sheet of sheets) {
    const tab = String(sheet.title).trim(), where = `${category} / ${tab}`;
    const byRow = new Map();
    for (const c of sheet.cells) {
      if (!byRow.has(c.row)) byRow.set(c.row, new Map());
      byRow.get(c.row).set(colIndex(c.col), clean(c.text));
    }
    const order = [...byRow.keys()].sort((a, b) => a - b);
    const headerRow = order.slice(0, 8).find((r) => [...byRow.get(r).values()].some((t) => t === "ลำดับคิว" || t === "ลำดับที่"));
    if (!headerRow) continue; // summary, settings and report tabs
    const header = [...byRow.get(headerRow)].sort((a, b) => a[0] - b[0]);
    const find = (...names) => header.find(([, t]) => names.includes(t))?.[0];
    const starts = (prefix) => header.find(([, t]) => t.startsWith(prefix))?.[0];
    const kinds = moneyColumns(header);
    if (!kinds) { skipped.push({ where, reason: "รูปแบบอื่น (หลายคอลัมน์เข้า/ออก)" }); continue; }
    const col = {
      queue: find("ลำดับคิว", "ลำดับที่"), sale: find("ยอดโอน"), cost: starts("ต้นทุน"), invoice: find("transaction"),
      operator: find("ผู้เติม") ?? starts("ผู้ทำรายการ"), game: find("เกม", "เกมที่เติม"), item: find("สิ่งที่ชื้อ", "แพ๊คที่เติม", "PACK"),
      balance: header.find(([, t]) => /คงเหลือ/.test(t) && !/ตรวจ/.test(t))?.[0],
    };
    // The tab's own running balance after its last dated row (bot rows too): becomes a ledger snapshot.
    let lastBalance = null;
    // 1.4 LAK leaves the date header blank; every tab keeps the date just left of the queue.
    col.date = find("วันที่", "วันที่สั่งซื้อ") ?? col.queue - 1;
    const dataRows = order.filter((n) => n > headerRow);
    // A staff column holds a few nicknames. Hundreds of names (CONSOLE) means customers were
    // typed there; those never go into the ledger.
    const staffColumn = new Set(dataRows.map((r) => byRow.get(r).get(col.operator)).filter(Boolean)).size <= 60;
    const rows = [];
    let lastDay = null;
    for (const r of dataRows) {
      const cells = byRow.get(r), get = (c) => (c == null ? "" : cells.get(c) ?? "");
      let amounts = Object.entries(kinds).map(([kind, c]) => [kind, money(get(c))]).filter(([, a]) => a);
      if (!amounts.length) continue;
      const rawDay = get(col.date), day = sheetDay(rawDay) ?? (rawDay ? null : lastDay);
      if (!day || day < FIRST_DAY || day > today) { skipped.push({ where: `${where} แถว ${r}`, reason: rawDay ? `วันที่ผิด (${rawDay})` : "ไม่มีวันที่" }); continue; }
      lastDay = day;
      const balance = Number(get(col.balance).replaceAll(",", ""));
      if (get(col.balance) !== "" && Number.isFinite(balance) && balance >= 0) lastBalance = { day, balance: balance.toFixed(2) };
      const operator = staffColumn ? get(col.operator) : "";
      // Bot spending is read from the bot database; money put in is not, so it stays.
      if (isBotOperator(get(col.operator))) {
        amounts = amounts.filter(([kind]) => kind === "deposit" || kind === "adjust_in");
        if (!amounts.length) { skipped.push({ where: `${where} แถว ${r}`, reason: "บอท" }); continue; }
      }
      const detail = [operator && `ผู้เติม ${operator}`, [get(col.game), get(col.item)].filter(Boolean).join(" ")].filter(Boolean);
      for (const [kind, amount] of amounts) rows.push({
        kind, amount, day, queue: get(col.queue), invoice: get(col.invoice).slice(0, 200) || null, operator, blankOperator: !operator,
        sale: kind === "use" ? money(get(col.sale)) : null, cost: kind === "use" ? money(get(col.cost)) : null,
        // No row number (rows move when the sheet is cleaned) and spaces collapsed (tabs get renamed).
        note: [`ชีต ${clean(where)}`, ...detail].join(" · ").slice(0, 500),
      });
    }
    tabs.set(`${category} :: ${tab}`, { category, tab, rows, lastBalance });
  }
  return { tabs, skipped };
}

const contentKey = (r) => [r.kind, r.day, r.amount, r.queue, r.invoice ?? ""].join("|");

/**
 * The same tab read from several snapshots (the backup before the monthly clean and the
 * current file): each distinct row is kept as often as the snapshot that has it most often.
 */
export function mergeSnapshots(snapshots) {
  const best = new Map();
  for (const rows of snapshots) {
    const counts = new Map();
    for (const r of rows) { const k = contentKey(r); counts.set(k, [...(counts.get(k) ?? []), r]); }
    for (const [k, list] of counts) if ((best.get(k)?.length ?? 0) < list.length) best.set(k, list);
  }
  return [...best.values()].flat().sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Uses a person already recorded on the debit page for the same account and order are left
 * out, so a fill typed in both places is counted once. `debited`: Set of "accountId|orderRef".
 */
export function dropDebited(bodies, debited) {
  const kept = bodies.filter((b) => b.kind !== "use" || b.orderRef === "ไม่มีคิว" || !debited.has(`${b.accountId}|${b.orderRef}`));
  return { kept, dropped: bodies.length - kept.length };
}

/** The latest of a tab's balances across snapshots (the later file wins a tie). */
export const latestBalance = (list) => list.filter(Boolean).reduce((best, b) => (!best || b.day >= best.day ? b : best), null);

/** Ledger entry bodies for one registered account; ids come from content, not row position. */
export function ledgerEntries(accountKey, rows) {
  const seen = new Map();
  return rows.map((r) => {
    const k = contentKey(r), n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return {
      requestId: rowRequestId("inventory-sheet", accountKey, k, n), kind: r.kind, amount: r.amount, note: r.note,
      // shortcut: the sheets have the day only; 00:00 Bangkok, like the Razer import. Upgrade if times are added.
      occurredAt: `${r.day}T00:00:00+07:00`, invoice: r.invoice,
      ...(r.kind === "use" ? { orderRef: r.queue || "ไม่มีคิว", thbAmount: r.cost, saleThb: r.sale } : {}),
    };
  });
}
