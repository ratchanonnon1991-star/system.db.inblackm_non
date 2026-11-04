import { getSessionUser } from "@/server/session-user";
import { canManageStock } from "@/server/auth";
import { ensurePurchaseOrderSchema, listPurchaseOrders } from "@/server/stock-purchase-order-repository";
import { listWalletChecks, listWalletEntries, listWallets } from "@/server/stock-wallet-repository";
import StockWallets from "@/components/stock-wallets";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameDB — กระเป๋าเงิน Stock" };

// The three Stock wallets by default; ?others=1 shows the rest. ?wallet=<code> opens one wallet
// with its month-by-month check against the sheet. ?month=YYYY-MM, ?kind=, ?q= and ?issues=1 filter the entries.
export default async function StockWalletsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const text = (value) => (typeof value === "string" ? value.trim().slice(0, 120) : "");
  const user = await getSessionUser();
  await ensurePurchaseOrderSchema();
  const wallets = await listWallets();
  const selected = wallets.find((wallet) => wallet.code === text(params.wallet)) || null;
  const filters = {
    wallet: selected?.code || "", month: /^\d{4}-\d{2}$/.test(text(params.month)) ? text(params.month) : "",
    kind: text(params.kind), q: text(params.q), issues: params.issues === "1", others: params.others === "1" || Boolean(selected && selected.group !== "main"),
  };
  const scope = selected ? [selected.id] : wallets.filter((wallet) => filters.others || wallet.group === "main").map((wallet) => wallet.id);
  // Orders waiting for money: a payment made outside an order can be tied to one of them.
  const [entries, checks, waitingOrders] = await Promise.all([
    listWalletEntries({ walletIds: scope, month: filters.month, kind: filters.kind, q: filters.q, issues: filters.issues, limit: 400 }),
    listWalletChecks(),
    listPurchaseOrders({ status: "approved" }),
  ]);
  return <StockWallets wallets={wallets} entries={entries} checks={checks} filters={filters} selected={selected}
    waitingOrders={waitingOrders} canEdit={canManageStock(user)} currentUserId={user?.id ?? null} />;
}
