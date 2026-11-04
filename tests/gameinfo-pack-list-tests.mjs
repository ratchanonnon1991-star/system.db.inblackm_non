import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildGameinfoPackListRows,
  filterGameinfoPackListRows,
  gameinfoListNumber,
  gameinfoMarginTone,
  gameinfoPackListColumns,
  gameinfoPackListStatusTab,
  summarizeGameinfoPackList,
} from "@/lib/gameinfo-pack-list";
import { gameinfoCountryThaiName } from "@/lib/gameinfo-countries";

const computed = (key, label, formula) => ({ id: `computed:${key}`, kind: "computed", label, computed: { key, label, formula } });
const columns = [
  { id: "name", kind: "base", label: "ชื่อ pack", field: "name" },
  computed("cost", "ต้นทุน", "[ราคา] * 0.7"),
  computed("kaleoz", "ราคาขาย(KALEOZ)", "[ราคา] + 5"),
  computed("itemku", "Itemku (IDR)", "[ราคา] * 500"),
];

const found = gameinfoPackListColumns(columns);
assert.equal(found.cost.id, "computed:cost", "the cost column is found by its name");
assert.deepEqual(found.channels.map((channel) => channel.key), ["page", "kaleoz"], "only channels whose price column exists are offered");

const currency = {
  id: "c",
  categories: [
    { id: "crystal", name: "CRYSTAL", packs: [{ id: "a", name: "60 Crystals", price: "20" }, { id: "b", name: "300 Crystals", price: "100" }] },
    { id: "pass", name: "PASS", packs: [{ id: "p", name: "Pass", price: "" }] },
  ],
};
const { rows, channels, costColumn } = buildGameinfoPackListRows(currency, columns, {}, {});
assert.equal(costColumn.id, "computed:cost");
assert.equal(rows.length, 3);
const first = rows[0];
assert.ok(Math.abs(first.cost - 14) < 1e-9, "cost comes from the ต้นทุน column");
assert.ok(Math.abs(first.channels.page.profit - 6) < 1e-9, "profit is the channel price less cost");
assert.ok(Math.abs(first.channels.page.margin - 30) < 1e-9, "margin is profit over the channel price");
assert.ok(Math.abs(first.channels.kaleoz.price - 25) < 1e-9, "a channel's price comes from its column");
assert.equal(rows[2].channels.page.price, null, "a pack without a price has no figures");
assert.equal(rows[2].channels.page.margin, null);
assert.deepEqual(channels.map((channel) => channel.key), ["page", "kaleoz"]);

assert.deepEqual(filterGameinfoPackListRows(rows, { chip: "pass" }).map((row) => row.pack.id), ["p"], "a category chip keeps its packs");
assert.deepEqual(filterGameinfoPackListRows(rows, { query: "300" }).map((row) => row.pack.id), ["b"], "search matches the pack name");
assert.deepEqual(filterGameinfoPackListRows(rows, { sort: "price" }).map((row) => row.pack.id), ["a", "b", "p"], "packs without a price sort last");

const tabbed = [
  { ...rows[0], status: "open", auto: true },
  { ...rows[1], status: "new", auto: false },
  { ...rows[2], status: "expired", auto: true },
];
assert.deepEqual(tabbed.map(gameinfoPackListStatusTab), ["active", "new", "expired"]);
assert.deepEqual(filterGameinfoPackListRows(tabbed, { status: "new" }).map((row) => row.pack.id), ["b"], "the status tab keeps its packs");
assert.deepEqual(filterGameinfoPackListRows(tabbed, { chip: "bot" }).map((row) => row.pack.id), ["a", "p"], "the Bot Auto chip keeps the bot's packs");
assert.equal(gameinfoPackListStatusTab({ status: "closed" }), "closed");
assert.deepEqual(filterGameinfoPackListRows([{ ...rows[0], status: "closed" }, ...tabbed], { status: "closed" }).map((row) => row.pack.id), ["a"], "a closed pack has its own tab");

const summary = summarizeGameinfoPackList(rows, "page");
assert.equal(summary.count, 2, "only priced packs count");
assert.ok(Math.abs(summary.average - 30) < 1e-9);
assert.equal(summary.low, 0);

assert.equal(gameinfoMarginTone(25), "green");
assert.equal(gameinfoMarginTone(12), "amber");
assert.equal(gameinfoMarginTone(4), "red");
assert.equal(gameinfoMarginTone(null), "");
assert.equal(gameinfoListNumber("236155 X 2"), null, "a multiplied amount is text, not a number");
assert.equal(gameinfoListNumber("1,250"), 1250);

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const view = read("../src/components/gameinfo-game-view.js");
const list = read("../src/components/gameinfo-pack-list.js");
assert.ok(view.includes('useState("list")') && view.includes("ตารางเต็ม"), "the list is the default and the full table is one switch away");
assert.ok(list.includes('event.target.closest("a, button, input")'), "a row click leaves its links and buttons alone");
assert.ok(list.includes("aria-expanded={open}"), "each row's details open from a real button");

const editor = read("../src/components/gameinfo-pack-editor.js");
const detailPage = read("../src/components/gameinfo-game-detail-page.js");
assert.ok(view.includes("ระวัง แก้ไขแล้วบอทเติมตามทันที") && view.includes("botAuto={isGameinfoBotAuto(row.botManual)}") && editor.includes("botManual={game.botManual}") && detailPage.includes("botManual: row.botManual,"), "Bot Auto games warn about prices on the game page and in the pack editor");

assert.equal(gameinfoCountryThaiName("Myanmar"), "เมียนมา", "the list heading names the country in Thai");
assert.equal(gameinfoCountryThaiName("Somewhere"), "Somewhere", "an unknown country stays as stored");

const gate = read("../src/components/gameinfo-edit-gate.js");
const toggle = read("../src/components/gameinfo-mode-toggle.js");
const notices = read("../src/components/gameinfo-notice-chain.js");
assert.ok(toggle.includes("if (isGamePage && !isManageMode) return null;"), "a game page has one way into editing, on its card");
assert.ok(gate.includes("const stillHere = acknowledgedHere && (firstPageShown || pageWasReloaded());"), "the CEO's notice on every arrival at a game's page, not on a refresh of it");
assert.ok(gate.includes("if (readSession(ACK_TAB_KEY)) return;"), "the edit page shows it only to a tab that has not acknowledged it");
assert.ok(detailPage.includes("<GameinfoEditGate") && detailPage.includes("backHref={viewHref}"), "the edit page shows the notice, and its way back is the game's page");
assert.ok(notices.includes("gd-ceo-hint") && notices.includes("gd-hs-ok"), "the picture's own button acknowledges it, with the hint underneath");
assert.ok(notices.includes("stored?.day === today()") && notices.includes('"/gameinfo/ceo-notice.webp"'), "each notice once a day, the CEO's from its picture");

assert.ok(editor.includes("GAMEINFO_PACK_LIST_STATUS_TABS.map") && editor.includes('statusTab === "all" || gameinfoPackListStatusTab({ status: gameinfoPackStatus(pack) }) === statusTab'), "the editor has the game page's status tabs and filters by them");

assert.ok(editor.includes("if (!changed(p)) continue;") && editor.includes('setStatusTab("all");'), "saving checks only the packs added or changed, and shows every pack when one needs filling in");

assert.ok(list.includes('const grouped = sort === "default";'), "filtered packs keep their category headings");

assert.ok(list.includes('aria-label="หมวดหมู่แพ็ค"') && list.includes('categoryTab === "all" ? rows'), "categories are tabs over the list, all or one at a time");

assert.ok(editor.includes("function moveSelectedPacks(target)") && editor.includes("<MovePacksBar"), "ticked packs can move to another or a new category");

console.log("43 passed");
