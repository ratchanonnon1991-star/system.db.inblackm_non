export const AUDIT_AREA_LABELS = {
  pack: "Pack",
  group: "สกุลเงิน / หมวดหมู่",
  game: "ข้อมูลเกม",
  tutorial: "Tutorial",
  warning: "ข้อควรระวัง",
  links: "ลิงก์",
  variables: "สูตรและตัวแปร",
  status: "สถานะบริการ",
  import: "นำเข้าข้อมูล",
  clone: "คัดลอกชุดข้อมูล",
  image: "รูปเกม",
  tags: "Tags",
  publishers: "ค่ายเกม",
  order: "ลำดับเกม",
  settings: "ตั้งค่าส่วนกลาง",
};

export function auditAreaLabel(area) {
  return AUDIT_AREA_LABELS[area] || area || "อื่น ๆ";
}

export function groupGameinfoPackAudit(entries) {
  const games = new Map();
  for (const entry of entries || []) {
    const gameId = String(entry.gameId);
    if (!games.has(gameId)) {
      games.set(gameId, { gameId: entry.gameId, gameName: entry.gameName || `Game ID ${gameId}`, packs: new Map() });
    }
    const game = games.get(gameId);
    const area = entry.area || "pack";
    const packKey = area === "pack"
      ? entry.packId ? String(entry.packId) : "__config__"
      : `__area__${area}`;
    if (!game.packs.has(packKey)) {
      game.packs.set(packKey, {
        packId: entry.packId || null,
        area,
        packName: auditPackName(entry),
        actors: new Set(),
        actions: new Set(),
        dataModes: new Set(),
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
    if (entry.dataMode) pack.dataModes.add(entry.dataMode);
    pack.entries.push(entry);
  }
  return [...games.values()].map((game) => ({
    gameId: game.gameId,
    gameName: game.gameName,
    packs: [...game.packs.values()].map((pack) => ({
      ...pack,
      actors: [...pack.actors],
      actions: [...pack.actions],
      dataModes: [...pack.dataModes],
    })),
  }));
}

function auditPackName(entry) {
  const area = entry.area || "pack";
  if (area !== "pack") return auditAreaLabel(area);
  if (!entry.packId) return "การตั้งค่าและนำเข้ารวม";
  return (
    entry.after?.name ||
    entry.before?.name ||
    entry.after?.sourcePackId ||
    entry.before?.sourcePackId ||
    `Pack ID ${entry.packId}`
  );
}
