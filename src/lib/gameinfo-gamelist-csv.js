const text = (value) => String(value ?? "").trim();

export const GAMELIST_HEADERS = ["game", "region", "platform", "server", "bot_manual", "link"];
export const GAMELIST_EXPORT_HEADERS = ["id", ...GAMELIST_HEADERS];
export const GAMELIST_SAMPLE = [
  {
    game: "ตัวอย่างเกม",
    region: "TH",
    platform: "Mobile",
    server: "Asia",
    bot_manual: "Manual",
    link: "https://example.com",
  },
];

export function parseGameListCsvRows(rows, existingGames = []) {
  const parsedRows = [];
  const errors = [];
  const seen = new Set(existingGames.map((name) => text(name).toLocaleLowerCase("th")));
  rows.forEach((row, index) => {
    if (!Object.values(row).some((value) => text(value))) return;
    const line = index + 2;
    const game = text(row.game);
    if (!game) {
      errors.push(`แถวที่ ${line}: ไม่มีชื่อเกม`);
      return;
    }
    const key = game.toLocaleLowerCase("th");
    if (seen.has(key)) {
      errors.push(`แถวที่ ${line}: ชื่อเกม "${game}" ซ้ำกับเกมที่มีอยู่หรือแถวก่อนหน้า`);
      return;
    }
    seen.add(key);
    parsedRows.push({
      game,
      region: text(row.region),
      platform: text(row.platform),
      server: text(row.server),
      botManual: text(row.bot_manual),
      link: text(row.link),
    });
  });
  return { rows: parsedRows, errors };
}

export function gameListRowsToCsvRows(rows) {
  return rows.map((row) => ({
    id: String(row.id),
    game: row.game || "",
    region: row.region || "",
    platform: row.platform || "",
    server: row.server || "",
    bot_manual: row.botManual || "",
    link: row.link || "",
  }));
}
