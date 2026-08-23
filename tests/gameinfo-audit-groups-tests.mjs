import { groupGameinfoPackAudit } from "@/lib/gameinfo-audit-groups.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

const grouped = groupGameinfoPackAudit([
  { id: 3, gameId: 1, gameName: "A", packId: "p1", actorName: "Ann", action: "update", before: { name: "Old" }, createdAt: "2026-01-03" },
  { id: 2, gameId: 1, gameName: "A", packId: "p1", actorName: "Bob", action: "create", after: { name: "Old" }, createdAt: "2026-01-02" },
  { id: 1, gameId: 2, gameName: "B", packId: null, actorName: "Ann", action: "config_update", createdAt: "2026-01-01" },
]);
check("audit groups entries by game", grouped.map((game) => game.gameName), ["A", "B"]);
check("audit groups the same pack and keeps distinct actors", grouped[0].packs[0].actors, ["Ann", "Bob"]);
check("deleted/updated pack name falls back to before data", grouped[0].packs[0].packName, "Old");
check("config events have their own category", grouped[1].packs[0].packName, "การตั้งค่าและนำเข้ารวม");

const allAreas = groupGameinfoPackAudit([
  { id: 5, gameId: 1, gameName: "A", packId: "p1", area: "pack", actorName: "Ann", action: "update", after: { name: "P" } },
  { id: 4, gameId: 1, gameName: "A", area: "tutorial", actorName: "Ann", action: "update" },
  { id: 3, gameId: 1, gameName: "A", area: "tutorial", actorName: "Bob", action: "update" },
  { id: 2, gameId: 1, gameName: "A", area: "warning", actorName: "Ann", action: "update" },
  { id: 1, gameId: 1, gameName: "A", area: "group", actorName: "Ann", action: "update" },
]);
check("all history separates each edited area", allAreas[0].packs.map((item) => item.packName), ["P", "Tutorial", "ข้อควรระวัง", "สกุลเงิน / หมวดหมู่"]);
check("same area keeps every event", allAreas[0].packs[1].entries.length, 2);
check("same area keeps distinct actors", allAreas[0].packs[1].actors, ["Ann", "Bob"]);
check("area is exposed to the history UI", allAreas[0].packs[3].area, "group");

const modes = groupGameinfoPackAudit([
  { id: 2, gameId: 1, packId: "p1", area: "pack", dataMode: "idpass", after: { name: "P" } },
  { id: 1, gameId: 1, packId: "p1", area: "pack", dataMode: "uid", after: { name: "P" } },
]);
check("history retains every data mode", modes[0].packs[0].dataModes, ["idpass", "uid"]);

const legacy = groupGameinfoPackAudit([{ id: 1, gameId: 1, packId: "p1", after: { name: "Legacy" } }]);
check("legacy rows remain pack history", legacy[0].packs[0].area, "pack");

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
