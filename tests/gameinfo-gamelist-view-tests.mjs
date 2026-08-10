import { decorateGameinfoGamelistRows } from "@/server/gameinfo-gamelist-view.js";

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

const rows = decorateGameinfoGamelistRows(
  [
    { id: 1, game: "Alpha" },
    { id: 2, game: "Beta" },
  ],
  {
    channelsByGame: { 1: { main: ["Coda"], secondary: ["Manual"] } },
    vpnByGame: { 1: true },
    packCountByGame: { 1: 3 },
    tutorialPresence: { 1: true },
    imageByGame: { 1: "/alpha.png" },
  }
);

check("decorates the row with GameInfo side-table data", rows[0], {
  id: 1,
  game: "Alpha",
  channels: { main: ["Coda"], secondary: ["Manual"] },
  vpnComputed: "YES",
  packCount: 3,
  hasTutorial: true,
  image: "/alpha.png",
});

check("uses safe display defaults when side-table data is absent", rows[1], {
  id: 2,
  game: "Beta",
  channels: { main: [], secondary: [] },
  vpnComputed: "NO",
  packCount: 0,
  hasTutorial: false,
  image: "",
});

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
if (failures.length) process.exit(1);
