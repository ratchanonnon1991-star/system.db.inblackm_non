import { listGameListRows } from "@/server/gameinfo-gamelist";
import {
  listGamelistChannelsByGame,
  listGamelistPackCountByGame,
  listGamelistVpnByGame,
} from "@/server/gameinfo-gamelist-packs";
import { listGamelistTutorialPresence } from "@/server/gameinfo-gamelist-tutorial";
import { listGamelistImageByGame } from "@/server/gameinfo-gamelist-image";

// One projection powers both /gameinfo and the embedded GameInfo mode in the
// System DB game_list panel. Keeping the joins here prevents the two screens
// from slowly acquiring different channel/VPN/image/tutorial behaviour.
export function decorateGameinfoGamelistRows(
  rows,
  { channelsByGame, vpnByGame, packCountByGame, tutorialPresence, imageByGame }
) {
  return rows.map((row) => ({
    ...row,
    channels: channelsByGame[row.id] || { main: [], secondary: [] },
    vpnComputed: vpnByGame[row.id] ? "YES" : "NO",
    packCount: packCountByGame[row.id] || 0,
    hasTutorial: Boolean(tutorialPresence[row.id]),
    image: imageByGame[row.id] || "",
  }));
}

export async function listGameinfoGamelistRows() {
  const [rows, channelsByGame, vpnByGame, packCountByGame, tutorialPresence, imageByGame] =
    await Promise.all([
      listGameListRows(),
      listGamelistChannelsByGame(),
      listGamelistVpnByGame(),
      listGamelistPackCountByGame(),
      listGamelistTutorialPresence(),
      listGamelistImageByGame(),
    ]);

  return decorateGameinfoGamelistRows(rows, {
    channelsByGame,
    vpnByGame,
    packCountByGame,
    tutorialPresence,
    imageByGame,
  });
}
