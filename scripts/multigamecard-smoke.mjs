// Actual client with HTTP mocks. No application database or provider connection.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { mgcCsv, mgcSummary } from "../src/lib/multigamecard-inventory.js";
import { sheetFigures } from "../src/lib/usdcodashop-sheet.js";
const require = createRequire(import.meta.url), { webpack } = require("next/dist/compiled/webpack/webpack");
const root = process.cwd(), output = await mkdtemp(path.join(tmpdir(), "mgc-inventory-"));
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: "development", devtool: false, entry: path.join(root, "tests/ui/multigamecard-entry.jsx"), output: { path: output, filename: "preview.js" },
    plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "development" }) })],
    resolve: { alias: { "next/link$": path.join(root, "tests/ui/usdcodashop-link.js"), "@": path.join(root, "src") }, extensions: [".js", ".jsx", ".mjs"] },
    module: { rules: [{ test: /\.m?jsx?$/, resolve: { fullySpecified: false } }, { test: /\.jsx?$/, exclude: /node_modules/, use: path.join(root, "tests/ui/usdcodashop-loader.cjs") }] },
  });
  compiler.run((error, stats) => compiler.close(() => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
async function cssFiles(dir) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) files.push(...await cssFiles(file)); else if (item.name.endsWith(".css")) files.push(await readFile(file, "utf8"));
  }
  return files;
}
const css = (await cssFiles(path.join(root, ".next/static"))).join("\n"), bundle = await readFile(path.join(output, "preview.js"));
const server = createServer((req, res) => {
  if (req.url === "/preview.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle); }
  else { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div data-theme="light" class="min-h-screen bg-ll-canvas"><div id="root"></div></div><script src="/preview.js"></script></body></html>`); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [375, 1536]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 }, reducedMotion: "reduce" });
    await page.clock.install({ time: new Date("2026-10-18T08:00:00Z") });
    let offline = false, viewer = false, posts = 0, reads = 0;
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    const manualCards = [], manualEntries = [];
    const botCards = [{ id: "BOT01", serial: "BOT01", owner: "Bot", enabled: true, inTotal: null, outTotal: "51000.00", balance: "49000.00", status: "เศษ", balanceAt: "2026-10-18T07:00:00Z" }];
    const botEntries = [{ id: "99", serial: "BOT01", kind: "use", orderId: "K-BOT", amount: "1000.00", balance: "49000.00", occurredAt: "2026-10-18T07:00:00Z", details: { game: "Oxide", pack: "Coins", saleThb: "30", costThb: "20", invoice: "TX-BOT" }, recordedBy: "Bot" }];
    botEntries[0].figures = sheetFigures(botEntries[0].details);
    await page.route("**/api/projectm/multigamecard**", async route => {
      if (offline) return route.fulfill({ status: 503, json: { error: "ทดสอบเชื่อมต่อไม่ได้" } });
      const p = new URL(route.request().url()).searchParams;
      if (route.request().method() === "GET") {
        reads++;
        const mode = p.get("mode"), source = mode === "bot" ? botEntries : manualEntries;
        const entries = source.filter(e => (!p.get("serial") || p.get("serial") === e.serial) && (!p.get("search") || e.orderId.includes(p.get("search"))));
        if (p.get("format") === "csv") return route.fulfill({ contentType: "text/csv; charset=utf-8", body: mgcCsv(entries) });
        return route.fulfill({ json: { mode, canManage: !viewer, cards: mode === "bot" ? botCards : manualCards, entries, total: entries.length, page: 1, pageSize: 100, summary: mgcSummary(entries) } });
      }
      posts++;
      const body = route.request().postDataJSON(); assert.match(body.requestId, /^[0-9a-f-]{36}$/);
      let card;
      if (body.action === "card") {
        assert.equal(body.serial, "MANUAL01");
        card = { id: "1", serial: body.serial, owner: body.owner, enabled: true, inTotal: "100000.00", outTotal: "0.00", balance: "100000.00", status: "ปกติ" }; manualCards.push(card);
      } else card = manualCards[0];
      const isUse = body.action === "use";
      if (isUse) { card.outTotal = "50001.00"; card.balance = "49999.00"; card.status = "เศษ"; }
      const details = { note: body.note, saleThb: body.saleThb || null, costThb: body.costThb || null, game: body.game || "", invoice: body.invoice || "" };
      manualEntries.push({ id: String(posts), serial: card.serial, kind: isUse ? "use" : "opening", orderId: body.orderId || "ยอดยกมา", amount: body.amount, balance: card.balance, occurredAt: "2026-10-18T08:00:00Z", details,
        figures: isUse ? sheetFigures(details) : { sale: null, cost: null, profit: null, margin: null }, recordedBy: "Tester" });
      return route.fulfill({ status: 201, json: { id: String(posts) } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator("[data-theme]").evaluate((el, value) => el.dataset.theme = value, theme);
    await page.getByText("K-BOT", { exact: true }).waitFor();
    assert.equal(posts, 0);
    await page.getByRole("button", { name: "Manual", exact: true }).click();
    await page.getByRole("button", { name: "เพิ่มบัตร Manual", exact: true }).click();
    const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "เพิ่มบัตร Manual", exact: true }) });
    await form.getByLabel("Serial", { exact: true }).fill("MANUAL01");
    await form.getByLabel("ผู้ใช้งานบัตร", { exact: true }).fill("Staff");
    await form.getByLabel("ยอดยกมา (แต้ม)", { exact: true }).fill("100000");
    await form.getByLabel("หมายเหตุ / อ้างอิง", { exact: true }).fill("verified opening");
    const beforeWait = reads; await page.clock.fastForward(60001); assert.equal(reads, beforeWait);
    await form.getByRole("button", { name: "ยืนยันบันทึก", exact: true }).click();
    await page.getByText("100,000.00", { exact: true }).first().waitFor(); assert.equal(posts, 1);
    await page.getByRole("button", { name: "บันทึกใช้บัตร", exact: true }).click();
    const useForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "บันทึกใช้บัตร", exact: true }) });
    await useForm.getByLabel("จำนวนแต้ม", { exact: true }).fill("50001");
    await useForm.getByLabel("Order ID", { exact: true }).fill("K-MANUAL");
    await useForm.getByLabel("ยอดโอน (THB)", { exact: true }).fill("50");
    await useForm.getByLabel("ต้นทุน (THB)", { exact: true }).fill("30");
    await useForm.getByLabel("หมายเหตุ / อ้างอิง", { exact: true }).fill("real use");
    await useForm.getByRole("button", { name: "ยืนยันบันทึก", exact: true }).click();
    await page.getByText("K-MANUAL", { exact: true }).waitFor(); assert.equal(posts, 2);
    const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    const csv = await readFile(await (await downloadPromise).path(), "utf8"); assert.ok(csv.includes("K-MANUAL")); assert.ok(!csv.includes("K-BOT"));
    const overflow = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth, nodes: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth).slice(0,18).map(e => ({ tag: e.tagName, classes: e.className, text:e.textContent.slice(0,35), right: e.getBoundingClientRect().right, overflow: getComputedStyle(e).overflowX, parentOverflow:getComputedStyle(e.parentElement).overflowX })) }));
    await page.screenshot({ path: path.join(output, `check-${width}-${theme}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, JSON.stringify({ output, overflow }));
    await page.screenshot({ path: path.join(output, `manual-${width}-${theme}.png`), fullPage: true });
    viewer = true; await page.getByRole("button", { name: "โหลดใหม่", exact: true }).click();
    await page.getByText("ดูประวัติได้ แต่ต้องมีสิทธิ์ Projectm Admin", { exact: false }).waitFor();
    assert.equal(await page.getByRole("button", { name: "บันทึกใช้บัตร", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Bot", exact: true }).click(); await page.getByText("K-BOT", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `bot-${width}-${theme}.png`), fullPage: true });
    offline = true;
    await page.getByRole("textbox", { name: "ค้นหา Order / Serial / เกม / ลูกค้า", exact: true }).fill("new-filter");
    await page.getByRole("button", { name: "ใช้ตัวกรอง", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "ทดสอบเชื่อมต่อไม่ได้" }).waitFor();
    assert.equal(await page.getByText("K-BOT", { exact: true }).count(), 0, "no stale rows under failed new filter");
    assert.equal(await page.getByRole("button", { name: "Export CSV", exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []); await page.close();
  }
  console.log(`PASS: MGC actual client, Bot/Manual separation, manual forms, CSV, readonly viewer, paused refresh, stale failure, mobile/desktop light/dark. Screenshots: ${output}`);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
