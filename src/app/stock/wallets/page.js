import { getSessionUser } from "@/server/session-user";
import { canManageStock } from "@/server/auth";
import { ensurePurchaseOrderSchema } from "@/server/stock-purchase-order-repository";
import { listWalletEntries, listWallets } from "@/server/stock-wallet-repository";
import StockWallets from "@/components/stock-wallets";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameDB — กระเป๋าเงิน Stock" };

export default async function StockWalletsPage() {
  const user = await getSessionUser();
  await ensurePurchaseOrderSchema();
  const [wallets, entries] = await Promise.all([listWallets(), listWalletEntries()]);
  return <StockWallets wallets={wallets} entries={entries} canEdit={canManageStock(user)} />;
}
