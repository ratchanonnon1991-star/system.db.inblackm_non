import { accountSheetRowIndex as rowIndexOf, listAccountSheetTabs, readAccountSheetRows, searchAccountSheets } from "@/server/account-sheet-repository";
import AccountSheetsView, { ACCOUNT_SHEET_PAGE_SIZE } from "@/components/account-sheets-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameDB — ข้อมูลบัญชี" };

// Every tab of the accounting workbooks, as imported by scripts/import-account-sheets.mjs.
// ?tab=<id>&page=<n> opens one tab; ?q=<text>&period=<YYYY-MM> searches every tab.
// ?period=<YYYY-MM>&name=<tab name>&row=<n> opens the tab of that month at that row and marks it
// (the wallets page links a wallet entry to its sheet row this way).
// ?kind=<file kind>&name=<tab name> opens the newest month of that tab (a tab added to the Stock menu).
export default async function AccountSheetsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const text = (value) => (typeof value === "string" ? value.trim().slice(0, 120) : "");
  const query = text(params.q);
  const period = /^\d{4}-\d{2}$/.test(text(params.period)) ? text(params.period) : "";
  const tabs = await listAccountSheetTabs();
  const name = text(params.name).toLowerCase().replace(/\s+/g, " ");
  const kind = text(params.kind);
  const sameName = (tab) => tab.tab.trim().toLowerCase().replace(/\s+/g, " ") === name;
  const open = tabs.find((tab) => tab.id === Number(params.tab))
    || (name && period ? tabs.find((tab) => tab.period === period && sameName(tab) && /^1\.2(?!\d)/.test(tab.fileName)) : null)
    // ?kind=&name= (a tab added to the Stock menu): the newest month that has it; tabs come newest first.
    || (name && kind && !period ? tabs.find((tab) => tab.fileKind === kind && sameName(tab)) : null)
    || null;
  const markRow = Number(params.row) || null;
  const page = markRow && open && !params.page
    ? Math.floor((await rowIndexOf(open.id, markRow)) / ACCOUNT_SHEET_PAGE_SIZE) + 1
    : Math.max(Number(params.page) || 1, 1);
  const [rows, results] = await Promise.all([
    open ? readAccountSheetRows(open.id, { offset: (page - 1) * ACCOUNT_SHEET_PAGE_SIZE, limit: ACCOUNT_SHEET_PAGE_SIZE }) : [],
    query ? searchAccountSheets(query, { period }) : [],
  ]);
  return <AccountSheetsView tabs={tabs} open={open} rows={rows} page={page} query={query} period={period} results={results} markRow={markRow} />;
}
