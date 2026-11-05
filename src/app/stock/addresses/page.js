import { getSessionUser } from "@/server/session-user";
import { canManageStock } from "@/server/auth";
import { listCryptoAddresses } from "@/server/stock-address-repository";
import { listWallets } from "@/server/stock-wallet-repository";
import { listPurchaseOrders } from "@/server/stock-purchase-order-repository";
import StockAddressesView from "@/components/stock-addresses-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameDB — ที่อยู่โอน" };

// Saved crypto withdrawal addresses: copy coin, chain, address and memo instead of typing them.
export default async function StockAddressesPage() {
  const user = await getSessionUser();
  const [all, wallets, orders] = await Promise.all([listCryptoAddresses({ includeRetired: true }), listWallets(), listPurchaseOrders({ limit: 1000 })]);
  // Names to pick from: the suppliers on orders and our own wallets.
  const recipients = [...new Set([...orders.map((order) => order.supplier), ...wallets.map((wallet) => wallet.name)])].filter(Boolean).sort();
  return (
    <StockAddressesView addresses={all.filter((entry) => entry.status !== "retired")} retired={all.filter((entry) => entry.status === "retired")}
      recipients={recipients} canEdit={canManageStock(user)} currentUserId={user?.id ?? null} />
  );
}
