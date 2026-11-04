import { getSessionUser } from "@/server/session-user";
import { canManageStock } from "@/server/auth";
import { listStockAccounts } from "@/server/stock-repository";
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
  const orders = await listPurchaseOrders();
  const [accounts, wallets] = await Promise.all([canEdit ? listStockAccounts() : [], canEdit ? listWallets() : []]);
  return <StockPurchaseOrders orders={orders} accounts={accounts} wallets={wallets} canEdit={canEdit}
    initialOpenId={Number(params.open) || null} initialQuery={typeof params.q === "string" ? params.q.slice(0, 120) : ""} />;
}
