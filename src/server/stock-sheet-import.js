import { openGameinfoSheetReader, withSheetAccess } from "@/server/gameinfo-sheet-import";
import { parseStockSheetBalances, STOCK_SHEET_BALANCE_TAB, STOCK_SHEET_ID, stockSheetOpeningMoves } from "@/lib/stock-sheet";
import { addStockItem, createStockAccount, getStockAccount, recordStockMove } from "@/server/stock-repository";

const PROBLEM_TEXT = { unreadable: "ตัวเลขในชีตอ่านไม่ได้", negative: "ชีตติดลบ" };

function problemNote(packs) {
  const list = packs.map((pack) => `${pack.label} (${PROBLEM_TEXT[pack.problem]}${pack.problem === "negative" ? ` ${pack.left}` : ""})`);
  return `ย้ายจากชีต: นับใหม่ก่อนใช้ — ${list.join(", ")}`.slice(0, 1000);
}

/**
 * Brings the 2.1 STOCK_ sheet's balances in as each account's opening moves.
 * An account already in the system is left alone, so a second run adds only
 * what is new. A pack the sheet cannot vouch for (#REF!, below zero) comes
 * in at 0 and its account is marked "ต้องตรวจ".
 */
export async function importStockSheet({ apply = false, actor = null, log = () => {}, reader = null, rows = null } = {}) {
  const sheetRows = rows || await withSheetAccess(() => (reader || openGameinfoSheetReader()).rows(STOCK_SHEET_ID, STOCK_SHEET_BALANCE_TAB));
  const { accounts } = parseStockSheetBalances(sheetRows);
  const summary = { accounts: 0, packs: 0, skipped: 0, problems: 0 };
  for (const account of accounts) {
    if (await getStockAccount(account.code)) {
      summary.skipped += 1;
      log(`ข้าม ${account.code}: มีในระบบแล้ว`);
      continue;
    }
    const problems = account.packs.filter((pack) => pack.problem);
    const left = account.packs.reduce((sum, pack) => sum + (pack.problem ? 0 : pack.left), 0);
    summary.accounts += 1;
    summary.packs += account.packs.length;
    summary.problems += problems.length;
    log(`${account.code}: ${account.packs.length} แพ็ค คงเหลือ ${left}${problems.length ? ` · ต้องตรวจ ${problems.map((pack) => pack.label).join(", ")}` : ""}`);
    if (!apply) continue;

    const created = await createStockAccount({
      code: account.code,
      status: problems.length ? "check" : "active",
      note: problems.length ? problemNote(problems) : "ย้ายจากชีต 2.1 STOCK_",
    });
    const moves = { in: [], up: [], out: [], down: [] };
    for (const pack of account.packs) {
      const itemId = await addStockItem(created.id, { label: pack.label, unitUsd: pack.usd ?? "" });
      const opening = stockSheetOpeningMoves(pack);
      if (opening.in) moves.in.push({ itemId, qty: opening.in });
      if (opening.adjust > 0) moves.up.push({ itemId, qty: opening.adjust });
      if (opening.out) moves.out.push({ itemId, qty: opening.out });
      if (opening.adjust < 0) moves.down.push({ itemId, qty: opening.adjust });
    }
    // In before out, so no pack goes below zero on the way to its balance.
    const base = { accountId: created.id };
    if (moves.in.length) await recordStockMove({ ...base, kind: "in", note: "ยอดรับเข้ารวมจากชีต (ปัจจุบัน)", lines: moves.in }, actor);
    if (moves.up.length) await recordStockMove({ ...base, kind: "adjust", note: "ปรับให้ตรงคงเหลือในชีต", lines: moves.up }, actor);
    if (moves.out.length) await recordStockMove({ ...base, kind: "out", queue: `ยกมาจากชีต-${account.code}`, note: "ยอดใช้ไปรวมจากชีต", lines: moves.out }, actor);
    if (moves.down.length) await recordStockMove({ ...base, kind: "adjust", note: "ปรับให้ตรงคงเหลือในชีต", lines: moves.down }, actor);
  }
  return summary;
}
