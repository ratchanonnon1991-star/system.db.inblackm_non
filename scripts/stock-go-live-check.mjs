// Before the first account-sheet import on a server: what Stock already holds, and whether the
// old 2.1 STOCK_ sheet import (scripts/import-stock-sheet.mjs) is still there. That import kept
// one opening balance per pack name; the account-sheet import (scripts/import-sheet-inventory.mjs)
// builds the same IDs again from the purchase orders and counts, so keeping both counts twice.
//   node scripts/stock-go-live-check.mjs                    read only: prints what is there
//   node scripts/stock-go-live-check.mjs --clear-old-2-1    removes the 2.1 STOCK_ import's own
//                                                           moves, then the packs left with none
// People's moves, orders and wallet entries are never touched. Used by scripts/sync-account-sheets.mjs.
import "./register-app-alias.mjs";
import env from "@next/env";
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const clear = process.argv.includes("--clear-old-2-1");
const OLD_SHEET_ACTOR = "ยกมาจากชีต 2.1 STOCK_";

const { getPool } = await import("../src/lib/db.js");
const { ensureStockSchema } = await import("../src/server/stock-repository.js");
const { ensurePurchaseOrderSchema } = await import("../src/server/stock-purchase-order-repository.js");
const pool = getPool();
const count = async (sql, params = []) => Number((await pool.query(sql, params)).rows[0]?.n ?? 0);
const tableExists = async (name) => (await pool.query("SELECT to_regclass($1) AS t", [name])).rows[0].t !== null;

try {
  // Creates the new Stock tables on an old server, as the pages would on first open.
  await ensureStockSchema();
  await ensurePurchaseOrderSchema();
  const dir = path.resolve(process.env.STOCK_ATTACHMENTS_DIR || path.join(process.cwd(), "data", "stock-attachments"));
  await mkdir(dir, { recursive: true });
  await access(dir, constants.W_OK);
  console.log(`ไฟล์แนบเก็บที่: ${dir} (เขียนได้)${process.env.STOCK_ATTACHMENTS_DIR ? "" : " · ค่าเริ่มต้น ไม่ได้ตั้ง STOCK_ATTACHMENTS_DIR"}`);

  const oldMoves = await count("SELECT COUNT(*) AS n FROM stock_moves WHERE actor_name = $1 AND actor_id IS NULL", [OLD_SHEET_ACTOR]);
  const peopleMoves = await count("SELECT COUNT(*) AS n FROM stock_moves WHERE actor_id IS NOT NULL");
  console.log(`ไอดี stock: ${await count("SELECT COUNT(*) AS n FROM stock_accounts")} · แพ็ค: ${await count("SELECT COUNT(*) AS n FROM stock_items")}`);
  console.log(`รายการคลังจากชีต 2.1 STOCK_ (ของเก่า): ${oldMoves} · ที่คนกดเอง: ${peopleMoves}`);
  if (peopleMoves) {
    const rows = (await pool.query(`SELECT a.code, m.kind, m.queue, m.actor_name, to_char(m.created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') AS at
      FROM stock_moves m JOIN stock_accounts a ON a.id = m.account_id WHERE m.actor_id IS NOT NULL ORDER BY m.created_at DESC LIMIT 20`)).rows;
    for (const row of rows) console.log(`  ${row.at} ${row.code} ${row.kind} ${row.queue || "-"} โดย ${row.actor_name}`);
  }
  for (const [label, table] of [["ใบสั่งซื้อ", "stock_purchase_orders"], ["รายการกระเป๋าเงิน", "stock_wallet_entries"], ["แท็บชีตบัญชี", "account_sheet_tabs"]]) {
    console.log(`${label}: ${(await tableExists(table)) ? await count(`SELECT COUNT(*) AS n FROM ${table}`) : "ยังไม่มีตาราง"}`);
  }

  if (!clear) {
    if (oldMoves) console.log("\nยังมีของเก่าจากชีต 2.1 STOCK_ ถ้านำเข้าชีตบัญชีทับไปเลยยอดจะนับซ้ำ: ลบด้วย --clear-old-2-1 ก่อน");
    process.exit(0);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // The packs those moves counted: once the moves go, a pack with nothing else was only that import's.
    const touched = (await client.query(`SELECT DISTINCT l.item_id FROM stock_move_lines l JOIN stock_moves m ON m.id = l.move_id
      WHERE m.actor_name = $1 AND m.actor_id IS NULL`, [OLD_SHEET_ACTOR])).rows.map((row) => row.item_id);
    const moves = await client.query("DELETE FROM stock_moves WHERE actor_name = $1 AND actor_id IS NULL", [OLD_SHEET_ACTOR]);
    const items = await client.query(`DELETE FROM stock_items i
      WHERE i.id = ANY($1::int[])
        AND NOT EXISTS (SELECT 1 FROM stock_move_lines l WHERE l.item_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM stock_purchase_order_lines p WHERE p.item_id = i.id)`, [touched]);
    await client.query("COMMIT");
    console.log(`\nลบรายการคลังจากชีต 2.1 STOCK_ ${moves.rowCount} รายการ และแพ็คที่ไม่มีรายการเหลือ ${items.rowCount} แพ็ค (ไอดียังอยู่)`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error("ไม่สำเร็จ:", error instanceof Error ? error.message : error);
  process.exit(1);
}
