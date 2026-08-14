import {
  GAMELIST_EXPORT_HEADERS,
  GAMELIST_HEADERS,
  gameListRowsToCsvRows,
  parseGameListCsvRows,
} from "@/lib/gameinfo-gamelist-csv.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

const row = (over = {}) => ({
  game: "Game A",
  region: "TH",
  platform: "Mobile",
  server: "Asia",
  bot_manual: "Manual",
  link: "https://example.com",
  ...over,
});

check("template exposes game as the first column", GAMELIST_HEADERS[0], "game");

const parsed = parseGameListCsvRows([row()]);
check("valid CSV row is converted to API field names", parsed.rows[0], {
  game: "Game A",
  region: "TH",
  platform: "Mobile",
  server: "Asia",
  botManual: "Manual",
  link: "https://example.com",
});
check("valid CSV row has no errors", parsed.errors, []);
check(
  "only fields visible/editable in GameInfo are accepted by the parser contract",
  GAMELIST_HEADERS,
  ["game", "region", "platform", "server", "bot_manual", "link"]
);
check(
  "duplicate against an existing game is rejected case-insensitively",
  parseGameListCsvRows([row()], ["game a"]).errors.length,
  1
);
check(
  "duplicate names inside the same file are rejected",
  parseGameListCsvRows([row(), row({ region: "US" })]).rows.length,
  1
);
check("missing game is rejected", parseGameListCsvRows([row({ game: "" })]).errors.length, 1);
check(
  "latest-list export includes id plus only the displayed editable fields",
  GAMELIST_EXPORT_HEADERS,
  ["id", "game", "region", "platform", "server", "bot_manual", "link"]
);
check("fully blank CSV rows are ignored", parseGameListCsvRows([row(Object.fromEntries(GAMELIST_HEADERS.map((h) => [h, ""]))) ]), { rows: [], errors: [] });
check(
  "latest-list export maps camelCase rows back to CSV headers",
  gameListRowsToCsvRows([{ id: 7, game: "A", region: "TH", platform: "", server: "", botManual: "Bot", link: "" }])[0],
  { id: "7", game: "A", region: "TH", platform: "", server: "", bot_manual: "Bot", link: "" }
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
