import "./register-app-alias.mjs";
import env from "@next/env";
import { fileURLToPath } from "node:url";

// The iOS stock IDs, packs, purchase orders and counts from the accounting sheets already
// imported (scripts/import-account-sheets.mjs) → Stock → คลัง and ใบสั่งซื้อ.
//   node scripts/import-sheet-inventory.mjs           dry run: what would come in
//   node scripts/import-sheet-inventory.mjs --apply   writes (the importer's own orders and
//                                                     moves are replaced; people's are kept)
// Run it again after re-importing the sheets: that re-import replaces the wallet payments
// this links orders to.
env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const apply = process.argv.includes("--apply");

const { listAccountSheetTabs, readAccountSheetRows } = await import("../src/server/account-sheet-repository.js");
const inv = await import("../src/lib/sheet-inventory.js");
const stock = await import("../src/lib/sheet-stock.js");

const tabs = await listAccountSheetTabs();
const read = (tab) => readAccountSheetRows(tab.id, { limit: 1000 });
const purchaseTabs = await Promise.all(tabs.filter((tab) => /^1\.1/.test(tab.fileName) && inv.supplierOfTab(tab.tab))
  .map(async (tab) => ({ ...tab, rows: await read(tab) })));
const countTabs = await Promise.all(tabs.filter((tab) => /^1\.4 cash flow/i.test(tab.fileName))
  .map(async (tab) => ({ tab, rows: await read(tab) })));
const plan = inv.planSheetInventory({ purchaseTabs, countTabs });

// The newest per-ID value the sheets hold: Stock to THB › Copy of Sheet1 (IOS Stock to THB, in USD).
const valueTab = tabs.filter((tab) => /^stock to thb$/i.test(tab.fileName) && /copy of sheet1/i.test(tab.tab)).sort((a, b) => b.period.localeCompare(a.period))[0];
const idNotes = {};
const STOCK_TO_THB_IDS = { efooball: "pes1", "pokemon tcgp": "pokemon", "honkai star": "hsr" };
if (valueTab) {
  for (const item of stock.readStockCount(await read(valueTab))) {
    const name = item.name.trim().toLowerCase();
    // A known ID as typed, else the game's ID ("wuthering" → wuthering01), else the name as a new ID (delta01).
    const known = plan.accounts.some((entry) => entry.code === name);
    const code = STOCK_TO_THB_IDS[name] || inv.SHEET_ID_ALIASES[name] || (known ? name : inv.sheetGame(item.name)?.code)
      || (/^[a-z0-9._-]{2,32}$/.test(name) ? name : null);
    if (!code) continue;
    idNotes[code] = `ชีต Stock to THB (ไฟล์เดือน ${valueTab.period}) บอกว่าไอดีนี้เหลือ ${item.qty.toLocaleString("en-US")} USD (${Math.round(item.thb || 0).toLocaleString("en-US")} บาท)`;
  }
}

const { moves, balances } = inv.sheetInventoryMoves(plan.events);
const orders = plan.events.filter((event) => event.type === "order");
console.log(`ไอดี stock: ${new Set([...plan.accounts.map((entry) => entry.code), ...Object.keys(idNotes)]).size} (${plan.accounts.map((entry) => entry.code).join(", ")})`);
console.log(`ใบสั่งซื้อจากชีต: ${orders.length} ใบ (${[...new Set(orders.map((order) => order.supplier))].join(", ")}), ช่วง ${orders[0]?.when.slice(0, 10)} ถึง ${orders.at(-1)?.when.slice(0, 10)}`);
console.log(`ยอดนับ (1.4 Cash Flow): ${plan.events.length - orders.length} ครั้ง → ปรับยอด ${moves.filter((move) => move.kind === "adjust").length} รายการ`);
for (const problem of plan.problems) console.log(`  ต้องดู ${problem.where}: ${problem.reason}`);
for (const [code, tiers] of Object.entries(balances)) {
  const usd = Object.entries(tiers).reduce((sum, [label, qty]) => sum + Number.parseFloat(label) * qty, 0);
  console.log(`  ${code}: คงเหลือตามระบบ ${Math.round(usd).toLocaleString("en-US")} USD${idNotes[code] ? ` · ${idNotes[code]}` : ""}`);
}
if (!apply) {
  console.log("\nลองดู (ยังไม่ได้เขียน) — ถ้าถูกต้อง รันอีกครั้งพร้อม --apply");
  process.exit(0);
}
try {
  const { replaceSheetInventory } = await import("../src/server/sheet-inventory-repository.js");
  const done = await replaceSheetInventory(plan, idNotes);
  console.log(`บันทึก: ไอดี ${done.accounts}, ใบสั่งซื้อ ${done.orders} (ผูกกับรายการจ่ายในกระเป๋า ${done.linked}), ปรับยอด ${done.adjusts}; ลบของเดิมจากชีต ใบสั่งซื้อ ${done.ordersRemoved}, รายการคลัง ${done.movesRemoved}`);
  process.exit(0);
} catch (error) {
  console.error("ไม่สำเร็จ:", error instanceof Error ? error.message : error);
  process.exit(1);
}
