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

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
