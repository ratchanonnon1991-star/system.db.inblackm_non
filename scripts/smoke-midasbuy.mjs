// Explicit manual smoke only; not included in CI and never writes to the DB.
import { fetchMidasbuyCatalog } from "../src/server/gameinfo-midasbuy-catalog.js";

const packs = await fetchMidasbuyCatalog({ project_id: "1460000285", country: "TH", locale: "en" });
console.log(JSON.stringify({ game: "NIKKE", country: "TH", count: packs.length, names: packs.map((pack) => pack.name) }, null, 2));
