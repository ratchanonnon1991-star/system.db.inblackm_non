import assert from "node:assert/strict";
import { matchBotBalances, shownBalance } from "../src/lib/inventory-bot-balances.js";

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`ok ${name}`); };
const at = "2026-11-04T05:00:00.000Z";
const ch = (provider, id, label, currency, balance = "10.00") => ({ key: `${provider}:${id}`, provider, label, currency, balance, balanceAt: at });
const channels = [
  ch("razer", "SGD:a@x.com", "Razer a@x.com", "SGD", "12.50"),
  ch("wavepay", "09111180888", "WavePay 09111180888", "MMK", "250000"),
  ch("netease", "pay1", "(USD) Netease Pay 1", "USD"),
  ch("garena-shell", "inblackrb2c", "InblackShell1 (InblackRB2c)", "Shell", "300"),
  ch("gamepoint", "MYR", "Gamepoint", "MYR", "88.10"),
  ch("donshop", "IDR", "Donshop", "IDR", null),
];
const acc = (id, provider, label, currency, accountKey = `${provider}:x`) => ({ id, provider, label, currency, accountKey });

check("each kind of bot wallet finds its registry account", () => {
  const m = matchBotBalances([
    acc("1", "razer", "a@x.com", "SGD", "razer:SGD:a@x.com"),
    acc("2", "wavepay", "WAVEPAY 1 (80888)", "MMK"),
    acc("3", "netease", "( USD ) Netease Pay 1", "USD"),
    acc("4", "channel", "InblackShell1 (InblackRB2c)", "Shell"),
    acc("5", "gamepoint", "(MYR) gamepoint", "MYR"),
  ], channels);
  assert.deepEqual([...m].map(([id, b]) => [id, b.balance, b.source]), [
    ["1", "12.50", "razer"], ["2", "250000", "wavepay"], ["3", "10.00", "netease"], ["4", "300", "garena-shell"], ["5", "88.10", "gamepoint"]]);
});

check("no guess: other currency, unknown balance, sheet-only accounts stay unmatched", () => {
  const m = matchBotBalances([
    acc("6", "netease", "( JPY ) Netease Pay 1", "JPY"),
    acc("7", "donshop", "(IDR) Donshop", "IDR"),
    acc("8", "channel", "Moniepoint NP 1 8184", "NGN"),
    acc("9", "wavepay", "WAVEPAY 9 (99999)", "MMK"),
  ], channels);
  assert.equal(m.size, 0);
});

check("shown balance: the bot reading, unless a person set the balance after it", () => {
  const bot = { balance: "10", balanceAt: "2026-11-04T05:00:00.000Z" };
  assert.equal(shownBalance({ bot, balance: "7", balanceSnapshotAt: "2026-11-01T00:00:00.000Z" }).source, "bot");
  assert.deepEqual(shownBalance({ bot, balance: "7", balanceSnapshotAt: "2026-11-04T06:00:00.000Z" }), { source: "ledger", balance: "7", at: "2026-11-04T06:00:00.000Z" });
  assert.equal(shownBalance({ bot: null, balance: null }), null);
});
console.log(`${passed} passed`);
