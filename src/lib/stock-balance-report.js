// What the TopUp admin may read of Stock over the bridge: what is left of each pack, per open
// account. Pure. Costs, moves and notes stay on tools.
import { stockPackNameParts } from "./stock.js";

/** accounts: listStockAccounts(); games: listStockGames(). */
export function stockBalanceReport(accounts, games = []) {
  const gameName = new Map(games.map((game) => [game.id, game.name]));
  return {
    accounts: accounts
      .filter((account) => account.status !== "closed")
      .map((account) => ({
        code: account.code,
        // The linked GameInfo game says it best; an unlinked account still has its sheet's name.
        game: gameName.get(account.gameId) || account.gameName || "",
        dataMode: account.dataMode,
        webSoldOut: account.webSoldOut === true,
        items: (account.items || []).map((item) => ({
          label: item.label,
          packNames: stockPackNameParts(item.packName),
          left: item.left,
          lowAt: item.lowAt,
          tone: item.tone,
        })),
      })),
  };
}
