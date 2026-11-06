import { listGameListRows } from "@/server/gameinfo-gamelist";
import { getGamelistPacks } from "@/server/gameinfo-gamelist-packs";
import { getGameinfoModeData } from "@/server/gameinfo-mode-data";
import { getGamelistImage, listGamelistImageByGame } from "@/server/gameinfo-gamelist-image";
import { getGamelistGameSettings, listGamelistGameSettings } from "@/server/gameinfo-game-settings";
import { getTopupWebGameThumbnail, listTopupWebGameThumbnails } from "@/server/gameinfo-topup-web";
import { isGamelistImageRawHref } from "@/lib/gameinfo-image-url";

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

/** The main-site game a GameInfo game is linked to, where the pack picker opens. Null when unknown. */
export async function getStockTopupGameId(gameId) {
  if (!gameId) return null;
  try {
    return (await getGamelistGameSettings(gameId)).topupGameId;
  } catch (error) {
    console.error("stock: GameInfo settings unavailable", error);
    return null;
  }
}

const logoHref = (gameId, version) => `/api/stock/games/${gameId}/logo?v=${encodeURIComponent(version)}`;

/**
 * { [gameId]: src } of each game's logo: the icon set in GameInfo, else the
 * thumbnail of the TopUp website game it is linked to. A stored (data:) image is
 * served by /api/stock/games/<id>/logo, since Stock users need not have GameInfo
 * access; an https one is used as is. No logo → left out.
 */
export async function listStockGameLogos(gameIds) {
  const wanted = [...new Set(gameIds.filter(Boolean).map(Number))];
  if (!wanted.length) return {};
  const logos = {};
  try {
    const images = await listGamelistImageByGame();
    for (const id of wanted) {
      const src = String(images[id] || "");
      if (isGamelistImageRawHref(src, id)) logos[id] = logoHref(id, `g${new URL(src, "http://x").searchParams.get("v")}`);
      else if (/^https:\/\//i.test(src)) logos[id] = src;
    }
  } catch (error) {
    console.error("stock: GameInfo icons unavailable", error);
  }
  const missing = wanted.filter((id) => !logos[id]);
  if (!missing.length) return logos;
  try {
    const settings = await listGamelistGameSettings();
    const thumbs = await listTopupWebGameThumbnails(missing.map((id) => settings[id]?.topupGameId));
    for (const id of missing) {
      const thumb = thumbs[settings[id]?.topupGameId];
      if (thumb) logos[id] = thumb.href || logoHref(id, `w${thumb.hash}`);
    }
  } catch (error) {
    console.error("stock: TopUp website thumbnails unavailable", error);
  }
  return logos;
}

/** The stored logo of one game, as listStockGameLogos picks it: GameInfo's icon, else the website's thumbnail. */
export async function getStockGameLogo(gameId) {
  const { imageUrl } = await getGamelistImage(gameId);
  if (imageUrl) return imageUrl;
  const { topupGameId } = await getGamelistGameSettings(gameId);
  return getTopupWebGameThumbnail(topupGameId);
}
