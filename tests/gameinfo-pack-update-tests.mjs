import assert from "node:assert/strict";
import {
  mockGameinfoPackUpdates,
  packUpdateBotResult,
  packUpdateGate,
  packUpdateNeedsWork,
  summarizePackUpdate,
} from "@/lib/gameinfo-pack-update";

const rows = Array.from({ length: 40 }, (_, index) => ({ id: index + 1, game: `Game ${index + 1}`, image: `/img/${index + 1}.png`, priority: index % 4 }));

// The same rows give the same updates (server render and browser agree).
const first = mockGameinfoPackUpdates(rows);
assert.deepEqual(mockGameinfoPackUpdates(rows), first);

// GameInfo's games keep their own name and image; the new ones have none.
const existing = first.filter((game) => game.gameId);
assert.ok(existing.length > 0 && existing.length <= 14);
for (const game of existing) {
  const row = rows.find((item) => item.id === game.gameId);
  assert.equal(game.name, row.game);
  assert.equal(game.image, row.image);
  if (row.priority >= 3) assert.equal(game.priority, 1);
}
const fresh = first.filter((game) => !game.gameId);
assert.ok(fresh.length > 0);
assert.ok(fresh.every((game) => game.image === "" && game.packs.every((pack) => pack.type === "new")));
assert.ok(first.every((game) => game.packs.filter((pack) => pack.type === "new").length === game.newCount));
assert.equal(new Set(first.flatMap((game) => game.packs.map((pack) => pack.id))).size, first.reduce((n, game) => n + game.packs.length, 0));

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
