import { listMultiGameCardPayments, listOffgamerCards } from "@/server/account-sheet-repository";
import { offgamerBotOrders, offgamerBotUsage } from "@/server/offgamer-bot-usage";
import { linkOffgamerPayments, summarizeOffgamer } from "@/lib/offgamer-cards";
import OffgamerCardsView from "@/components/offgamer-cards-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameDB — Multi Game Card (OffGamer)" };

// 1.4 Multi Game Card: what was bought on OffGamer, per account and month, from the imported
// sheets; writes nothing and never holds a PIN. Each order shows the wallet payment that funded
// it and each card how the Oxide bot used it (read-only from the bot's database).
// ?account= and ?month=YYYY-MM narrow the orders, ?q= finds an order number, serial or buyer,
// ?serial= opens one card with the bot orders it paid for.
export default async function OffgamerCardsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const text = (value) => (typeof value === "string" ? value.trim().slice(0, 120) : "");
  const serial = /^[A-Za-z0-9]{6,40}$/.test(text(params.serial)) ? text(params.serial) : "";
  const [{ orders, accounts, listTabId }, payments] = await Promise.all([listOffgamerCards(), listMultiGameCardPayments()]);
  const [usage, card] = await Promise.all([
    offgamerBotUsage(orders.flatMap((order) => order.cards.map((c) => c.serial))),
    serial ? offgamerBotOrders(serial) : null,
  ]);
  return <OffgamerCardsView orders={orders} summary={summarizeOffgamer(orders)} accounts={accounts} listTabId={listTabId}
    payments={Object.fromEntries(linkOffgamerPayments(orders, payments))} paymentCount={payments.length}
    botUse={usage.bySerial} botError={usage.error} serial={serial} serialOrders={card}
    account={text(params.account)} month={/^\d{4}-\d{2}$/.test(text(params.month)) ? text(params.month) : ""} query={text(params.q)} />;
}
