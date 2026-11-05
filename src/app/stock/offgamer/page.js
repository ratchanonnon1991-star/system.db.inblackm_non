import { listOffgamerCards } from "@/server/account-sheet-repository";
import { summarizeOffgamer } from "@/lib/offgamer-cards";
import OffgamerCardsView from "@/components/offgamer-cards-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameDB — Multi Game Card (OffGamer)" };

// 1.4 Multi Game Card: what was bought on OffGamer, per account and month, from the imported
// sheets; writes nothing and never holds a PIN. ?account= and ?month=YYYY-MM narrow the orders,
// ?q= finds an order number, serial or buyer.
export default async function OffgamerCardsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const text = (value) => (typeof value === "string" ? value.trim().slice(0, 120) : "");
  const { orders, accounts, listTabId } = await listOffgamerCards();
  return <OffgamerCardsView orders={orders} summary={summarizeOffgamer(orders)} accounts={accounts} listTabId={listTabId}
    account={text(params.account)} month={/^\d{4}-\d{2}$/.test(text(params.month)) ? text(params.month) : ""} query={text(params.q)} />;
}
