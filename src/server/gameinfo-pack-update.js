import { gameinfoPackUpdateSource } from "@/lib/gameinfo-pack-update";
import { listGamelistPackPricesByGame } from "@/server/gameinfo-gamelist-packs";
import { listGameinfoModeData } from "@/server/gameinfo-mode-data";

/** Each game's current packs (id, name, price) in the mode, for Pack Update. */
export async function listGameinfoPackUpdatePacks(dataMode) {
  if (dataMode !== "idpass") return listGamelistPackPricesByGame();
  const modeData = await listGameinfoModeData("idpass");
  return Object.fromEntries(Object.entries(modeData).map(([gameId, data]) => [gameId, gameinfoPackUpdateSource(data?.packs?.currencies)]));
}
