import { getSessionUser } from "@/server/session-user";
import { canManageStock } from "@/server/auth";
import { listStockAccounts } from "@/server/stock-repository";
import { listStockGames } from "@/server/stock-games";
import StockOverview from "@/components/stock-overview";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const user = await getSessionUser();
  const canEdit = canManageStock(user);
  const [accounts, games] = await Promise.all([listStockAccounts(), canEdit ? listStockGames() : []]);
  return <StockOverview accounts={accounts} games={games} canEdit={canEdit} />;
}
