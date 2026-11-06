import { getSessionUser } from "@/server/session-user";
import { canManageStock } from "@/server/auth";
import { getStockWebSync, listStockAccounts } from "@/server/stock-repository";
import { listStockGameLogos, listStockGames } from "@/server/stock-games";
import { matchStockGame, stockGameHints } from "@/lib/stock-game-match";
import { appStoreKey } from "@/lib/stock-app-store";
import { listAppStoreIcons } from "@/server/stock-game-icons";
import StockOverview from "@/components/stock-overview";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const user = await getSessionUser();
  const canEdit = canManageStock(user);
  const [accounts, games, webSync] = await Promise.all([listStockAccounts(), listStockGames(), getStockWebSync()]);
  // An account not linked yet still gets its game's icon when its sheet name is a GameInfo game's.
  const gameOf = new Map(accounts.map((account) => [account.id, account.gameId || matchStockGame(account, games).game?.id || null]));
  const byGame = await listStockGameLogos([...gameOf.values()]);
  const logos = Object.fromEntries([...gameOf].filter(([, gameId]) => byGame[gameId]).map(([id, gameId]) => [id, byGame[gameId]]));
  // The rest: the App Store icon of the game's name (the sheet's, else what the code hints at).
  const nameOf = (account) => account.gameName || games.find((game) => game.id === gameOf.get(account.id))?.name || stockGameHints(account)[0] || "";
  const rest = accounts.filter((account) => !logos[account.id] && nameOf(account));
  const appStore = await listAppStoreIcons(rest.map(nameOf));
  for (const account of rest) {
    const icon = appStore[appStoreKey(nameOf(account))];
    if (icon) logos[account.id] = icon;
  }
  return <StockOverview accounts={accounts} games={canEdit ? games : []} logos={logos} canEdit={canEdit} webSync={webSync} />;
}
