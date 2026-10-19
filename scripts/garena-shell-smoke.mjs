// Exercise the real client with synthetic API responses; no database/provider connection.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { SHELL_ACCOUNTS, shellOrder, shellSummary, shellCsv, allocateShellSale, groupShellOrders } from "../src/lib/garena-shell-inventory.js";

const require = createRequire(import.meta.url), { webpack } = require("next/dist/compiled/webpack/webpack");
const root = process.cwd(), output = await mkdtemp(path.join(tmpdir(), "garena-shell-ui-"));
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: "development", devtool: false, entry: path.join(root, "tests/ui/garena-shell-entry.jsx"), output: { path: output, filename: "preview.js" },
    plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "development" }) })],
    resolve: { alias: { "next/link$": path.join(root, "tests/ui/usdcodashop-link.js"), "@": path.join(root, "src") }, extensions: [".js", ".jsx", ".mjs"] },
    module: { rules: [{ test: /\.m?jsx?$/, resolve: { fullySpecified: false } }, { test: /\.jsx?$/, exclude: /node_modules/, use: path.join(root, "tests/ui/usdcodashop-loader.cjs") }] },
  });
  compiler.run((error, stats) => compiler.close(() => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
async function readCss(dir) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) files.push(...await readCss(file));
    else if (item.name.endsWith(".css")) files.push(await readFile(file, "utf8"));
  }
  return files;
}
const css = (await readCss(path.join(root, ".next/static"))).join("\n"), bundle = await readFile(path.join(output, "preview.js"));
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  // Chromium may issue a native download outside page/context interception.
  if (url.pathname === "/api/projectm/garena-shell" && url.searchParams.get("format") === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="garena-shell-test.csv"');
    res.end(shellCsv(filteredEntries(url.searchParams)));
  }
  else if (req.url === "/preview.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle); }
  else { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div data-theme="light" class="min-h-screen bg-ll-canvas"><div id="root"></div></div><script src="/preview.js"></script></body></html>`); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const entries = Array.from({ length: 101 }, (_, i) => shellOrder({ id: i + 1, source_order_id: `ORDER-${i + 1}`,
  garena_username: i < 60 ? "InblackRB2c" : "InblackWFH1z", game_name: "ROV", pack_name: "300 Shell",
  shell_before: "1000", shell_after: "700", shell_used: "300", occurred_at: "2026-10-18T07:00:00Z", sheet_fields: { saleThb: "190" } }));
entries[0] = groupShellOrders([750, 225].map((used, index) => shellOrder({ id: index ? 100001 : 1,
  source_order_id: 'ORDER-1', source: 'PAGE', garena_username: 'InblackRB2c', game_name: 'Free Fire', pack_name: `${used} Shell`,
  shell_used: String(used), shell_after: index ? '66745' : '66970', occurred_at: '2026-10-18T07:00:00Z',
  observed_at: `2026-10-18T07:00:0${index}Z`, sheet_fields: allocateShellSale({ saleThb: '620', saleAllocation: { count: 2, position: index } }) })))[0];
function filteredEntries(params) {
  return entries.filter((entry) => entry.occurredAt.slice(0, 10) >= params.get("dateFrom") && entry.occurredAt.slice(0, 10) <= params.get("dateTo")
    && (!params.get("account") || entry.account === params.get("account")) && (!params.get("search") || entry.orderId.includes(params.get("search"))));
}
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [375, 1536]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 }, reducedMotion: "reduce" });
    await page.clock.install({ time: new Date("2026-10-19T08:00:00Z") });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    let offline = false, malformed = false, reads = 0;
    await page.context().route("**/api/projectm/garena-shell**", async (route) => {
      assert.equal(route.request().method(), "GET"); reads++;
      if (offline) return route.fulfill({ status: 503, json: { error: "ทดสอบเชื่อมต่อไม่ได้" } });
      if (malformed) return route.fulfill({ json: { cards: [], entries: [] } });
      const p = new URL(route.request().url()).searchParams, number = Number(p.get("page") || 1);
      const inDate = entries.filter((entry) => entry.occurredAt.slice(0, 10) >= p.get("dateFrom") && entry.occurredAt.slice(0, 10) <= p.get("dateTo"));
      const matched = inDate.filter((entry) => (!p.get("account") || entry.account === p.get("account")) && (!p.get("search") || entry.orderId.includes(p.get("search"))));
      if (p.get("format") === "csv") return route.fulfill({ headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="garena-shell-test.csv"' }, body: shellCsv(matched) });
      return route.fulfill({ json: { dateFrom: p.get("dateFrom"), dateTo: p.get("dateTo"), page: number, pageSize: 100, total: matched.length,
        entries: matched.slice((number - 1) * 100, number * 100), summary: shellSummary(matched), cards: SHELL_ACCOUNTS.map((account, index) => ({ ...account,
          ...shellSummary(inDate.filter((entry) => entry.account === account.id)), balance: index ? "68550.00" : "108475.00", balanceAt: "2026-10-17T14:00:00Z", balanceOrderId: "BOT-ORDER" })) } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator("[data-theme]").evaluate((element, value) => element.dataset.theme = value, theme);
    await page.getByText("ORDER-1", { exact: true }).waitFor();
    await page.getByText("รวม 2 รายการย่อย", { exact: true }).click();
    await page.getByText(/คิวบอท 100001/).waitFor();
    const combinedShell = page.getByRole("cell").filter({ hasText: "750.00 + 225.00" });
    assert.match(await combinedShell.innerText(), /^975\.00\s+750\.00 \+ 225\.00$/);
    assert.equal(await page.getByText("609.38", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: /InblackShell[12]/ }).count(), 2);
    const readCount = reads;
    await page.clock.fastForward(60001);
    assert.equal(reads, readCount, "no unsolicited background provider/ledger actions");
    await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
    await page.getByText("ORDER-101", { exact: true }).waitFor();
    await page.getByRole("button", { name: "ก่อนหน้า", exact: true }).click();
    await page.getByText("ORDER-1", { exact: true }).waitFor();
    await page.getByLabel("บัญชี Shell", { exact: true }).selectOption("inblackwfh1z");
    await page.getByText("ORDER-61", { exact: true }).waitFor();
    assert.equal(await page.getByText("ORDER-1", { exact: true }).count(), 0);
    await page.getByLabel("ค้นหา Order / เกม / ผู้เติม", { exact: true }).fill("ORDER-101");
    await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
    await page.getByText("ORDER-101", { exact: true }).waitFor();
    assert.equal(await page.getByText("ORDER-61", { exact: true }).count(), 0);
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export CSV", exact: true }).click();
    assert.equal((await download).suggestedFilename(), "garena-shell-test.csv");
    await page.getByLabel("ค้นหา Order / เกม / ผู้เติม", { exact: true }).fill("");
    await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
    await page.getByText("ORDER-61", { exact: true }).waitFor();
    await page.getByLabel("บัญชี Shell", { exact: true }).selectOption("");
    await page.getByText("ORDER-1", { exact: true }).waitFor();
    const firstReference = page.getByText("ยอดอ้างอิงจากชีท (ไม่ใช่ยอดบอท)", { exact: true }).first();
    await firstReference.click();
    await page.getByText("124,050.00", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "page does not overflow; the table scrolls locally");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement !== document.body), true);
    const screenshotDir = process.env.GARENA_SMOKE_OUTPUT || output;
    await page.screenshot({ path: path.join(screenshotDir, `garena-shell-${width}-${theme}.png`), fullPage: true });
    offline = true;
    await page.getByRole("button", { name: "โหลดใหม่", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(await page.getByText("ORDER-1", { exact: true }).count(), 0, "stale successful results hidden on failure");
    offline = false; malformed = true;
    await page.getByRole("button", { name: "โหลดใหม่", exact: true }).click();
    await page.getByText(/ข้อมูลไม่ครบ กรุณาโหลดใหม่/).waitFor();
    malformed = false;
    await page.getByRole("button", { name: "โหลดใหม่", exact: true }).click();
    await page.getByText("ORDER-1", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`Garena Shell UI ${width}px ${theme}: filters, pagination, export, references, failure recovery, keyboard and overflow passed`);
    await page.close();
  }
  console.log(`Screenshots: ${process.env.GARENA_SMOKE_OUTPUT || output}`);
} finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
