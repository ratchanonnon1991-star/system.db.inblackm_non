import { listSheetStockCounts } from "@/server/account-sheet-repository";
import SheetStockView from "@/components/sheet-stock-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameDB — คลังตามชีต" };

// What the accounting sheets counted as stock (Cash Flow tables), read from the imported
// sheets; nothing here writes Stock. ?count=<tab id> picks a count (default: the newest),
// ?item=<key> shows one item across every count, ?q= narrows the items by name.
export default async function SheetStockPage({ searchParams }) {
  const params = (await searchParams) || {};
  const text = (value) => (typeof value === "string" ? value.trim().slice(0, 160) : "");
  const counts = await listSheetStockCounts();
  // Default: of the newest month's counts, the one with the most items.
  const newest = counts.length ? counts[counts.length - 1].period : "";
  const fullest = counts.filter((count) => count.period === newest).sort((a, b) => b.items.length - a.items.length)[0] || null;
  const current = counts.find((count) => count.key === text(params.count)) || fullest;
  return <SheetStockView counts={counts} current={current} item={text(params.item)} query={text(params.q)} />;
}
