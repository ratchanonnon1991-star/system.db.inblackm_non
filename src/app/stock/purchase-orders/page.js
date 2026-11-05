import { getSessionUser } from "@/server/session-user";
import { canManageStock } from "@/server/auth";
import { listStockAccounts } from "@/server/stock-repository";
import { listStockGames } from "@/server/stock-games";
import { listPurchaseOrders } from "@/server/stock-purchase-order-repository";
import { listWallets } from "@/server/stock-wallet-repository";
import StockPurchaseOrders from "@/components/stock-purchase-orders";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameDB — ใบสั่งซื้อ Stock" };

// ?open=<id> opens that order (links from wallets and the front page); ?q= prefills the search.
export default async function StockPurchaseOrdersPage({ searchParams }) {
  const params = (await searchParams) || {};
  const user = await getSessionUser();
  const canEdit = canManageStock(user);
  // A year of orders imported from the sheets is ~320: load them all, newest first.
  const orders = await listPurchaseOrders({ limit: 1000 });
  const [accounts, wallets, games] = await Promise.all([canEdit ? listStockAccounts() : [], canEdit ? listWallets() : [], canEdit ? listStockGames() : []]);
  return <StockPurchaseOrders orders={orders} accounts={accounts} games={games} wallets={wallets} canEdit={canEdit}
    initialOpenId={Number(params.open) || null} initialQuery={typeof params.q === "string" ? params.q.slice(0, 120) : ""} />;
}
