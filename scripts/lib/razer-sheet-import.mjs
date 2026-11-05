// Pure: the Razer Gold workbooks ("RAZER CAD 1 - 100.xlsx", "RAZER อื่นๆ.xlsx" ...)
// -> inventory ledger accounts and deposit / use rows. One ledger tab per sheet:
// header on row 1, one row per top-up ("USD เข้า") or fill ("USD ออก").
// Password columns are never read. Customer names and links are left out.
import { createHash } from "node:crypto";

export const RAZER_SHEET_ZONES = ["CAD", "SGD", "MYR", "VND", "AUD", "BRL", "MXN", "THB", "PHP", "TRY"];
// Columns by exact header (spaces collapsed). "วันที่ ตรวจสอบงาน" is a review date, not this one.
const COLUMNS = {
  date: ["วันที่"], queue: ["ลำดับคิว"], sale: ["ยอดโอน"], cost: ["ต้นทุน"],
  in: ["USD เข้า"], out: ["USD ออก"], operator: ["ผู้เติม"], game: ["เกม", "เกมที่เติม"],
  item: ["สิ่งที่ชื้อ"], note: ["หมายเหตุ"], email: ["RazerID"],
};
const FIRST_DAY = "2025-01-01";

const colIndex = letters => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const clean = text => String(text ?? "").replace(/\s+/g, " ").trim();

export function sheetZone(title) {
  const upper = String(title).toUpperCase();
  return RAZER_SHEET_ZONES.find(z => new RegExp(`\\b${z}\\b`).test(upper)) ?? "OTHER";
}

/** Excel day serial (1900 system) -> "YYYY-MM-DD", or null. */
export function excelDay(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 2958465) return null; // past 9999-12-31 it is not a date (a phone number, an ID)
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);
}

// shortcut: the sheet's formula floats are rounded to 2 places (Gold and THB have 2); upgrade if a zone needs more.
const money = value => {
  const n = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
};

/** A stable UUID (version 8) per sheet row, so a re-run replays instead of duplicating. */
export function rowRequestId(...parts) {
  const h = createHash("sha256").update(parts.join("|")).digest("hex").split("");
  h[12] = "8";
  h[16] = ((parseInt(h[16], 16) & 3) | 8).toString(16);
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/**
 * @param {{title:string, cells:{row:number,col:string,text:string}[]}[]} sheets  from readXlsxSheetsWithImages(..., { numbers: true })
 * @param {string} file  workbook name without folder, part of each row's id
 * @param {string} today "YYYY-MM-DD"; later dates are refused
 */
export function parseRazerWorkbook(sheets, file, today) {
  const rows = [], skipped = [];
  for (const sheet of sheets) {
    const byRow = new Map();
    for (const c of sheet.cells) {
      if (!byRow.has(c.row)) byRow.set(c.row, new Map());
      byRow.get(c.row).set(colIndex(c.col), c.text);
    }
    const header = byRow.get(1);
    if (!header) continue;
    const col = {};
    for (const [key, names] of Object.entries(COLUMNS)) {
      col[key] = [...header].sort((a, b) => a[0] - b[0]).find(([, t]) => names.includes(clean(t)))?.[0];
    }
    if (!col.queue || !col.in || !col.out) continue; // the balance summary tabs
    // "Razer Other" left its date header blank; every tab keeps the date just left of the queue.
    col.date ??= col.queue - 1;
    const secret = new Set([...header].filter(([, t]) => /password/i.test(t)).map(([c]) => c));
    const zone = sheetZone(sheet.title);
    let lastDay = null;
    for (const r of [...byRow.keys()].filter(r => r > 1).sort((a, b) => a - b)) {
      const cells = byRow.get(r), get = key => clean(cells.get(col[key]));
      const deposit = money(get("in")), use = money(get("out"));
      if (!deposit && !use) continue;
      const where = `${file} / ${sheet.title} แถว ${r}`;
      // A blank date continues the day above it, as the sheet is typed top to bottom.
      const day = excelDay(get("date")) ?? (get("date") ? null : lastDay);
      if (!day || day < FIRST_DAY || day > today) {
        skipped.push({ where, reason: get("date") ? `วันที่ผิด (${get("date")})` : "ไม่มีวันที่" });
        continue;
      }
      lastDay = day;
      const email = get("email").toLowerCase();
      if (!email.includes("@")) { skipped.push({ where, reason: "ไม่มี RazerID" }); continue; }
      // Razer transaction numbers ("032K9WH591K840226430E") sit under different headers per tab.
      const txns = [...cells].filter(([c]) => !secret.has(c)).map(([, t]) => t).join(" ").toUpperCase().match(/\b03[0-9A-Z]{17,22}\b/g);
      const detail = [get("operator") && `ผู้เติม ${get("operator")}`, [get("game"), get("item")].filter(Boolean).join(" ")].filter(Boolean);
      const base = {
        file, sheet: sheet.title, row: r, email, zone,
        // shortcut: the sheet has the day only; 00:00 Bangkok keeps sheet order by insertion, upgrade if times are added.
        occurredAt: `${day}T00:00:00+07:00`,
        invoice: (txns ? [...new Set(txns)].join(" / ") : get("note")).slice(0, 200) || null,
        note: [`ชีต ${where}`, ...detail].join(" · ").slice(0, 500),
      };
      if (deposit) rows.push({ ...base, kind: "deposit", amount: deposit, requestId: rowRequestId("razer-sheet", file, sheet.title, r, "deposit") });
      if (use) rows.push({
        ...base, kind: "use", amount: use, orderRef: get("queue") || `ชีต ${sheet.title} แถว ${r}`,
        thbAmount: money(get("cost")), saleThb: money(get("sale")),
        requestId: rowRequestId("razer-sheet", file, sheet.title, r, "use"),
      });
    }
  }
  return { rows, skipped };
}

/**
 * The same row copied into two tabs (e.g. "RAZER SGD 76 - 100" in two workbooks) is
 * kept once: same wallet, kind, day, amount, order and invoice from another tab.
 */
export function dropCopies(rows) {
  const firstTab = new Map(), kept = [], copies = [];
  for (const row of rows) {
    const key = [row.zone, row.email, row.kind, row.occurredAt, row.amount, row.orderRef ?? "", row.invoice ?? ""].join("|");
    const tab = `${row.file} / ${row.sheet}`;
    if (!firstTab.has(key)) firstTab.set(key, tab);
    if (firstTab.get(key) !== tab) copies.push({ where: `${tab} แถว ${row.row}`, reason: `ซ้ำกับ ${firstTab.get(key)}` });
    else kept.push(row);
  }
  return { kept, copies };
}

/** Ledger accounts for the wallets the rows name, one per e-mail + zone. */
export function walletAccounts(rows) {
  const accounts = new Map();
  for (const r of rows) {
    const ref = `${r.zone}:${r.email}`;
    if (!accounts.has(ref)) accounts.set(ref, { provider: "razer", ref, label: r.email, currency: r.zone, category: r.file.replace(/\.xlsx$/i, "") });
  }
  return [...accounts.values()];
}
