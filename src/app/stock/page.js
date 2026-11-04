import { listStockAccounts } from "@/server/stock-repository";
import { listPurchaseOrders, listRecentPurchaseOrderEvents } from "@/server/stock-purchase-order-repository";
import { listWalletAdjustsAwaiting, listWalletEntries, listWallets } from "@/server/stock-wallet-repository";
import { buildStockOverview } from "@/lib/stock-overview";
import StockFrontPage from "@/components/stock-front-page";

export const dynamic = "force-dynamic";

// The Stock front page: what needs doing today. The account cards live at /stock/inventory.
export default async function StockPage() {
  const orders = await listPurchaseOrders();
  const [accounts, wallets, events, entries, adjusts] = await Promise.all([
    listStockAccounts(),
    listWallets(),
    listRecentPurchaseOrderEvents(10),
    listWalletEntries({ limit: 10 }),
    listWalletAdjustsAwaiting(),
  ]);
  const overview = buildStockOverview({ orders, wallets, accounts });
  return <StockFrontPage overview={overview} events={events} entries={entries} adjusts={adjusts} accountCount={accounts.filter((account) => account.status !== "closed").length} />;
}
