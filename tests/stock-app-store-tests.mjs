// Picking a game's App Store icon from Apple's search results.
import assert from "node:assert/strict";
import { appStoreKey, appStoreSearchUrl, pickAppStoreIcon } from "../src/lib/stock-app-store.js";

let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed += 1; };
const app = (trackId, trackName, genre = "Games", artworkUrl512 = `https://is1-ssl.mzstatic.com/${trackId}.jpg`, userRatingCount = 100) =>
  ({ trackId, trackName, primaryGenreName: genre, genres: [genre], artworkUrl512, userRatingCount });

check(pickAppStoreIcon("FC MOBILE", [app(1, "FC Mobile Guide", "Reference"), app(8, "RenderZ: FC Mobile Database", "Games", undefined, 81),
  app(2, "EA SPORTS FC™ Football Mobile", "Games", undefined, 374702)])?.appId === "2", "the most-rated game with every word wins; ™ is ignored");
check(pickAppStoreIcon("Moonlight", [app(9, "Moonlight Game Streaming", "Games", undefined, 26), app(10, "Garena Moonlight Blade M", "Games", undefined, 8040)])?.appId === "10", "a shared word goes to the game people play");
check(pickAppStoreIcon("Pokémon GO", [app(11, "Pokémon Masters EX"), app(12, "Golf Go")]) === null, "every word must be a whole word of the name");
check(pickAppStoreIcon("Honkai Star Rail", [app(3, "Honkai: Star Rail")])?.artworkUrl.endsWith("/3.jpg"), "punctuation does not matter");
check(pickAppStoreIcon("Pokémon GO", [app(4, "Pokemon GO")])?.appId === "4", "accents do not matter");
check(pickAppStoreIcon("Moonlight", [app(5, "Sky: Children of the Light")]) === null, "a game that does not hold the name is not guessed");
check(pickAppStoreIcon("Delta Force", [app(6, "Delta Force", "Games", "http://x/6.jpg")]) === null, "only an https icon");
check(pickAppStoreIcon("ab", [app(7, "ab")]) === null, "too short a name is not looked up");
check(appStoreKey("Honkai: Star Rail") === appStoreKey("honkai star rail"), "one cache key per game name");
check(appStoreSearchUrl("Diablo Immortal", "th") === "https://itunes.apple.com/search?term=Diablo+Immortal&entity=software&country=th&limit=10", "the search URL");
console.log(`${passed} passed`);
