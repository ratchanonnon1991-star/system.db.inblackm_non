// Bringing website data into GameInfo, always one way and always on an
// admin's say-so: linking games in bulk, creating GameInfo games for website
// games it does not have yet, and filling a linked game's empty fields.
// Nothing here overwrites what an admin already entered.
import { createGameListRow } from "@/server/gameinfo-gamelist";
import { getGamelistImage, saveGamelistImage } from "@/server/gameinfo-gamelist-image";
import { getGamelistTags, saveGamelistTags } from "@/server/gameinfo-gamelist-tags";
import { recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";
import { getGamelistGameSettings, listGamelistGameSettings, saveGamelistGameSettings } from "@/server/gameinfo-game-settings";
import { getTopupWebGameAssets, listTopupWebGames } from "@/server/gameinfo-topup-web";

const MAX_BATCH = 100;
// GameInfo keeps at most 10 categories per game.
const MAX_TAGS = 10;

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function requireWebGames() {
  const games = await listTopupWebGames();
  if (!games) throw createHttpError("ยังไม่ได้เชื่อมฐานข้อมูลเว็บ TopUp (connection topup_web)", 503);
  return new Map(games.map((game) => [game.id, game]));
}

function webTags(assets) {
  return [...new Set(assets.tags)].slice(0, MAX_TAGS);
}

/** Saves many game → website links at once. Returns how many were saved and which were refused. */
export async function linkGamesToTopupWeb(links, actor = null) {
  if (!Array.isArray(links) || !links.length) throw createHttpError("ยังไม่ได้เลือกคู่ที่จะเชื่อม", 400);
  if (links.length > MAX_BATCH) throw createHttpError(`เชื่อมได้ครั้งละไม่เกิน ${MAX_BATCH} เกม`, 400);
  const webGames = await requireWebGames();
  const saved = [];
  const failed = [];
  for (const link of links) {
    const gameId = Number(link?.gameId);
    const topupGameId = link?.topupGameId ? String(link.topupGameId) : null;
    if (!Number.isInteger(gameId) || (topupGameId && !webGames.has(topupGameId))) {
      failed.push({ gameId: link?.gameId ?? null, error: "ไม่พบเกมบนเว็บนี้" });
      continue;
    }
    try {
      await saveGamelistGameSettings(gameId, { topupGameId }, actor);
      saved.push({ gameId, topupGameId });
    } catch (error) {
      failed.push({ gameId, error: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" });
    }
  }
  return { saved, failed };
}

/** Creates a GameInfo game for each website game (name, image, categories, link). Packs are added later in the editor. */
export async function importTopupWebGames(topupGameIds, actor = null) {
  if (!Array.isArray(topupGameIds) || !topupGameIds.length) throw createHttpError("ยังไม่ได้เลือกเกมที่จะนำเข้า", 400);
  if (topupGameIds.length > MAX_BATCH) throw createHttpError(`นำเข้าได้ครั้งละไม่เกิน ${MAX_BATCH} เกม`, 400);
  const webGames = await requireWebGames();
  // A website game already linked to a GameInfo game is not created twice.
  const linked = new Set(Object.values(await listGamelistGameSettings()).map((item) => item.topupGameId).filter(Boolean));
  const created = [];
  const failed = [];
  for (const rawId of topupGameIds) {
    const topupGameId = String(rawId ?? "");
    if (!webGames.has(topupGameId)) {
      failed.push({ topupGameId, error: "ไม่พบเกมบนเว็บนี้" });
      continue;
    }
    if (linked.has(topupGameId)) {
      failed.push({ topupGameId, error: "เกมนี้เชื่อมกับเกมใน GameInfo อยู่แล้ว" });
      continue;
    }
    try {
      const assets = await getTopupWebGameAssets(topupGameId);
      const row = await createGameListRow({ game: assets.name, vpn: "NO" }, actor);
      await saveGamelistGameSettings(row.id, { topupGameId }, actor);
      // The image and categories are a head start; failing them must not
      // undo a game that now exists, so they are attempted separately.
      const extras = [];
      if (assets.thumbnail) {
        await saveGamelistImage(row.id, assets.thumbnail).then(() => extras.push("image"), () => {});
      }
      const tags = webTags(assets);
      if (tags.length) await saveGamelistTags(row.id, tags).then(() => extras.push("tags"), () => {});
      await recordGameinfoAudit({ gameId: row.id, area: "topup-import", action: "create", actor, after: { topupGameId, filled: extras } });
      linked.add(topupGameId);
      created.push({ gameId: row.id, game: row.game, topupGameId, filled: extras });
    } catch (error) {
      failed.push({ topupGameId, error: error instanceof Error ? error.message : "นำเข้าไม่สำเร็จ" });
    }
  }
  return { created, failed };
}

/** What a linked game could take from the website right now: only fields GameInfo has left empty. */
export async function previewTopupWebFill(gameId) {
  const { topupGameId } = await getGamelistGameSettings(gameId);
  if (!topupGameId) return null;
  const [assets, image, tags] = await Promise.all([
    getTopupWebGameAssets(topupGameId),
    getGamelistImage(gameId),
    getGamelistTags(gameId),
  ]);
  if (!assets) return null;
  return {
    image: !image.imageUrl && Boolean(assets.thumbnail),
    tags: !tags.length && webTags(assets).length ? webTags(assets) : [],
  };
}

/** Fills the chosen empty fields from the website. A field that has a value by now is left alone. */
export async function fillGameFromTopupWeb(gameId, { image = false, tags = false } = {}, actor = null) {
  const { topupGameId } = await getGamelistGameSettings(gameId);
  if (!topupGameId) throw createHttpError("เกมนี้ยังไม่ได้เชื่อมกับเกมบนเว็บ", 400);
  const assets = await getTopupWebGameAssets(topupGameId);
  if (!assets) throw createHttpError("ไม่พบเกมนี้บนเว็บแล้ว", 404);
  const filled = [];
  if (image && assets.thumbnail && !(await getGamelistImage(gameId)).imageUrl) {
    await saveGamelistImage(gameId, assets.thumbnail);
    filled.push("image");
  }
  const current = await getGamelistTags(gameId);
  if (tags && webTags(assets).length && !current.length) {
    await saveGamelistTags(gameId, webTags(assets));
    filled.push("tags");
  }
  if (filled.length) {
    await recordGameinfoAudit({ gameId, area: "topup-import", action: "fill", actor, after: { topupGameId, filled } });
  }
  return { filled };
}
