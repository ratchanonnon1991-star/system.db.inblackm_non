import { getGameListRow, updateGameListRow, withGameinfoTransaction } from "@/server/gameinfo-gamelist";
import { getGamelistPacks, saveGamelistPacks } from "@/server/gameinfo-gamelist-packs";
import { getGamelistTutorial, getGamelistWarning, saveGamelistTutorial, saveGamelistWarning } from "@/server/gameinfo-gamelist-tutorial";
import { getGamelistLinks, legacyGamelistLinks, saveGamelistLinks } from "@/server/gameinfo-gamelist-links";
import { getGameinfoModeData, saveGameinfoModeData } from "@/server/gameinfo-mode-data";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";

async function readUid(gameId) {
  const [game, packs, tutorial, warning, storedLinks] = await Promise.all([
    getGameListRow(gameId),
    getGamelistPacks(gameId),
    getGamelistTutorial(gameId),
    getGamelistWarning(gameId),
    getGamelistLinks(gameId),
  ]);
  if (!game) {
    const error = new Error("ไม่พบเกม");
    error.status = 404;
    throw error;
  }
  return {
    fields: {
      region: game.region,
      platform: game.platform,
      server: game.server,
      botManual: game.botManual,
    },
    links: storedLinks.exists ? storedLinks.links : legacyGamelistLinks(game.link),
    tutorial,
    warning,
    packs,
  };
}

async function writeUid(gameId, data, scope, actor, client) {
  if (scope === "all") {
    await updateGameListRow(gameId, data.fields, client);
    await saveGamelistLinks(gameId, data.links, client);
    await saveGamelistTutorial(gameId, data.tutorial.categories, client);
    await saveGamelistWarning(gameId, data.warning.categories, client);
  }
  await saveGamelistPacks(gameId, {
    ...data.packs,
    actor,
    source: "mode_clone",
  }, client);
}

export async function cloneGameinfoDataMode({ gameId, sourceMode, targetMode, scope = "all", actor }) {
  const source = normalizeGameinfoDataMode(sourceMode);
  const target = normalizeGameinfoDataMode(targetMode);
  if (source === target) {
    const error = new Error("ต้นทางและปลายทางต้องเป็นคนละชุดข้อมูล");
    error.status = 400;
    throw error;
  }
  const sourceData = source === "uid" ? await readUid(gameId) : await getGameinfoModeData(gameId, source);
  if (target === "uid") {
    await withGameinfoTransaction((client) => writeUid(gameId, sourceData, scope, actor, client));
  } else {
    const current = await getGameinfoModeData(gameId, target);
    await saveGameinfoModeData(gameId, target, scope === "packs" ? { ...current, packs: sourceData.packs } : sourceData);
  }
  return { sourceMode: source, targetMode: target, scope };
}
