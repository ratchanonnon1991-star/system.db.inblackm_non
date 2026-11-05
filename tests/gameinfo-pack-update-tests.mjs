import assert from "node:assert/strict";
import {
  gameinfoPackUpdateSource,
  mockGameinfoPackUpdates,
  packUpdateBotResult,
  packUpdateGate,
  packUpdateNeedsWork,
  summarizePackUpdate,
} from "@/lib/gameinfo-pack-update";

const rows = Array.from({ length: 40 }, (_, index) => ({ id: index + 1, game: `Game ${index + 1}`, image: `/img/${index + 1}.png`, priority: index % 4 }));
const packsByGame = Object.fromEntries(rows.slice(0, 30).map((row) => [row.id, Array.from({ length: 8 }, (_, index) => ({ id: `p${row.id}-${index}`, name: `${(index + 1) * 60} Diamonds`, price: String((index + 1) * 25) }))]));

// Every game is listed, with its own name, image and priority, the same way every time.
const games = mockGameinfoPackUpdates(rows, packsByGame);
assert.deepEqual(mockGameinfoPackUpdates(rows, packsByGame), games);
assert.equal(games.length, rows.length);
for (const game of games) {
  const row = rows.find((item) => item.id === game.gameId);
  assert.equal(game.name, row.game);
  assert.equal(game.image, row.image);
  assert.equal(game.priority, [4, 3, 2, 1][row.priority]);
  assert.equal(game.packTotal, (packsByGame[row.id] || []).length);
  assert.ok(game.packs.length > 0, "every game has at least one change");
  assert.equal(game.newCount, game.packs.filter((pack) => pack.type === "new").length);
}

// Changed and removed packs are the game's real ones, at their real price.
const real = new Map(Object.values(packsByGame).flat().map((pack) => [pack.id, pack]));
const touched = games.flatMap((game) => game.packs).filter((pack) => pack.type !== "new");
assert.ok(touched.length > 0);
for (const pack of touched) {
  const source = real.get(pack.sourceId);
  assert.ok(source);
  assert.equal(pack.label, source.name);
  assert.equal(pack.old, Number(source.price));
  if (pack.type === "changed") assert.notEqual(pack.pg2, pack.old);
  else assert.equal(pack.pg2, null);
}
// New packs follow the largest pack ("480 Diamonds" → "960 Diamonds").
assert.ok(games.flatMap((game) => game.packs).some((pack) => pack.type === "new" && pack.label === "960 Diamonds"));
// A game without packs still gets new ones.
assert.ok(games.filter((game) => !game.packTotal).every((game) => game.packs.every((pack) => pack.type === "new")));
assert.equal(new Set(games.flatMap((game) => game.packs.map((pack) => pack.id))).size, games.reduce((n, game) => n + game.packs.length, 0));

assert.deepEqual(
  gameinfoPackUpdateSource([{ categories: [{ packs: [{ id: "a", name: "60 Gems", price: "29" }, { id: "b", name: "", price: "" }] }] }]),
  [{ id: "a", name: "60 Gems", price: "29" }],
);

// The bot and the rules before an import.
assert.equal(packUpdateBotResult({ type: "removed", web: 9, pg2: null }), "gone");
assert.equal(packUpdateBotResult({ type: "new", web: 9, pg2: 9 }), "ok");
assert.equal(packUpdateBotResult({ type: "changed", web: 19, pg2: 9 }), "bad");
assert.equal(packUpdateNeedsWork({ type: "removed", human: false }), true);
assert.equal(packUpdateNeedsWork({ type: "removed", human: true, bot: "gone" }), false);

const packs = [
  { type: "new", bot: "ok", human: true, editedBy: null },
  { type: "changed", bot: "ok", human: true, editedBy: "A" },
  { type: "removed", bot: "gone", human: true, editedBy: null },
];
assert.deepEqual(summarizePackUpdate(packs, "A"), { total: 3, ok: 2, bad: 0, gone: 1, wait: 0, human: 3, self: 1, new: 1, changed: 1, removed: 1 });
assert.deepEqual(packUpdateGate(packs, "A").map((rule) => rule.ok), [true, true, true, false]);
assert.ok(packUpdateGate(packs, "B").every((rule) => rule.ok));
const unchecked = [{ type: "new", bot: null, human: false }, { type: "new", bot: "bad", human: false }];
assert.deepEqual(packUpdateGate(unchecked, "B").map((rule) => rule.ok), [false, false, false, true]);
