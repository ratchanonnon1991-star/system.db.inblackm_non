// Real component, synthetic GET responses only; never calls DBs or Razer.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { razerOrder, groupRazerOrders, razerSummary, razerSum, razerCsv, razerMatches } from "../src/lib/razer-inventory.js";
const require = createRequire(import.meta.url), { webpack } = require("next/dist/compiled/webpack/webpack");
const root = process.cwd(), output = await mkdtemp(path.join(tmpdir(), "razer-inventory-ui-"));
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: "development", devtool: false, entry: path.join(root, "tests/ui/razer-inventory-entry.jsx"), output: { path: output, filename: "preview.js" },
    plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "development" }) })],
    resolve: { alias: { "next/link$": path.join(root, "tests/ui/usdcodashop-link.js"), "@": path.join(root, "src") }, extensions: [".js", ".jsx", ".mjs"] },
    module: { rules: [{ test: /\.m?jsx?$/, resolve: { fullySpecified: false } }, { test: /\.jsx?$/, exclude: /node_modules/, use: path.join(root, "tests/ui/usdcodashop-loader.cjs") }] },
  });
  compiler.run((error, stats) => compiler.close(() => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
async function readCss(dir) {
  const values = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) values.push(...await readCss(file)); else if (item.name.endsWith(".css")) values.push(await readFile(file, "utf8"));
  }
  return values;
}
const css = (await readCss(path.join(root, ".next/static"))).join("\n"), bundle = await readFile(path.join(output, "preview.js"));
const accounts = Array.from({ length: 52 }, (_, i) => ({ key: `${i === 51 ? "CAD" : "SGD"}:account${i}@example.com`,
  email: `account${i}@example.com`, zone: i === 51 ? "CAD" : "SGD", gold: "100.00", silver: "500.00", rate: "20", status: "ACTIVE", botEnabled: true, balanceSource: "stock", balanceAt: "2026-10-21T01:00:00Z" }));
const raw = Array.from({ length: 101 }, (_, i) => ({ history_id: i + 1, id: i + 1000, source_base: `ORDER-${i + 1}`, source: "PAGE", purchase_email: "account0@example.com", currency_code: "SGD", occurred_at: "2026-10-21T01:00:00Z", old_balance_gold: "10", new_balance_gold: "9", deducted: "1", game_name: "Game", pack_name: "Pack", sheet_fields: { saleThb: "30", saleTotalThb: "30" } }));
raw.push({ ...raw[0], history_id: 5001, id: 6001, sheet_fields: { saleThb: "30", saleTotalThb: "60" } });
raw[0].sheet_fields.saleTotalThb = "60";
let offline = false, malformed = false, stockAvailable = true;
function entriesFor(p) { return groupRazerOrders(raw.map((r) => razerOrder(r, accounts[0], JSON.parse(p.get("rates") || "{}"))))
  .filter((e) => (!p.get("zone") || e.zone === p.get("zone")) && (!p.get("account") || e.walletKey === p.get("account")) && razerMatches(e, p.get("search"))); }
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1"), p = url.searchParams;
  if (url.pathname === "/api/projectm/razer") {
    assert.equal(req.method, "GET");
    if (p.get("format") === "csv") { res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", 'attachment; filename="razer-test.csv"'); return res.end(razerCsv(entriesFor(p))); }
    res.setHeader("Content-Type", "application/json");
    if (offline) { res.statusCode = 503; return res.end(JSON.stringify({ error: "ทดสอบเชื่อมต่อไม่ได้" })); }
    if (malformed) return res.end(JSON.stringify({ accounts: [] }));
    const entries = entriesFor(p), page = Number(p.get("page") || 1), accountPage = Number(p.get("accountPage") || 1);
    const choices = accounts.filter((a) => !p.get("zone") || a.zone === p.get("zone"));
    const selected = choices.filter((a) => (!p.get("account") || a.key === p.get("account")) && (!p.get("search") || a.email.includes(p.get("search")) || entries.some((e) => e.walletKey === a.key)));
    return res.end(JSON.stringify({ stockAvailable, accountChoices: choices, accounts: selected.slice((accountPage - 1) * 50, accountPage * 50), accountTotal: selected.length, accountPage, canOpenStock: false,
      zones: ["SGD", "CAD"].map((zone) => ({ zone, accounts: choices.filter((a) => a.zone === zone).length, gold: zone === "SGD" ? "5100" : "100", silver: "500", used: razerSum(entries.filter((e) => e.zone === zone), (e) => e.used) })),
      entries: entries.slice((page - 1) * 100, page * 100), total: entries.length, page, pageSize: 100, summary: razerSummary(entries) }));
  }
  if (url.pathname === "/preview.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(bundle); }
  res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div data-theme="light" class="min-h-screen bg-ll-canvas"><div id="root"></div></div><script src="/preview.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [375, 1536]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 }, reducedMotion: "reduce" });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator("[data-theme]").evaluate((el, t) => el.dataset.theme = t, theme);
    await page.getByText("ORDER-1", { exact: true }).waitFor();
    await page.getByText("รายละเอียด · 2 รายการย่อย", { exact: true }).click(); await page.getByText(/คิว 6001/).waitFor();
    await page.getByRole("navigation", { name: "เปลี่ยนหน้าบัญชี" }).getByRole("button", { name: "ถัดไป" }).click(); await page.getByText("account51@example.com", { exact: true }).waitFor();
    await page.getByRole("navigation", { name: "เปลี่ยนหน้าออเดอร์" }).getByRole("button", { name: "ถัดไป" }).click(); await page.getByText("ORDER-101", { exact: true }).waitFor();
    await page.getByRole("navigation", { name: "เปลี่ยนหน้าออเดอร์" }).getByRole("button", { name: "ก่อนหน้า" }).click(); await page.getByText("ORDER-1", { exact: true }).waitFor();
    await page.getByLabel("ค้นหา Order / เกม / อีเมล", { exact: true }).fill("ORDER-1"); await page.getByRole("button", { name: "ค้นหา / ใช้เรทนี้", exact: true }).click();
    await page.getByText("ORDER-1", { exact: true }).waitFor(); assert.equal(await page.getByText("ORDER-2", { exact: true }).count(), 0);
    await page.getByText("เรทต้นทุนอ้างอิง", { exact: true }).click(); await page.getByLabel("บาทต่อ Gold (SGD)", { exact: true }).fill("21"); await page.getByRole("button", { name: "ค้นหา / ใช้เรทนี้", exact: true }).click();
    await page.getByRole("cell").filter({ hasText: "เรท 21" }).filter({ hasText: "42.00" }).first().waitFor();
    const download = page.waitForEvent("download"); await page.getByRole("link", { name: "Export CSV" }).click(); assert.equal((await download).suggestedFilename(), "razer-test.csv");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    if (process.env.RAZER_SMOKE_OUTPUT) await page.screenshot({ path: path.join(process.env.RAZER_SMOKE_OUTPUT, `razer-${width}-${theme}.png`), fullPage: true });
    stockAvailable = false; await page.getByRole("button", { name: "โหลดใหม่", exact: true }).click(); await page.getByText(/โหลด Razer Stock ไม่ได้/).waitFor(); stockAvailable = true;
    offline = true; await page.getByRole("button", { name: "โหลดใหม่", exact: true }).click(); await page.getByRole("alert").waitFor(); assert.equal(await page.getByRole("link", { name: "Export CSV" }).count(), 0); offline = false;
    malformed = true; await page.getByRole("button", { name: "โหลดใหม่", exact: true }).click(); await page.getByText(/ข้อมูลไม่ครบ/).waitFor(); malformed = false;
    await page.getByRole("button", { name: "โหลดใหม่", exact: true }).click(); await page.getByText("ORDER-1", { exact: true }).waitFor(); assert.deepEqual(errors, []);
    await page.close(); console.log(`Razer ${width}px ${theme}: passed`);
  }
} finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
