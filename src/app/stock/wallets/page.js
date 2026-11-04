import { getSessionUser } from "@/server/session-user";
import { canManageStock } from "@/server/auth";
import { ensurePurchaseOrderSchema, listPurchaseOrders } from "@/server/stock-purchase-order-repository";
import { listWalletEntries, listWallets } from "@/server/stock-wallet-repository";
import StockWallets from "@/components/stock-wallets";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameDB — กระเป๋าเงิน Stock" };

export default async function StockWalletsPage() {
  const user = await getSessionUser();
  await ensurePurchaseOrderSchema();
  // Orders waiting for money: a payment made outside an order can be tied to one of them.
  const [wallets, entries, waitingOrders] = await Promise.all([listWallets(), listWalletEntries(), listPurchaseOrders({ status: "approved" })]);
  return <StockWallets wallets={wallets} entries={entries} waitingOrders={waitingOrders} canEdit={canManageStock(user)} />;
}
