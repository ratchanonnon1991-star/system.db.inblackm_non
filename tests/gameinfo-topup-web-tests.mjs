import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { confidentNameMatch, gameinfoPackMatchKey, matchTopupWebPackages, missingTopupWebPacks, rankTopupWebGames, regroupByTopupWebCategories, topupWebPackCategories, topupWebPackImageFills } from "../src/lib/gameinfo-topup-match.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

const webGames = [
  { id: "honkai-star-rail", name: "Honkai: Star Rail (GL)" },
  { id: "honkai-impact-3-eu-na", name: "Honkai Impact 3 (EU/NA)" },
  { id: "honkai-impact-3", name: "Honkai Impact 3 (ASIA)" },
  { id: "free-fire", name: "Free Fire (TH)" },
];
check(rankTopupWebGames("HONKAI IMPACT", "ASIA", webGames)[0].id === "honkai-impact-3", "the region picks the right regional copy");
check(!rankTopupWebGames("HONKAI IMPACT", "ASIA", webGames).some((game) => game.id === "free-fire"), "games sharing no word are not suggested");
check(rankTopupWebGames("", "", webGames).length === 0, "an empty name suggests nothing");

check(gameinfoPackMatchKey("6,600 B-Chips × 2") === gameinfoPackMatchKey("6600 B-Chips X 2"), "thousands separators and × match the website's spelling");
check(gameinfoPackMatchKey("65 B-Chips") !== gameinfoPackMatchKey("65 Crystal"), "different currencies never match");
const matched = matchTopupWebPackages(["330 B-Chips", "Monthly Card"], [{ id: "1", label: "330 B-Chips" }, { id: "2", label: "Other", amountDisplay: "" }]);
check(matched.get("330 B-Chips")?.id === "1", "a pack matches its website package by name");
check(matched.get("Monthly Card") === null, "an unmatched pack stays unmatched");

check(confidentNameMatch("HONKAI IMPACT", webGames)?.id === "honkai-impact-3-eu-na" || confidentNameMatch("HONKAI IMPACT", webGames)?.id === "honkai-impact-3", "a confident match is pre-picked");
check(confidentNameMatch("ROV", webGames) === null, "a weak match is not pre-picked");

const webPackages = [
  { label: "65 B-Chips", price: 15, priceIdpass: null, isActive: true, uidActive: true, idpassActive: false },
  { label: "330 B-Chips", price: 75, priceIdpass: 80, isActive: true, uidActive: false, idpassActive: true },
  { label: "Monthly Card", price: 120, priceIdpass: null, isActive: true, uidActive: true, idpassActive: true },
];
const missingUid = missingTopupWebPacks(webPackages, ["65 B-Chips"], "uid");
check(missingUid.map((pack) => pack.name).join() === "330 B-Chips,Monthly Card", "packs GameInfo already has are not offered again");
check(missingUid[0].active === false, "a package closed for UID comes in closed");
check(missingTopupWebPacks(webPackages, [], "idpass").map((pack) => pack.name).join() === "330 B-Chips", "ID-PASS only offers packages with an ID-PASS price");

const withIcons = [
  { label: "65 B-Chips", image: "/api/gameinfo/topup-web/package-icon/1?v=a" },
  { label: "330 B-Chips", image: "" },
  { label: "Monthly Card", image: "https://cdn.example/card.png", price: 120, isActive: true, uidActive: true },
];
const imageFills = topupWebPackImageFills(withIcons, [
  { id: "p1", name: "65 B-Chips", image: "" },
  { id: "p2", name: "330 B-Chips", image: "" },
  { id: "p3", name: "Monthly Card", image: "data:image/png;base64,AAA" },
]);
check(imageFills.length === 1 && imageFills[0].packId === "p1", "only packs with no picture get one, and only when the website has one");
check(missingTopupWebPacks(withIcons, [], "uid").find((pack) => pack.name === "Monthly Card").image === "https://cdn.example/card.png", "a new pack brings its website picture");
const topupWebSource = read("../src/server/gameinfo-topup-web.js");
check(topupWebSource.includes("to_jsonb(p) - 'icon'") && topupWebSource.includes("md5(to_jsonb(p)->>'icon')"), "package icons travel as versioned links, never as the base64 itself");

const importer = read("../src/server/gameinfo-topup-import.js");
check(importer.includes("!(await getGamelistImage(gameId)).imageUrl") && importer.includes("!current.length"), "filling never overwrites an image or categories already set");
check(importer.includes("linked.has(topupGameId)"), "a website game already linked is never imported twice");
check(importer.includes("if (!gameinfoHasRealPacks(current.currencies))") && importer.includes("if (!gameinfoHasRealPacks(current.packs?.currencies))"), "website packs are only written into a mode that has no real packs (an empty placeholder does not count)");
check(importer.includes("expectedVersion: current.version") && importer.includes("computedColumns: current.computedColumns"), "writing packs keeps the game's formula columns and refuses a concurrent edit");

const topupWeb = read("../src/server/gameinfo-topup-web.js");
check(!/\b(INSERT|UPDATE|DELETE)\b/.test(topupWeb), "GameInfo only ever reads the website database");
check(topupWeb.includes('"topup_web"'), "the website is reached through its own named connection");

const settings = read("../src/server/gameinfo-game-settings.js");
check(settings.includes("encryptSecret(password)"), "test passwords are stored encrypted");
check(settings.includes('action: "reveal"'), "every password reveal is audited");
check(!settings.includes("password_enc,\n") || settings.includes("hasPassword: Boolean(row.password_enc)"), "lists carry only whether a password is set");
const listRoute = read("../src/app/api/gameinfo/gamelist/[id]/test-accounts/route.js");
check(listRoute.includes("canManageGameinfo(user) ? accounts : accounts.map(maskGamelistTestAccount)"), "readers who cannot manage see masked logins");
const revealRoute = read("../src/app/api/gameinfo/gamelist/[id]/test-accounts/[accountId]/reveal/route.js");
check(revealRoute.includes("requireGameinfoEditor") && revealRoute.includes("export async function POST"), "reveal is editor-only and never a GET");

// Website categories: packs go where the website shows them.
const ladsWeb = [
  { label: "60 Crystals", amountDisplay: "60 Crystals", category: "Crystals" },
  { label: "300 + 30 Crystals", amountDisplay: "330 Crystals", category: "Crystals" },
  { label: "Aurum Pass", amountDisplay: "Aurum Pass", category: "Aurum Pass" },
  { label: "Gentle Sip Pack VI", amountDisplay: "Account Limit 1/1", category: "แพ็กเกจจำกัดเวลา" },
  { label: "Cozy Home Pack I", amountDisplay: "Account Limit 1/1", category: "Home" },
];
const ladsCategories = topupWebPackCategories(["300 + 30 Crystals", "Gentle Sip Pack VI X 10", "Account Limit 1/1", "Mystery"], ladsWeb);
check(ladsCategories.get("300 + 30 Crystals") === "Crystals", "a pack takes its website package's category");
check(ladsCategories.get("Gentle Sip Pack VI X 10") === "แพ็กเกจจำกัดเวลา", "a pack bought several times goes with its base pack");
check(ladsCategories.get("Account Limit 1/1") === "", "a shown amount shared by several categories decides nothing");
check(ladsCategories.get("Mystery") === "", "a pack the website lacks has no category");

let regroupIds = 0;
const regrouped = regroupByTopupWebCategories([{
  id: "c1",
  name: "",
  categories: [
    { id: "cat-web", name: "เพิ่มจากเว็บ TopUp", packs: [{ id: "p1", name: "Aurum Pass" }, { id: "p2", name: "300 + 30 Crystals" }, { id: "p3", name: "Mystery" }] },
    { id: "cat-crystals", name: "Crystals", packs: [{ id: "p4", name: "60 Crystals" }, { id: "p5", name: "Old Crystal Bundle" }] },
    { id: "cat-empty", name: "ว่างอยู่แล้ว", packs: [] },
  ],
}], ladsWeb, () => `new-${(regroupIds += 1)}`);
const regroupedCategories = regrouped.currencies[0].categories;
check(regroupedCategories.map((category) => category.name).join("|") === "Crystals|Aurum Pass|เพิ่มจากเว็บ TopUp|ว่างอยู่แล้ว", "categories follow the website's order, leftovers after");
check(regroupedCategories[0].id === "cat-crystals" && regroupedCategories[0].packs.map((pack) => pack.id).join() === "p4,p2,p5", "an existing category of the same name keeps its id; packs in the website's order, its own extras last");
check(regroupedCategories[1].id === "new-1", "a missing website category is made");
check(regroupedCategories[2].packs.map((pack) => pack.id).join() === "p3", "a pack the website lacks stays where it was");
check(regroupedCategories[3].packs.length === 0, "a category that was already empty is left alone");
check(regrouped.matched === 3 && regrouped.unmatched === 2 && regrouped.moved === 2, "the plan counts what moves");
const allWeb = regroupByTopupWebCategories([{ id: "c1", categories: [{ id: "x", name: "เพิ่มจากเว็บ TopUp", packs: [{ id: "a", name: "Aurum Pass" }] }] }], ladsWeb, () => "n");
check(allWeb.currencies[0].categories.map((category) => category.name).join() === "Aurum Pass", "a category emptied by the move goes");

console.log(`${passed} passed`);
