import { listGameListRows } from "@/server/gameinfo-gamelist";
import { getGamelistPacks } from "@/server/gameinfo-gamelist-packs";
import { getGameinfoModeData } from "@/server/gameinfo-mode-data";

// What a stock account can point at in GameInfo. GameInfo has its own
// database: when it cannot be reached the stock pages still work, just
// without the pickers.

export async function listStockGames() {
  try {
    const rows = await listGameListRows();
    return rows.map((row) => ({ id: row.id, name: String(row.game || "").split("\n")[0].trim() })).filter((game) => game.name);
  } catch (error) {
    console.error("stock: GameInfo games unavailable", error);
    return [];
  }
}

/** The pack names of one game in one mode, for linking a stock pack to its GameInfo pack. */
export async function listStockPackNames(gameId, dataMode = "uid") {
  if (!gameId) return [];
  try {
    const currencies = dataMode === "idpass"
      ? (await getGameinfoModeData(gameId, "idpass")).packs?.currencies
      : (await getGamelistPacks(gameId)).currencies;
    const names = (currencies || []).flatMap((currency) => (currency.categories || []).flatMap((category) => (category.packs || []).map((pack) => String(pack.name || "").trim())));
    return [...new Set(names.filter(Boolean))];
  } catch (error) {
    console.error("stock: GameInfo packs unavailable", error);
    return [];
  }
}
