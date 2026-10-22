// Synthetic GET-only UI verification. No DB, provider, or financial mutations.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { gpOrder, groupGpOrders, gpSummary, gpCsv, gpMatches, GAMEPOINT_REFERENCE } from "../src/lib/gamepoint-inventory.js";
const require = createRequire(import.meta.url), { webpack } = require("next/dist/compiled/webpack/webpack");
const root = process.cwd(), output = await mkdtemp(path.join(tmpdir(), "gamepoint-ui-"));
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: "development", devtool: false, entry: path.join(root, "tests/ui/gamepoint-inventory-entry.jsx"), output: { path: output, filename: "preview.js" },
    plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "development" }) })],
    resolve: { alias: { "next/link$": path.join(root, "tests/ui/usdcodashop-link.js"), "@": path.join(root, "src") }, extensions: [".js", ".jsx", ".mjs"] },
    module: { rules: [{ test: /\.m?jsx?$/, resolve: { fullySpecified: false } }, { test: /\.jsx?$/, exclude: /node_modules/, use: path.join(root, "tests/ui/usdcodashop-loader.cjs") }] },
  });
  compiler.run((error, stats) => compiler.close(() => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
async function readCss(dir) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) result.push(...await readCss(file)); else if (item.name.endsWith(".css")) result.push(await readFile(file, "utf8"));
  }
  return result;
}
const css = (await readCss(path.join(root, ".next/static"))).join("\n"), bundle = await readFile(path.join(output, "preview.js"));
const raw = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, source_base: `ORDER-${i + 1}`, source: "page", quantity: 1,
  occurred_at: "2026-10-21T01:00:00Z", submitted_at: "2026-10-21T01:00:01Z", balance_before: "100",
  lines: [{ key: "a", status: "done", amount: "1" }], plan_refs: ["a"], stored_cost: "0.5", ledger_slices: [],
  game_name: "Crossfire", pack_name: "Pack", sheet_fields: { saleThb: "30", saleTotalThb: "30" } }));
raw[0].sheet_fields.saleTotalThb = "60"; raw.push({ ...raw[0], id: 999, balance_before: "99", submitted_at: "2026-10-21T01:01:00Z" });
Object.assign(raw[1], { lines: [], provider_amount: null });
Object.assign(raw[2], { balance_before: null });
let offline = false;
function entriesFor(p) { return groupGpOrders(raw.map((r) => gpOrder(r, p.get("rate") || "7.84"))).filter((e) => gpMatches(e, p.get("search"))); }
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1"), p = url.searchParams;
  if (url.pathname === "/api/projectm/gamepoint") {
    assert.equal(req.method, "GET"); assert.ok(p.has("dateFrom") && p.has("dateTo"));
    if (p.get("format") === "csv") { res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", 'attachment; filename="gamepoint-test.csv"'); return res.end(gpCsv(entriesFor(p))); }
    res.setHeader("Content-Type", "application/json");
    if (offline) { res.statusCode = 503; return res.end(JSON.stringify({ error: "ทดสอบเชื่อมต่อไม่ได้" })); }
    const entries = entriesFor(p), page = Number(p.get("page") || 1);
    return res.end(JSON.stringify({ entries: entries.slice((page - 1) * 100, page * 100), total: entries.length, page, pageSize: 100, summary: gpSummary(entries), reference: GAMEPOINT_REFERENCE,
      observation: { before: "100", checkedAt: "2026-10-21T01:00:01Z", orderId: "LATEST" } }));
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
    const row = (id) => page.getByRole("row").filter({ has: page.getByText(id, { exact: true }) });
    await row("ORDER-1").getByRole("cell").nth(5).getByText("2.00", { exact: true }).waitFor();
    await row("ORDER-1").getByRole("cell").nth(6).getByText("98.00", { exact: true }).waitFor();
    await row("ORDER-2").getByRole("cell").nth(3).filter({ hasText: /^—/ }).waitFor();
    await row("ORDER-2").getByRole("cell").nth(5).getByText(/ไม่มียอดตัด MYR ที่ยืนยัน/).waitFor();
    await row("ORDER-3").getByRole("cell").nth(6).getByText("ยังคำนวณยอดหลังไม่ได้", { exact: true }).waitFor();
    await page.getByText("2 รายการย่อย", { exact: true }).click(); await page.getByText(/คิว 999/).waitFor();
    await page.getByRole("navigation").getByRole("button", { name: "ถัดไป" }).click(); await page.getByText("ORDER-101", { exact: true }).waitFor();
    await page.getByRole("navigation").getByRole("button", { name: "ก่อนหน้า" }).click(); await page.getByText("ORDER-1", { exact: true }).waitFor();
    await page.getByLabel("ค้นหา Order / เกม / ผู้เติม", { exact: true }).fill("ORDER-1"); await page.getByRole("button", { name: "ค้นหา / ใช้เรทนี้", exact: true }).click();
    await page.getByText("ORDER-1", { exact: true }).waitFor(); assert.equal(await page.getByText("ORDER-2", { exact: true }).count(), 0);
    await page.getByLabel("เรทอ้างอิง THB ต่อ MYR", { exact: true }).fill("8"); await page.getByRole("button", { name: "ค้นหา / ใช้เรทนี้", exact: true }).click();
    await row("ORDER-1").getByRole("cell").nth(3).filter({ hasText: /^16[.]00/ }).waitFor();
    await row("ORDER-1").getByRole("cell").nth(6).getByText("98.00", { exact: true }).waitFor();
    const download = page.waitForEvent("download"); await page.getByRole("link", { name: "Export CSV" }).click(); assert.equal((await download).suggestedFilename(), "gamepoint-test.csv");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    if (process.env.GAMEPOINT_SMOKE_OUTPUT) await page.screenshot({ path: path.join(process.env.GAMEPOINT_SMOKE_OUTPUT, `gamepoint-${width}-${theme}.png`), fullPage: true });
    offline = true; await page.getByRole("button", { name: "โหลดใหม่", exact: true }).click(); await page.getByRole("alert").waitFor(); assert.equal(await page.getByRole("link", { name: "Export CSV" }).count(), 0); offline = false;
    await page.getByRole("button", { name: "โหลดใหม่", exact: true }).click(); await page.getByText("ORDER-1", { exact: true }).waitFor(); assert.deepEqual(errors, []);
    await page.close(); console.log(`Gamepoint ${width}px ${theme}: passed`);
  }
} finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
