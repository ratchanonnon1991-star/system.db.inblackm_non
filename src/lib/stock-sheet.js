// Reading the "ตรวจสอบยอดคงเหลือ" tab of the 2.1 STOCK_ sheet, the one place
// that sums every stock account. It holds several blocks side by side, each
// under a "ยอดคงเหลือ <account>" title and a header row:
//   ไอดี | PACK | USD | สถานะ | ผู้ใช้งาน | ปัจจุบัน | ใช้ไป | คงเหลือ
// One row per pack. ปัจจุบัน is everything received, ใช้ไป everything used.
// Blocks titled "ยอดคงเหลือรวม …" add accounts up and are skipped, as are the
// one-cell "คงเหลือ" totals under a block.
import { normalizeStockCode } from "@/lib/stock";

export const STOCK_SHEET_ID = "1D8l1ojIKQLzkq6jC2NhwMb84AnGE9XLO3qK8V8OFyd0";
export const STOCK_SHEET_BALANCE_TAB = "ตรวจสอบยอดคงเหลือ";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// "1,355" → 1355; "#REF!", "" or text → null.
function count(value) {
  const text = clean(value).replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

function titleAbove(rows, rowIndex, col) {
  for (let r = rowIndex - 1; r >= Math.max(0, rowIndex - 3); r -= 1) {
    for (let c = col; c < col + 8; c += 1) {
      const text = clean(rows[r]?.[c]);
      if (text.startsWith("ยอดคงเหลือ")) return text;
    }
  }
  return "";
}

/**
 * The tab's rows (cells as displayed) → { accounts: [{ code, packs: [{ label,
 * usd, status, received, used, left, problem }] }] }. `problem` marks a pack
 * that must be counted again before use: "unreadable" when its figures are
 * not numbers (a "#REF!"), "negative" when more was used than received.
 */
export function parseStockSheetBalances(rows) {
  const blocks = new Map(); // column → { skip }
  const accounts = new Map();
  (rows || []).forEach((row, rowIndex) => {
    const cells = (row || []).map(clean);
    for (let col = 0; col < cells.length; col += 1) {
      if (cells[col] === "ไอดี" && cells[col + 1]?.toUpperCase() === "PACK") {
        blocks.set(col, { skip: titleAbove(rows, rowIndex, col).includes("รวม") });
      }
    }
    for (const [col, block] of blocks) {
      const id = cells[col];
      const label = cells[col + 1];
      if (block.skip || !id || id === "ไอดี" || !label) continue;
      const code = normalizeStockCode(id);
      if (!code) continue;
      const received = count(cells[col + 5]);
      const used = count(cells[col + 6]);
      const left = count(cells[col + 7]);
      if (!accounts.has(code)) accounts.set(code, { code, packs: [] });
      const account = accounts.get(code);
      if (account.packs.some((pack) => pack.label === label)) continue;
      account.packs.push({
        label,
        usd: count(cells[col + 2]),
        status: cells[col + 3],
        received,
        used,
        left,
        problem: received == null || used == null || left == null ? "unreadable" : left < 0 ? "negative" : "",
      });
    }
  });
  return { accounts: [...accounts.values()] };
}

/**
 * The moves that bring one parsed pack to the sheet's figures: everything
 * received in, everything used out, and a correction when คงเหลือ is not
 * ปัจจุบัน − ใช้ไป. A pack with a problem gets none.
 */
export function stockSheetOpeningMoves(pack) {
  if (pack.problem) return { in: 0, out: 0, adjust: 0 };
  const inQty = Math.max(0, Math.round(pack.received));
  const outQty = Math.max(0, Math.round(pack.used));
  return { in: inQty, out: outQty, adjust: Math.round(pack.left) - (inQty - outQty) };
}
