import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canManageStock } from "@/server/auth";
import { getStockAccount, listStockMoves } from "@/server/stock-repository";
import { listStockGames, listStockPackNames } from "@/server/stock-games";
import StockAccountView from "@/components/stock-account-view";

export const dynamic = "force-dynamic";

export default async function StockAccountPage({ params }) {
  const { code } = await params;
  const account = await getStockAccount(code);
  if (!account) notFound();
  const user = await getSessionUser();
  const canEdit = canManageStock(user);
  const [moves, games, packNames] = await Promise.all([
    listStockMoves(account.id),
    canEdit ? listStockGames() : [],
    canEdit ? listStockPackNames(account.gameId, account.dataMode) : [],
  ]);
  return <StockAccountView account={account} moves={moves} games={games} packNames={packNames} canEdit={canEdit} />;
}
