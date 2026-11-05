import { listSheetExpenses } from "@/server/account-sheet-repository";
import { summarizeExpenses } from "@/lib/sheet-expenses";
import SheetExpensesView from "@/components/sheet-expenses-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameDB — ค่าใช้จ่ายทั่วไป" };

// 1.3 บัญชีใช้จ่ายทั่วไป per month and category, read from the imported sheets; writes nothing.
// ?month=YYYY-MM picks a month (default: the newest), ?cat=<category> lists that category's rows.
export default async function SheetExpensesPage({ searchParams }) {
  const params = (await searchParams) || {};
  const text = (value) => (typeof value === "string" ? value.trim().slice(0, 160) : "");
  const entries = await listSheetExpenses();
  const summary = summarizeExpenses(entries);
  const month = summary.months.includes(text(params.month)) ? text(params.month) : summary.months[0] || "";
  return <SheetExpensesView entries={entries.filter((entry) => entry.date.startsWith(month))} summary={summary} month={month} category={text(params.cat)} />;
}
