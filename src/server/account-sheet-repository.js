import { getPool } from "@/lib/db";
import { groupStockCounts, isStockTab, readStockCount, withStockChanges } from "@/lib/sheet-stock";
import { ACCOUNT_SHEET_SOURCE, sheetFileKind, walletCodeForTab } from "@/lib/account-sheets";
import { DEFAULT_WALLETS, fromWalletUnits, WALLET_COUNTED } from "@/lib/stock-wallets";
import { ensureWalletSchema } from "@/server/stock-wallet-repository";
import { isExpenseFile, mergeExpenseTabs, readExpenseTab } from "@/lib/sheet-expenses";
import { isOffgamerFile, mergeOffgamerTabs, offgamerAccount, readOffgamerList } from "@/lib/offgamer-cards";

// The accounting workbooks kept row by row (src/lib/account-sheets.js). A
// month is replaced as a whole on every import, so a re-run never duplicates.
let schemaReady;

export async function ensureAccountSheetSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS account_sheet_tabs (
        id          SERIAL PRIMARY KEY,
        period      CHAR(7) NOT NULL,
        file_name   VARCHAR(200) NOT NULL,
        file_kind   VARCHAR(200) NOT NULL,
        tab_name    VARCHAR(200) NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        row_count   INTEGER NOT NULL DEFAULT 0,
        wallet_code VARCHAR(32),
        imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (period, file_name, tab_name)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS account_sheet_rows (
        id          BIGSERIAL PRIMARY KEY,
        tab_id      INTEGER NOT NULL REFERENCES account_sheet_tabs(id) ON DELETE CASCADE,
        row_no      INTEGER NOT NULL,
        cells       JSONB NOT NULL,
        search_text TEXT NOT NULL DEFAULT ''
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS account_sheet_rows_tab_idx ON account_sheet_rows (tab_id, row_no)`);
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });
  return schemaReady;
}

/**
 * Replaces one month: `files` is [{ fileName, tabs: [{ tab, rows: [{ rowNo, cells }] }] }].
 * Returns { tabs, rows }.
 */
export async function replaceAccountSheetMonth(period, files) {
  await ensureAccountSheetSchema();
  const client = await getPool().connect();
  let tabCount = 0;
  let rowCount = 0;
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM account_sheet_tabs WHERE period = $1`, [period]);
    for (const file of files) {
      let order = 0;
      for (const { tab, rows } of file.tabs) {
        order += 1;
        const created = await client.query(
          `INSERT INTO account_sheet_tabs (period, file_name, file_kind, tab_name, sort_order, row_count, wallet_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [period, file.fileName, sheetFileKind(file.fileName), tab, order, rows.length, walletCodeForTab(file.fileName, tab)]
        );
        const tabId = created.rows[0].id;
        for (let start = 0; start < rows.length; start += 2000) {
          const chunk = rows.slice(start, start + 2000);
          await client.query(
            `INSERT INTO account_sheet_rows (tab_id, row_no, cells, search_text)
             SELECT $1, r.row_no, r.cells::jsonb, r.search_text
               FROM UNNEST($2::int[], $3::text[], $4::text[]) AS r(row_no, cells, search_text)`,
            [tabId, chunk.map((row) => row.rowNo), chunk.map((row) => JSON.stringify(row.cells)), chunk.map((row) => row.cells.join(" ").toLowerCase())]
          );
        }
        tabCount += 1;
        rowCount += rows.length;
      }
    }
    await client.query("COMMIT");
    return { tabs: tabCount, rows: rowCount };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Every tab kept, with its month: [{ id, period, fileName, fileKind, tab, rowCount, walletCode }]. */
export async function listAccountSheetTabs() {
  await ensureAccountSheetSchema();
  const result = await getPool().query(
    `SELECT id, period, file_name, file_kind, tab_name, row_count, wallet_code, imported_at
       FROM account_sheet_tabs ORDER BY period DESC, file_name, sort_order`
  );
  return result.rows.map((row) => ({
    id: row.id, period: row.period, fileName: row.file_name, fileKind: row.file_kind, tab: row.tab_name,
    rowCount: row.row_count, walletCode: row.wallet_code, importedAt: row.imported_at,
  }));
}

/**
 * Every stock count the sheets hold (1.4 Cash Flow, 1.2 › Cash Flow, Stock to THB),
 * oldest first, each item with its change since the count before. Read-only.
 */
export async function listSheetStockCounts() {
  const tabs = (await listAccountSheetTabs()).filter(isStockTab);
  const read = await Promise.all(tabs.map(async (tab) => ({ tab, items: readStockCount(await readAccountSheetRows(tab.id, { limit: 1000 })) })));
  return withStockChanges(groupStockCounts(read));
}

/** One tab's rows, a page at a time. */
export async function readAccountSheetRows(tabId, { offset = 0, limit = 200 } = {}) {
  await ensureAccountSheetSchema();
  const result = await getPool().query(
    `SELECT row_no, cells FROM account_sheet_rows WHERE tab_id = $1 ORDER BY row_no OFFSET $2 LIMIT $3`,
    [Number(tabId), Math.max(Number(offset) || 0, 0), Math.min(Math.max(Number(limit) || 200, 1), 1000)]
  );
  return result.rows.map((row) => ({ rowNo: row.row_no, cells: row.cells }));
}

/** Every row of one tab, in sheet order. */
async function readAllAccountSheetRows(tabId) {
  await ensureAccountSheetSchema();
  const result = await getPool().query(`SELECT row_no, cells FROM account_sheet_rows WHERE tab_id = $1 ORDER BY row_no`, [Number(tabId)]);
  return result.rows.map((row) => ({ rowNo: row.row_no, cells: row.cells }));
}

/** 1.3 บัญชีใช้จ่ายทั่วไป: every money row of every bank tab, each once (src/lib/sheet-expenses.js). Read-only. */
export async function listSheetExpenses() {
  const tabs = (await listAccountSheetTabs()).filter((tab) => isExpenseFile(tab.fileName));
  const read = await Promise.all(tabs.map(async (tab) => ({ tabId: tab.id, tab: tab.tab, period: tab.period, entries: readExpenseTab(tab.tab, await readAllAccountSheetRows(tab.id)) })));
  return mergeExpenseTabs(read.filter((tab) => tab.entries.length));
}

/**
 * 1.4 Multi Game Card: the OffGamer orders (src/lib/offgamer-cards.js) and the newest
 * "Offgamer List" of accounts. Read-only; PINs are never stored.
 */
export async function listOffgamerCards() {
  const tabs = (await listAccountSheetTabs()).filter((tab) => isOffgamerFile(tab.fileName));
  const accountTabs = tabs.filter((tab) => offgamerAccount(tab.tab));
  const listTab = tabs.find((tab) => /^offgamer\s+list$/i.test(tab.tab.trim())); // tabs come newest month first
  const [read, listRows] = await Promise.all([
    Promise.all(accountTabs.map(async (tab) => ({ tabId: tab.id, tab: tab.tab, period: tab.period, rows: await readAllAccountSheetRows(tab.id) }))),
    listTab ? readAllAccountSheetRows(listTab.id) : [],
  ]);
  return { orders: mergeOffgamerTabs(read), accounts: readOffgamerList(listRows), listTabId: listTab?.id ?? null };
}

/**
 * The wallet payments for Multi Game Cards (entries titled "Multi Game Card", money out),
 * to tie each OffGamer order to the payment that funded it: [{ id, date (Bangkok), amount, fee, walletName }].
 */
export async function listMultiGameCardPayments() {
  await ensureWalletSchema();
  const result = await getPool().query(
    `SELECT e.id, to_char(e.occurred_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS date,
            (-l.amount)::text AS amount, l.fee::text AS fee, w.name AS wallet_name, l.currency
       FROM stock_wallet_entries e
       JOIN stock_wallet_legs l ON l.entry_id = e.id
       JOIN stock_wallets w ON w.id = l.wallet_id
      WHERE e.title ILIKE '%multi game card%' AND l.amount < 0 AND l.currency IN ('USDT', 'USDC')
      ORDER BY e.occurred_at, e.id`
  );
  return result.rows.map((row) => ({ id: String(row.id), date: row.date, amount: Number(row.amount), fee: Number(row.fee) || 0, walletName: row.wallet_name, currency: row.currency }));
}

/** How many kept rows come before sheet row `rowNo` of a tab (to open the page that shows it). */
export async function accountSheetRowIndex(tabId, rowNo) {
  await ensureAccountSheetSchema();
  const result = await getPool().query(`SELECT COUNT(*)::int AS n FROM account_sheet_rows WHERE tab_id = $1 AND row_no < $2`, [Number(tabId), Number(rowNo)]);
  return result.rows[0].n;
}

/** Rows of any tab holding `text` (case-insensitive), newest month first. */
export async function searchAccountSheets(text, { period = "", limit = 200 } = {}) {
  await ensureAccountSheetSchema();
  const needle = String(text || "").trim().toLowerCase();
  if (!needle) return [];
  const escaped = needle.replace(/[\\%_]/g, (char) => `\\${char}`);
  const result = await getPool().query(
    `SELECT t.id AS tab_id, t.period, t.file_name, t.tab_name, r.row_no, r.cells,
            (SELECT COUNT(*) FROM account_sheet_rows x WHERE x.tab_id = r.tab_id AND x.row_no < r.row_no)::int AS row_index
       FROM account_sheet_rows r JOIN account_sheet_tabs t ON t.id = r.tab_id
      WHERE r.search_text LIKE $1 AND ($2 = '' OR t.period = $2)
      ORDER BY t.period DESC, t.file_name, t.sort_order, r.row_no
      LIMIT $3`,
    [`%${escaped}%`, period, Math.min(Math.max(Number(limit) || 200, 1), 500)]
  );
  return result.rows.map((row) => ({ tabId: row.tab_id, period: row.period, fileName: row.file_name, tab: row.tab_name, rowNo: row.row_no, rowIndex: row.row_index, cells: row.cells }));
}

/**
 * Replaces the wallet entries that came from the sheets with `entries`
 * (planWalletEntries), then recomputes every leg's balance-after in time order.
 */
export async function replaceSheetWalletEntries(entries, checks = []) {
  await ensureWalletSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const wallets = Object.fromEntries((await client.query(`SELECT id, code FROM stock_wallets FOR UPDATE`)).rows.map((row) => [row.code, row.id]));
    const removed = await client.query(`DELETE FROM stock_wallet_entries WHERE source_ref LIKE $1`, [`${ACCOUNT_SHEET_SOURCE}:%`]);
    for (const entry of entries) {
      const created = await client.query(
        `INSERT INTO stock_wallet_entries (kind, title, note, status, occurred_at, actor_name, source_ref, details, sheet_period, sheet_tab, sheet_row, received_sheet)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [entry.kind, entry.title, entry.note, entry.status, entry.occurredAt, entry.actorName, entry.sourceRef, JSON.stringify(entry.details || []),
          entry.sheet?.period || null, entry.sheet?.tab || null, entry.sheet?.rowNo ?? null, entry.receivedAt ? JSON.stringify(entry.receivedAt) : null]
      );
      for (const leg of entry.legs) {
        if (!wallets[leg.walletCode]) throw new Error(`ไม่พบกระเป๋า ${leg.walletCode}`);
        await client.query(
          `INSERT INTO stock_wallet_legs (entry_id, wallet_id, currency, amount, fee, balance_after) VALUES ($1, $2, $3, $4, $5, 0)`,
          [created.rows[0].id, wallets[leg.walletCode], leg.currency, fromWalletUnits(leg.amount), fromWalletUnits(leg.fee)]
        );
      }
    }
    await client.query(`
      UPDATE stock_wallet_legs l SET balance_after = s.after
        FROM (SELECT l2.id, SUM(l2.amount) OVER (PARTITION BY l2.wallet_id, l2.currency ORDER BY e.occurred_at, e.id, l2.id) AS after
                FROM stock_wallet_legs l2 JOIN stock_wallet_entries e ON e.id = l2.entry_id
               WHERE ${WALLET_COUNTED}) s
       WHERE s.id = l.id`);
    // The month checks: numbers replaced, who checked them kept (the page shows when the numbers moved since).
    await client.query(`DELETE FROM stock_wallet_sheet_checks c WHERE NOT EXISTS (
      SELECT 1 FROM UNNEST($1::int[], $2::text[], $3::text[]) AS k(w, p, c2) WHERE k.w = c.wallet_id AND k.p = c.period AND k.c2 = c.currency)`,
    [checks.map((c) => wallets[c.code]), checks.map((c) => c.period), checks.map((c) => c.currency)]);
    for (const check of checks) {
      await client.query(
        `INSERT INTO stock_wallet_sheet_checks (wallet_id, period, currency, tab_name, sheet_open, system_open, sheet_close, system_close, rows, drifts)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (wallet_id, period, currency) DO UPDATE SET tab_name = EXCLUDED.tab_name, sheet_open = EXCLUDED.sheet_open, system_open = EXCLUDED.system_open,
           sheet_close = EXCLUDED.sheet_close, system_close = EXCLUDED.system_close, rows = EXCLUDED.rows, drifts = EXCLUDED.drifts`,
        [wallets[check.code], check.period, check.currency, check.tab, check.sheetOpen, check.systemOpen, check.sheetClose, check.systemClose, check.rows, JSON.stringify(check.drifts)]
      );
    }
    // Wallets no longer in the list and never used go away.
    const gone = await client.query(`DELETE FROM stock_wallets w WHERE w.code <> ALL($1::text[])
      AND NOT EXISTS (SELECT 1 FROM stock_wallet_legs l WHERE l.wallet_id = w.id) RETURNING code`, [DEFAULT_WALLETS.map((wallet) => wallet.code)]);
    await client.query("COMMIT");
    return { removed: removed.rowCount, added: entries.length, checks: checks.length, walletsRemoved: gone.rows.map((row) => row.code) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
