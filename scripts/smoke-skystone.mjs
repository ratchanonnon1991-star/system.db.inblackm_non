// Explicit manual smoke only; not included in CI and never writes to the DB.
import { fetchSkystoneCatalog } from "../src/server/gameinfo-skystone-catalog.js";

const packs = await fetchSkystoneCatalog({ source_url: "https://topup.games.skystone.games", project_id: "754024", country: "US", locale: "en" });
console.log(JSON.stringify({ game: "CRYSTAL OF ATLAN", country: "US", count: packs.length, names: packs.map((pack) => pack.name) }, null, 2));
