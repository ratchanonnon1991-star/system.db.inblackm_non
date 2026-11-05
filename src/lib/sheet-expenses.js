// 1.3 บัญชีใช้จ่ายทั่วไป: the company's everyday spending, one tab per bank account
// (KBANK Paek, กรุงศรี Ptos, Spenda Umar, KKP-PAek …). Each row already says what it
// was for: "ประเภทสินค้า ใช้จ่ายบริษัท" (ค่าใช้จ่ายบริษัท, เงินสดเข้าบัญชี …) and the
// "รายการแยกย่อย" beside it; a purchase uses "ประเภทสินค้า สั่งซื้อ" instead.
// This reads those rows and adds them up per month and category. Read-only.
// Pure: the page and the tests share it.
import { excelDate } from "@/lib/account-sheets";

const squash = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const amount = (value) => {
  const text = squash(value).replace(/,/g, "");
  if (!text) return 0;
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const round = (n) => Math.round(n * 100) / 100;

export const UNCATEGORIZED = "ไม่ระบุหมวด";
const OPENING = /^ยกยอด/;

/** A 1.3 file? */
export const isExpenseFile = (fileName) => /^1\.3\b/.test(squash(fileName));

function readDate(value) {
  const text = squash(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return excelDate(text);
}

/**
 * One tab's rows ([{ rowNo, cells }]) → its money rows:
 * [{ tab, rowNo, date, time, in, out, balance, category, detail, seller, buyer, status, note }].
 * Headers repeat down the tab; every header row resets the columns. Opening-balance
 * rows ("ยกยอดมา") and rows with no money in or out are left out.
 */
export function readExpenseTab(tab, rows = []) {
  const out = [];
  let col = null;
  for (const { rowNo, cells = [] } of rows) {
    const labels = cells.map(squash);
    if (labels.includes("ยอดเงินออก") && labels.includes("วันที่ทำรายการ")) {
      const at = (label, from = 0) => labels.indexOf(label, from);
      const company = at("ประเภทสินค้า ใช้จ่ายบริษัท");
      const purchase = at("ประเภทสินค้า สั่งซื้อ");
      col = {
        date: at("วันที่ทำรายการ"), time: at("เวลา"), in: at("ยอดเงินเข้า"), out: at("ยอดเงินออก"), balance: at("ยอดเงินคงเหลือ"),
        company, companyDetail: company >= 0 ? at("รายการแยกย่อย", company) : -1,
        purchase, purchaseDetail: purchase >= 0 ? at("รายการแยกย่อย", purchase) : -1,
        seller: at("ผู้ขาย"), buyer: at("ผู้ซื้อ"), status: at("สถานะ"), note: at("หมายเหตุ1"),
      };
      continue;
    }
    if (!col) continue;
    const get = (index) => (index >= 0 ? squash(cells[index]) : "");
    const date = readDate(get(col.date));
    if (!date) continue;
    const moneyIn = amount(get(col.in));
    const moneyOut = amount(get(col.out));
    if (!moneyIn && !moneyOut) continue;
    const companyCategory = get(col.company);
    const purchaseCategory = get(col.purchase);
    const detail = get(col.companyDetail) || get(col.purchaseDetail);
    if (OPENING.test(detail)) continue;
    const category = companyCategory || (purchaseCategory ? `สั่งซื้อ · ${purchaseCategory}` : UNCATEGORIZED);
    out.push({
      tab, rowNo, date, time: get(col.time), in: moneyIn, out: moneyOut, balance: amount(get(col.balance)),
      category, detail: companyCategory ? get(col.companyDetail) : get(col.purchaseDetail) || detail,
      seller: get(col.seller), buyer: get(col.buyer), status: get(col.status), note: get(col.note),
    });
  }
  return out;
}

/**
 * The same row shows up in several months' files (a frozen tab is copied whole into every
 * month; a file runs a day into the next month). tabs: [{ tabId, tab, period, entries }],
 * any order → one copy of each row, the newest file's, sorted by date then time.
 */
export function mergeExpenseTabs(tabs = []) {
  const seen = new Map();
  const ordered = [...tabs].sort((a, b) => String(b.period).localeCompare(String(a.period)));
  for (const { tabId, tab, period, entries } of ordered) {
    for (const entry of entries) {
      const key = [tab.trim().toLowerCase(), entry.date, entry.time, entry.in, entry.out, entry.balance, entry.detail].join("|");
      if (!seen.has(key)) seen.set(key, { ...entry, tabId, period });
    }
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time), "en", { numeric: true }) || a.rowNo - b.rowNo);
}

/**
 * entries → { months: ["2026-10", …] newest first, byMonth: { month: { in, out, count,
 * categories: [{ name, in, out, count, details: [{ name, out, in, count }] }] } } }.
 * Categories and details are sorted by money out, largest first.
 */
export function summarizeExpenses(entries = []) {
  const byMonth = {};
  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const m = (byMonth[month] ||= { in: 0, out: 0, count: 0, categories: new Map() });
    // "ค่าใช้จ่ายบริษัท" and "ค่าใช้จ่าย บริษัท" are one category; the first spelling seen names it.
    const categoryKey = entry.category.replace(/\s+/g, "").toLowerCase();
    m.in += entry.in;
    m.out += entry.out;
    m.count += 1;
    if (!m.categories.has(categoryKey)) m.categories.set(categoryKey, { name: entry.category, in: 0, out: 0, count: 0, details: new Map() });
    const c = m.categories.get(categoryKey);
    c.in += entry.in;
    c.out += entry.out;
    c.count += 1;
    const detailName = entry.detail || "—";
    if (!c.details.has(detailName)) c.details.set(detailName, { name: detailName, in: 0, out: 0, count: 0 });
    const d = c.details.get(detailName);
    d.in += entry.in;
    d.out += entry.out;
    d.count += 1;
  }
  const bigFirst = (a, b) => b.out - a.out || b.in - a.in || a.name.localeCompare(b.name);
  const result = {};
  for (const [month, m] of Object.entries(byMonth)) {
    result[month] = {
      in: round(m.in), out: round(m.out), count: m.count,
      categories: [...m.categories.values()].map((c) => ({
        name: c.name, in: round(c.in), out: round(c.out), count: c.count,
        details: [...c.details.values()].map((d) => ({ ...d, in: round(d.in), out: round(d.out) })).sort(bigFirst),
      })).sort(bigFirst),
    };
  }
  return { months: Object.keys(result).sort().reverse(), byMonth: result };
}
