import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gameinfoPackMatchKey, matchTopupWebPackages, rankTopupWebGames } from "../src/lib/gameinfo-topup-match.js";

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

console.log(`${passed} passed`);
