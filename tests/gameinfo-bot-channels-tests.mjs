import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INITIAL_GAMEINFO_BOT_CHANNELS,
  createGameinfoBotChannel,
  listGameinfoBotChannels,
  normalizeGameinfoBotChannel,
  updateGameinfoBotChannel,
} from "@/server/gameinfo-bot-channels.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

check("seed contains the ten requested channels", () => {
  assert.equal(INITIAL_GAMEINFO_BOT_CHANNELS.length, 10);
  assert.equal(INITIAL_GAMEINFO_BOT_CHANNELS.find((item) => item.channelName === "Codashop").currencies[2].games[3], "Nico");
  assert.equal(INITIAL_GAMEINFO_BOT_CHANNELS.find((item) => item.channelName === "Ronshop").imageUrl, "");
  assert.ok(!JSON.stringify(INITIAL_GAMEINFO_BOT_CHANNELS).includes("(?)"));
});

check("normalizer trims and preserves nested order", () => {
  assert.deepEqual(normalizeGameinfoBotChannel({
    category: " bot ",
    channelName: " Multi   Game Card ",
    currencies: [{ name: " CAD ", games: [" Game A ", "Game   B"] }],
  }), {
    category: "BOT",
    channelName: "Multi Game Card",
    imageUrl: "",
    currencies: [{ name: "CAD", games: ["Game A", "Game B"] }],
  });
});

check("normalizer accepts channel images and rejects non-image values", () => {
  const input = { category: "BOT", channelName: "Shop", currencies: [{ name: "", games: ["Game"] }] };
  assert.equal(normalizeGameinfoBotChannel({ ...input, imageUrl: " data:image/png;base64,AA== " }).imageUrl, "data:image/png;base64,AA==");
  assert.throws(() => normalizeGameinfoBotChannel({ ...input, imageUrl: "javascript:alert(1)" }), /URL หรือไฟล์รูปภาพ/);
});

check("normalizer rejects duplicate games", () => {
  assert.throws(() => normalizeGameinfoBotChannel({
    category: "API",
    channelName: "Shop",
    currencies: [{ name: "", games: ["Zepeto", " zepeto "] }],
  }), /ชื่อเกม Zepeto ซ้ำ/i);
});

check("normalizer rejects duplicate currencies within one channel", () => {
  assert.throws(() => normalizeGameinfoBotChannel({
    category: "BOT",
    channelName: "Razer",
    currencies: [
      { name: "CAD", games: ["Game A"] },
      { name: " cad ", games: ["Game B"] },
    ],
  }), /สกุลเงิน cad ซ้ำ/i);
});

reset();
setResponder((text) => {
  if (/COUNT\(\*\).*gameinfo_bot_channels/.test(text)) return { rows: [{ count: 0 }] };
  if (/FROM gameinfo_bot_channels\s+ORDER BY/.test(text)) return { rows: [] };
  return null;
});
await listGameinfoBotChannels();
check("runtime schema seeds only after an empty-table check", () => {
  assert.equal(log.filter((entry) => /INSERT INTO gameinfo_bot_channels/.test(entry.text)).length, 10);
  assert.ok(log.some((entry) => /CREATE UNIQUE INDEX IF NOT EXISTS gameinfo_bot_channels_category_name/.test(entry.text)));
});

reset();
setResponder((text, params) => /INSERT INTO gameinfo_bot_channels.*RETURNING/s.test(text)
  ? { rows: [{ id: 11, category: params[0], channel_name: params[1], currencies: JSON.parse(params[2]), sort_order: 5 }] }
  : null);
const created = await createGameinfoBotChannel({
  category: "API",
  channelName: "New Shop",
  currencies: [{ name: "", games: ["New Game"] }],
});
check("create returns the stored channel", () => assert.deepEqual(created.currencies, [{ name: "", games: ["New Game"] }]));

reset();
await assert.rejects(
  updateGameinfoBotChannel(999, { category: "BOT", channelName: "Missing", currencies: [{ name: "THB", games: ["Game"] }] }),
  (error) => error.status === 404
);
pass += 1;

check("navigation link is directly below Bot Auto", () => {
  const source = readFileSync(new URL("../src/components/gameinfo-gamelist-cards.js", import.meta.url), "utf8");
  assert.match(source, /Bot Auto[\s\S]{0,700}game-bot-auto/);
  assert.match(source, /topupView \? "\?view=topup"/);
});

check("bootstrap schema includes the separate table", () => {
  const source = readFileSync(new URL("../db-init/004-schema-topup-inblackm.sql", import.meta.url), "utf8");
  assert.match(source, /CREATE TABLE IF NOT EXISTS gameinfo_bot_channels/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS image_url/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS gameinfo_bot_category_images/);
  assert.match(source, /WHERE NOT EXISTS \(SELECT 1 FROM gameinfo_bot_channels\)/);
});

check("API reads require GameInfo access and writes require admin access", () => {
  const collection = readFileSync(new URL("../src/app/api/gameinfo/game-bot-auto/route.js", import.meta.url), "utf8");
  const item = readFileSync(new URL("../src/app/api/gameinfo/game-bot-auto/[id]/route.js", import.meta.url), "utf8");
  assert.match(collection, /GET[\s\S]*requireGameinfoAccess/);
  assert.match(collection, /POST[\s\S]*requireGameinfoEditor/);
  assert.match(item, /PUT[\s\S]*requireGameinfoEditor/);
});

check("Topup view stays inside Game Bot Auto and hides editor controls", () => {
  const toggle = readFileSync(new URL("../src/components/gameinfo-mode-toggle.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/gameinfo/[lang]/game-bot-auto/page.js", import.meta.url), "utf8");
  assert.match(toggle, /game-bot-auto\?view=topup/);
  assert.match(toggle, /if \(isBotAutoPage\) return topupButton/);
  assert.match(page, /query\.view !== "topup"/);
});

console.log(`\n${pass} passed`);
