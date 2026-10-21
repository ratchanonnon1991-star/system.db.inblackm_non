// Renders the actual client with mocked HTTP, never application databases.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { codaReportCsv, codaDateBounds } from "../src/lib/usdcodashop-report.js";
import { codaCurrentCostFigures } from "../src/lib/usdcodashop-cost.js";
import { codaQuickDates } from "../src/lib/usdcodashop-overview.js";
import { codaProfitFilter } from "../src/lib/usdcodashop-profit-filter.js";
const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const root = process.cwd(); const output = await mkdtemp(path.join(tmpdir(), "coda-ledger-"));
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: "development", devtool: false, entry: path.join(root, "tests/ui/usdcodashop-ledger-entry.jsx"), output: { path: output, filename: "preview.js" },
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
    if (item.isDirectory()) files.push(...await cssFiles(file));
    else if (item.name.endsWith(".css")) files.push(await readFile(file, "utf8"));
  }
  return files;
}
const css = (await cssFiles(path.join(root, ".next/static"))).join("\n"); const bundle = await readFile(path.join(output, "preview.js"));
const server = createServer((request, response) => {
  if (request.url === "/preview.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle); }
  else { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div data-theme="light" class="min-h-screen bg-ll-canvas"><div id="root"></div></div><script src="/preview.js"></script></body></html>`); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [375, 1536]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 }, reducedMotion: "reduce" });
    await page.clock.install({ time: new Date("2026-10-17T08:00:00Z") });
    let configured = false; let canManage = true; let offline = false; let entries = []; let deposits = "0.00";
    let missingBalance = false;
    let currentCostRate = "32.54";
    let exportedProfit;
    let reads = 0; let autoSync = { state: "ok", heartbeat: new Date().toISOString(), last_success: new Date().toISOString() };
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/projectm/usdcodashop/ledger**", async (route) => {
      if (offline) return route.fulfill({ status: 503, json: { error: "จำลองเชื่อมต่อไม่สำเร็จ" } });
      if (route.request().method() === "GET") {
        reads++;
        const params = new URL(route.request().url()).searchParams;
        const search = params.get("search");
        const bounds = codaDateBounds({ dateFrom: params.get("dateFrom"), dateTo: params.get("dateTo") });
        const kind = params.get("kind") || "all";
        const profit = codaProfitFilter(Object.fromEntries(params));
        const costQuote = kind !== "deposit" && currentCostRate ? { currency: "USD", rate: currentCostRate, source: "TestCost", rateAt: "2026-10-16T00:00:00Z", fetchedAt: "2026-10-17T08:00:00Z" } : null;
        const filtered = entries.filter((e) => (kind === "all" || e.kind === kind) && (!search || e.orderId.includes(search)) && (!bounds.start || new Date(e.occurredAt) >= new Date(bounds.start)) && (!bounds.end || new Date(e.occurredAt) < new Date(bounds.end))).map((e) => ({ ...e,
          fills: e.fills?.map((f) => ({ ...f, figures: codaCurrentCostFigures({ ...f, kind: "order" }, costQuote) })),
          balance: missingBalance ? null : e.balance,
          figures: codaCurrentCostFigures(e, costQuote), details: { ...e.details, costConversion: e.kind === "order" ? costQuote : null },
        })).filter((e) => {
          if (profit.profitStatus === "all" && !profit.profitMin && !profit.profitMax) return true;
          if (e.kind !== "order") return false;
          const value = profit.profitUnit === "percent" ? e.figures.margin : e.figures.profit;
          const n = value == null ? null : Number(value);
          const matches = ({ all: true, profit: n != null && n > 0, loss: n != null && n < 0,
            breakeven: n === 0, missing: n == null })[profit.profitStatus];
          return matches && (!profit.profitMin || n != null && n >= Number(profit.profitMin))
            && (!profit.profitMax || n != null && n <= Number(profit.profitMax));
        });
        const orders = filtered.filter((e) => e.kind === "order");
        const figures = orders.map((e) => e.figures);
        const sum = (key) => figures.reduce((total, f) => total + Number(f[key]), 0).toFixed(2);
        const missingSales = figures.filter((f) => f.sale == null).length;
        const missingCosts = figures.filter((f) => f.cost == null).length;
        const summary = { orders: orders.length, deposits: filtered.length - orders.length, sale: missingSales ? null : sum("sale"), cost: missingCosts ? null : sum("cost"), profit: missingSales || missingCosts ? null : sum("profit"), missingSales, missingCosts, duplicateOrders: orders.filter((e) => e.orderDuplicate).length, duplicateTransactions: orders.filter((e) => e.transactionDuplicate).length, depositUsd: filtered.filter((e) => e.kind === "deposit").reduce((n, e) => n + Number(e.amount), 0).toFixed(2) };
        if (params.get("format") === "csv") { exportedProfit = profit; return route.fulfill({ contentType: "text/csv; charset=utf-8", body: codaReportCsv(filtered) }); }
        return route.fulfill({ json: { configured, canManage, autoSync, costQuote, summary, entries: filtered, boundary: "K7306171", opening: "9373.17", deposits, used: entries.length ? "3.70" : "0.00", remaining: entries.length && !missingBalance ? "9397.75" : null, calculatedRemaining: entries.length ? (9369.47 + Number(deposits)).toFixed(2) : "9373.17", balanceAsOf: entries[0]?.occurredAt || null, balanceOrderId: entries[0]?.orderId || null, total: filtered.length, lastSync: configured ? "2026-10-15T13:16:11Z" : null } });
      }
      const body = route.request().postDataJSON();
      if (body.action === "setup") { assert.equal(body.confirm, true); assert.equal(body.opening, "9373.17"); configured = true; return route.fulfill({ json: { configured: true } }); }
      if (body.action === "sync") {
        const added = entries.length ? 0 : 1;
        const previousDeposits = entries.filter((e) => e.kind === "deposit");
        entries = [{ id: "1", kind: "order", orderId: "K7306274", amount: "3.70", balance: "9397.75", calculatedBalance: "9369.47", occurredAt: "2026-10-15T13:16:11Z", details: { game: "Zepeto", pack: "7 Zems", paymentMethod: "CodashopUSD", invoice: "TX123", providerBalance: "9397.75", operator: "Bot", saleThb: "147.25", costThb: "120.398", customer: "Test buyer", playerId: "uid1", link: "https://example.com/order/1" }, recordedBy: "khong" }, ...previousDeposits];
        entries[0].fillCount = 2;
        entries[0].fills = [1, 2].map((n) => ({ id: `fill-${n}`, sourceId: String(100 + n), amount: "1.85", occurredAt: "2026-10-15T13:16:11Z", balance: n === 2 ? "9397.75" : "9399.60", details: { game: "Zepeto", pack: "7 Zems", saleThb: n === 1 ? "73.63" : "73.62", invoice: `FILL-TX-${n}` } }));
        entries[0].details = { ...entries[0].details, saleNative: "5", saleCurrency: "USDT", saleConversion: {
          currency: "USDT", rate: "29.45", source: "TestProvider", capturedAt: "2026-10-17T07:00:00Z", rateAt: "2026-10-17T06:00:00Z",
        } };
        return route.fulfill({ json: { added, checked: 1 } });
      }
      if (body.action === "deposit") {
        assert.equal(body.amount, "100.10"); assert.equal(body.note, "receipt123"); assert.match(body.requestId, /^[0-9a-f-]{36}$/);
        deposits = "100.10";
        entries.push({ id: "2", kind: "deposit", orderId: "เติมเงิน", amount: "100.10", balance: null, occurredAt: "2026-10-15T13:17:11Z", details: { note: body.note }, recordedBy: "khong" });
        return route.fulfill({ json: { id: "2" } });
      }
      throw new Error("Unexpected mutation");
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator("[data-theme]").evaluate((e, t) => { e.dataset.theme = t; }, theme);
    await page.getByRole("heading", { name: "เริ่มบัญชี USDCodashop" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "ยืนยันเริ่มบัญชี" }).isDisabled(), true);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "ยืนยันเริ่มบัญชี" }).click();
    await page.getByRole("button", { name: "ซิงก์ Orders", exact: true }).waitFor();
    await page.getByText("ซิงก์อัตโนมัติทุก 60 วินาที · ทำงานปกติ", { exact: true }).waitFor();
    await page.getByRole("button", { name: "ซิงก์ Orders", exact: true }).click();
    const orderButton = () => page.getByRole("button", { name: "ดูรายละเอียด Order K7306274", exact: true });
    await orderButton().waitFor();
    if (width >= 768) {
      assert.equal(await page.getByRole("columnheader").count(), 8);
      await page.getByRole("columnheader", { name: "USD ออก", exact: true }).waitFor();
    }
    assert.equal(await page.getByRole("table").first().getByText("3.70", { exact: true }).count(), 1, "USD debit is visible without expanding details");
    await page.getByRole("table").first().getByText("26.85", { exact: true }).waitFor();
    await page.getByRole("table").first().getByText("18.23%", { exact: true }).waitFor();
    assert.equal(await page.getByRole("region", { name: "สรุปยอด", exact: true }).getByText("147.25", { exact: true }).count(), 1);
    await orderButton().click();
    const detail = page.getByRole("region", { name: "รายละเอียด Order K7306274", exact: true });
    await detail.getByText("Test buyer", { exact: true }).waitFor();
    await detail.getByText("รายการเติมย่อย (2)", { exact: true }).waitFor();
    await detail.getByText(/คิว 101/).waitFor(); await detail.getByText(/คิว 102/).waitFor();
    await detail.getByText("เรทที่ใช้", { exact: true }).click();
    await detail.getByText("5 USDT × 29.45 THB", { exact: true }).waitFor();
    await detail.getByText("เรทอ้างอิง ณ ซิงก์ครั้งแรก ไม่ใช่เรทรับเงินจริงย้อนหลัง", { exact: true }).waitFor();
    assert.equal(await detail.getByText("3.70", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("link", { name: "เปิดรายการต้นทาง", exact: true }).getAttribute("href"), "https://example.com/order/1");
    await page.getByRole("button", { name: "ซ่อนรายละเอียด Order K7306274", exact: true }).click();
    await page.getByRole("button", { name: "ซิงก์ Orders", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "เพิ่ม 0 รายการ" }).waitFor();
    assert.equal(await orderButton().count(), 1);
    await page.getByRole("button", { name: "บันทึก USD เข้า", exact: true }).click();
    await page.getByRole("textbox", { name: "จำนวน USD", exact: true }).waitFor();
    const beforeFormWait = reads;
    await page.clock.fastForward(60_001);
    assert.equal(reads, beforeFormWait, "do not refresh while entering a deposit");
    await page.getByRole("textbox", { name: "จำนวน USD", exact: true }).fill("100.10");
    await page.getByRole("textbox", { name: "หมายเหตุ/เลขอ้างอิง", exact: true }).fill("receipt123");
    await page.getByRole("button", { name: "ยืนยันบันทึก USD เข้า", exact: true }).click();
    await page.getByRole("heading", { name: "บันทึก USD ที่เข้าบัญชีจริงแล้ว" }).waitFor({ state: "detached" });
    await page.getByText("รายละเอียดบัญชีและวิธีคำนวณ", { exact: true }).click();
    await page.getByText("คงเหลือตามบัญชี (ตรวจสอบ): 9,469.57 USD", { exact: false }).waitFor();
    await page.getByText("รายละเอียดบัญชีและวิธีคำนวณ", { exact: true }).click();
    assert.equal(await page.getByRole("region", { name: "สรุปยอด", exact: true }).getByText("9,397.75", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("table").first().getByText("9,397.75", { exact: true }).count(), 1);
    await page.getByRole("textbox", { name: "ค้นหา Order / เกม / แพ็ก / ผู้ทำรายการ" }).fill("not-found");
    await page.getByRole("button", { name: "ใช้ตัวกรอง", exact: true }).click();
    await page.getByText("ไม่พบรายการตามตัวกรอง", { exact: true }).filter({ visible: true }).waitFor();
    assert.equal(await page.getByRole("region", { name: "สรุปยอด", exact: true }).getByText("9,397.75", { exact: true }).count(), 1);
    await page.getByRole("textbox", { name: "ค้นหา Order / เกม / แพ็ก / ผู้ทำรายการ" }).fill("");
    await page.getByRole("button", { name: "ใช้ตัวกรอง", exact: true }).click();
    await orderButton().waitFor();
    await page.getByLabel("กรองตาม", { exact: true }).selectOption("day");
    await page.getByLabel("วันที่", { exact: true }).fill("2026-10-16");
    await page.getByRole("button", { name: "ใช้ตัวกรอง", exact: true }).click();
    await page.getByText("ไม่พบรายการตามตัวกรอง", { exact: true }).filter({ visible: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Export CSV", exact: true }).isDisabled(), true);
    for (const [mode, label, value] of [["month", "เดือน / ปี", "2026-10"], ["year", "ปี (ค.ศ.)", "2026"]]) {
      await page.getByLabel("กรองตาม", { exact: true }).selectOption(mode);
      await page.getByLabel(label, { exact: true }).fill(value);
      await page.getByRole("button", { name: "ใช้ตัวกรอง", exact: true }).click();
      await orderButton().waitFor();
    }
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "usdcodashop-2026-01-01-2026-12-31.csv");
    const exported = await readFile(await download.path(), "utf8");
    assert.ok(exported.startsWith("\uFEFF")); assert.ok(exported.includes("K7306274")); assert.ok(exported.includes("9397.75"));
    await page.getByRole("button", { name: "ล้างตัวกรอง", exact: true }).click();
    await orderButton().waitFor();
    await page.getByRole("button", { name: "รายการเติมเงิน", exact: true }).click();
    await page.getByRole("button", { name: "ดูรายละเอียด Order เติมเงิน", exact: true }).waitFor();
    assert.equal(await orderButton().count(), 0);
    assert.equal(await page.getByRole("region", { name: "สรุปยอด", exact: true }).getByText("100.10", { exact: true }).count(), 1);
    const depositDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    const depositDownload = await depositDownloadPromise;
    const depositCsv = await readFile(await depositDownload.path(), "utf8");
    assert.ok(depositCsv.includes("receipt123")); assert.ok(!depositCsv.includes("K7306274"));
    await page.getByRole("button", { name: "รายการใช้เงิน", exact: true }).click();
    await orderButton().waitFor();
    for (const [name, preset] of [["วันนี้", "today"], ["เมื่อวาน", "yesterday"], ["เดือนนี้", "month"]]) {
      const response = page.waitForResponse((r) => r.url().includes("/ledger?") && r.request().method() === "GET");
      await page.getByRole("button", { name, exact: true }).click();
      const url = new URL((await response).url()); const expected = codaQuickDates(preset, "2026-10-17T08:00:00Z");
      assert.equal(url.searchParams.get("dateFrom"), expected.dateFrom); assert.equal(url.searchParams.get("dateTo"), expected.dateTo);
      await page.getByRole("button", { name: "ใช้ตัวกรอง", exact: true }).waitFor({ state: "visible" });
    }
    await orderButton().waitFor();
    const refresh = page.waitForResponse((r) => r.url().includes("/ledger?") && r.request().method() === "GET");
    await page.clock.fastForward(30_001); await refresh;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `ledger-${width}-${theme}.png`), fullPage: true });
    await page.getByLabel("กรองกำไร", { exact: true }).selectOption("loss");
    await page.getByRole("button", { name: "ใช้ตัวกรอง", exact: true }).click();
    await page.getByText("ไม่พบรายการตามตัวกรอง", { exact: true }).filter({ visible: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Export CSV", exact: true }).isDisabled(), true);
    await page.getByLabel("กรองกำไร", { exact: true }).selectOption("profit");
    await page.getByLabel("กำไรต่ำสุด", { exact: true }).fill("26.85");
    await page.getByLabel("กำไรสูงสุด", { exact: true }).fill("26.85");
    await page.getByRole("button", { name: "ใช้ตัวกรอง", exact: true }).click();
    await orderButton().waitFor();
    await page.getByLabel("หน่วยกำไร", { exact: true }).selectOption("percent");
    await page.getByLabel("กำไรต่ำสุด", { exact: true }).fill("18.23");
    await page.getByLabel("กำไรสูงสุด", { exact: true }).fill("18.23");
    await page.getByRole("button", { name: "ใช้ตัวกรอง", exact: true }).click();
    await orderButton().waitFor();
    const profitDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    const profitCsv = await readFile(await (await profitDownloadPromise).path(), "utf8");
    assert.ok(profitCsv.includes('"26.85","18.23"'));
    assert.deepEqual(exportedProfit, { profitStatus: "profit", profitUnit: "percent", profitMin: "18.23", profitMax: "18.23" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `profit-filter-${width}-${theme}.png`), fullPage: true });
    await page.getByLabel("กำไรต่ำสุด", { exact: true }).fill("20");
    await page.getByRole("button", { name: "ใช้ตัวกรอง", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "กำไรต่ำสุดต้องไม่เกินกำไรสูงสุด" }).waitFor();
    await page.getByRole("button", { name: "ล้างตัวกรอง", exact: true }).click();
    await orderButton().waitFor();
    assert.equal(await page.getByLabel("กำไรต่ำสุด", { exact: true }).inputValue(), "");
    await page.getByLabel("กรองกำไร", { exact: true }).selectOption("profit");
    await page.getByRole("button", { name: "ใช้ตัวกรอง", exact: true }).click();
    await orderButton().waitFor();
    await page.getByRole("button", { name: "รายการเติมเงิน", exact: true }).click();
    await page.getByRole("button", { name: "ดูรายละเอียด Order เติมเงิน", exact: true }).waitFor();
    assert.equal(await page.getByLabel("กรองกำไร", { exact: true }).inputValue(), "all");
    await page.getByRole("button", { name: "รายการใช้เงิน", exact: true }).click();
    await orderButton().waitFor();
    entries[0].details.saleThb = null; entries[0].orderDuplicate = true; entries[0].transactionDuplicate = true;
    await page.getByRole("button", { name: "โหลดประวัติ", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "ยอดโอนไม่ครบ 1 รายการ" }).waitFor();
    assert.equal(await page.getByRole("region", { name: "สรุปยอด", exact: true }).getByText("—", { exact: true }).count(), 2);
    await orderButton().focus(); await page.keyboard.press("Enter");
    await detail.getByRole("status").filter({ hasText: "คิวซ้ำ · ธุรกรรมซ้ำ" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `warning-${width}-${theme}.png`), fullPage: true });
    await page.getByRole("button", { name: "ซ่อนรายละเอียด Order K7306274", exact: true }).click();
    entries[0].details.saleThb = "147.25"; entries[0].orderDuplicate = false; entries[0].transactionDuplicate = false;
    autoSync = { ...autoSync, state: "error", error_message: "ตรวจ Order K1" };
    await page.getByRole("button", { name: "โหลดประวัติ", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "ตรวจ Order K1" }).waitFor();
    autoSync = { ...autoSync, heartbeat: "2020-01-01T00:00:00Z", error_message: null };
    await page.getByRole("button", { name: "โหลดประวัติ", exact: true }).click();
    await page.getByText("ซิงก์อัตโนมัติทุก 60 วินาที · ไม่ได้รับสถานะเกิน 3 นาที โปรดตรวจ worker", { exact: true }).waitFor();
    canManage = false; await page.getByRole("button", { name: "โหลดประวัติ", exact: true }).click();
    await page.getByRole("button", { name: "ซิงก์ Orders", exact: true }).waitFor({ state: "detached" });
    assert.equal(await page.getByRole("button", { name: "บันทึก USD เข้า", exact: true }).count(), 0);
    const beforeSample = entries;
    currentCostRate = "33.45";
    entries = [{ ...entries[0], id: "3", orderId: "K7316994", amount: "0.92", balance: "12998.29", details: { ...entries[0].details, saleThb: "33.25", costThb: "29.9368" } }];
    await page.getByRole("button", { name: "โหลดประวัติ", exact: true }).click();
    await page.getByRole("button", { name: "ดูรายละเอียด Order K7316994", exact: true }).waitFor();
    const primaryTable = page.getByRole("table").first();
    await primaryTable.getByText("0.92", { exact: true }).waitFor();
    assert.equal(await primaryTable.getByText("30.77", { exact: true }).count(), 1);
    assert.equal(await primaryTable.getByText("2.48", { exact: true }).count(), 1);
    assert.equal(await primaryTable.getByText("7.46%", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("region", { name: "รายละเอียด Order K7316994", exact: true }).count(), 0);
    await page.screenshot({ path: path.join(output, `usd-out-${width}-${theme}.png`), fullPage: true });
    entries = beforeSample;
    currentCostRate = null; await page.getByRole("button", { name: "โหลดประวัติ", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "ยังดึงเรทต้นทุน USD→THB ไม่สำเร็จ" }).waitFor();
    assert.equal(await page.getByRole("region", { name: "สรุปยอด", exact: true }).getByText("—", { exact: true }).count(), 2);
    currentCostRate = "32.54";
    missingBalance = true; await page.getByRole("button", { name: "โหลดประวัติ", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "ยังไม่มี balance_after" }).waitFor();
    assert.equal(await page.getByRole("region", { name: "สรุปยอด", exact: true }).getByText("—", { exact: true }).count(), 1);
    offline = true; await page.getByRole("button", { name: "โหลดประวัติ", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "จำลอง" }).waitFor();
    await page.getByRole("textbox", { name: "ค้นหา Order / เกม / แพ็ก / ผู้ทำรายการ" }).fill("different-filter");
    await page.getByRole("button", { name: "ใช้ตัวกรอง", exact: true }).click();
    await page.getByText("โหลดประวัติไม่สำเร็จ กรุณาลองใหม่", { exact: true }).waitFor();
    assert.equal(await orderButton().count(), 0, "never display stale rows under a new failed filter");
    assert.equal(await page.getByRole("button", { name: "Export CSV", exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []); await page.close();
  }
  console.log(`PASS: actual client, setup confirmation, sync replay, deposit, search, permissions, error handling, mobile/desktop light/dark. Screenshots: ${output}`);
} finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
