export function groupGameinfoPackAudit(entries) {
  const games = new Map();
  for (const entry of entries || []) {
    const gameId = String(entry.gameId);
    if (!games.has(gameId)) {
      games.set(gameId, { gameId: entry.gameId, gameName: entry.gameName || `Game ID ${gameId}`, packs: new Map() });
    }
    const game = games.get(gameId);
    const packKey = entry.packId ? String(entry.packId) : "__config__";
    if (!game.packs.has(packKey)) {
      game.packs.set(packKey, {
        packId: entry.packId || null,
        packName: auditPackName(entry),
        actors: new Set(),
        actions: new Set(),
        latestAt: entry.createdAt,
        entries: [],
      });
    }
    const pack = game.packs.get(packKey);
    if ((!pack.packName || pack.packName.startsWith("Pack ID")) && auditPackName(entry)) {
      pack.packName = auditPackName(entry);
    }
    if (entry.actorName) pack.actors.add(entry.actorName);
    if (entry.action) pack.actions.add(entry.action);
    pack.entries.push(entry);
  }
  return [...games.values()].map((game) => ({
    gameId: game.gameId,
    gameName: game.gameName,
    packs: [...game.packs.values()].map((pack) => ({
      ...pack,
      actors: [...pack.actors],
      actions: [...pack.actions],
    })),
  }));
}

function auditPackName(entry) {
  if (!entry.packId) return "การตั้งค่าและนำเข้ารวม";
  return (
    entry.after?.name ||
    entry.before?.name ||
    entry.after?.sourcePackId ||
    entry.before?.sourcePackId ||
    `Pack ID ${entry.packId}`
  );
}
