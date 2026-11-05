import { listStockAccounts } from "@/server/stock-repository";
import { listPurchaseOrders, listRecentPurchaseOrderEvents } from "@/server/stock-purchase-order-repository";
import { listWalletAdjustsAwaiting, listWalletEntries, listWallets } from "@/server/stock-wallet-repository";
import { listStockAppLinks } from "@/server/stock-app-link-repository";
import { getSessionUser } from "@/server/session-user";
import { canManageStock } from "@/server/auth";
import { buildStockOverview } from "@/lib/stock-overview";
import StockFrontPage from "@/components/stock-front-page";

export const dynamic = "force-dynamic";

// The Stock front page: what needs doing today. The account cards live at /stock/inventory.
export default async function StockPage() {
  const orders = await listPurchaseOrders();
  const [user, accounts, wallets, events, entries, adjusts, links] = await Promise.all([
    getSessionUser(),
    listStockAccounts(),
    listWallets(),
    listRecentPurchaseOrderEvents(10),
    listWallets().then((all) => listWalletEntries({ walletIds: all.filter((wallet) => wallet.group === "main").map((wallet) => wallet.id), limit: 10 })),
    listWalletAdjustsAwaiting(),
    listStockAppLinks(),
  ]);
  // The front page follows the three Stock wallets; the others live on the wallets page.
  const main = wallets.filter((wallet) => wallet.group === "main");
  const overview = buildStockOverview({ orders, wallets: main, accounts });
  return <StockFrontPage overview={overview} events={events} entries={entries} adjusts={adjusts} links={links} canEdit={canManageStock(user)} accountCount={accounts.filter((account) => account.status !== "closed").length} />;
}
