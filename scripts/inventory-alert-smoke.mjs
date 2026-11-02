// Real client against synthetic API responses only; no DB or Telegram calls.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const require = createRequire(import.meta.url), { webpack } = require("next/dist/compiled/webpack/webpack");
const root = process.cwd(), output = await mkdtemp(path.join(tmpdir(), "inventory-alert-ui-"));
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: "development", devtool: false, entry: path.join(root, "tests/ui/inventory-alert-entry.jsx"),
    output: { path: output, filename: "preview.js" }, plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "development" }) })],
    resolve: { alias: { "@": path.join(root, "src") }, extensions: [".js", ".jsx"] },
    module: { rules: [{ test: /\.jsx?$/, resolve: { fullySpecified: false } }, { test: /\.jsx?$/, exclude: /node_modules/, use: path.join(root, "tests/ui/usdcodashop-loader.cjs") }] },
  });
  compiler.run((error, stats) => compiler.close(() => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
const cssPath = path.join(root, "src/app/globals.css");
const css = (await require("postcss")([require("@tailwindcss/postcss")()]).process(await readFile(cssPath, "utf8"), { from: cssPath })).css;
const bundle = await readFile(path.join(output, "preview.js"));
let canManage = true, failed = false, saved, balance = "49.99", target = "100.00", offline = false;
const server = createServer(async (req, res) => {
  if (req.url === "/preview.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(bundle); }
  if (req.url === "/api/projectm/inventory-alerts") {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "PUT") {
      let body = ""; for await (const chunk of req) body += chunk;
      if (failed) { res.statusCode = 503; return res.end(JSON.stringify({ error: "ทดสอบส่งข้อมูลไม่สำเร็จ" })); }
      saved = JSON.parse(body); target = saved.target || null; return res.end('{"ok":true}');
    }
    if (offline) { res.statusCode = 503; return res.end(JSON.stringify({ error: "ทดสอบโหลดอัตโนมัติไม่สำเร็จ" })); }
    return res.end(JSON.stringify({ canManage, telegramConfigured: false, workerEnabled: false, errors: [{ provider: "netease" }],
      channels: [{ key: "plsbuy:MYR", label: "Plsbuy", provider: "plsbuy", currency: "MYR", balance, target, source: "plsbuy_api", balanceAt: "2026-11-02T00:00:00Z" },
        { key: "gamepoint:MYR", label: "Gamepoint", provider: "gamepoint", currency: "MYR", balance: null, target: null, source: "calculated" }] }));
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><main data-theme="light" class="min-h-screen bg-ll-canvas p-4 text-ll-ink"><div id="root"></div></main><script src="/preview.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [375, 1536]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } }), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-11-02T00:00:00Z") });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const filter = page.getByRole("combobox", { name: "ช่องทาง", exact: true });
    await filter.waitFor();
    assert.equal(await page.locator("tbody tr").count(), 0, "initial view asks for a provider instead of rendering every account");
    await filter.selectOption("gamepoint");
    assert.equal(await page.getByText("ไม่ทราบยอด MYR", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("spinbutton", { name: "ยอดเป้าหมาย Plsbuy MYR" }).count(), 0);
    await filter.selectOption("netease");
    await page.getByRole("alert").filter({ hasText: "อ่านยอดไม่สำเร็จ: netease" }).waitFor();
    assert.equal(await page.locator("tbody tr").count(), 0, "failed source has a selectable empty view");
    await filter.selectOption("plsbuy");
    const input = page.getByRole("spinbutton", { name: "ยอดเป้าหมาย Plsbuy MYR" });
    await input.waitFor();
    assert.equal(await page.getByText("⚠ ต่ำกว่า 50%", { exact: true }).count(), 1);
    assert.equal(await page.getByText("ไม่ทราบยอด MYR", { exact: true }).count(), 0);
    assert.equal(await page.locator("tbody tr").count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await input.fill("200"); await page.getByRole("button", { name: "บันทึก", exact: true }).first().click();
    await page.getByText("บันทึกแล้ว", { exact: true }).waitFor();
    assert.deepEqual(saved, { key: "plsbuy:MYR", target: "200" });
    await filter.selectOption("gamepoint"); await filter.selectOption("plsbuy");
    assert.equal(await input.inputValue(), "200", "saved targets survive switching providers");
    await input.fill("275"); balance = "39.99";
    const refresh = page.waitForResponse(response => response.url().endsWith("/api/projectm/inventory-alerts") && response.request().method() === "GET");
    await page.clock.fastForward(30_001); await refresh;
    await page.getByText("39.99 MYR", { exact: true }).waitFor();
    assert.equal(await input.inputValue(), "275", "background balance refresh must preserve an unsaved target");
    assert.equal(await filter.inputValue(), "plsbuy");
    offline = true;
    const unavailable = page.waitForResponse(response => response.status() === 503);
    await page.clock.fastForward(30_001); await unavailable;
    await page.getByRole("alert").filter({ hasText: "ทดสอบโหลดอัตโนมัติไม่สำเร็จ" }).waitFor();
    offline = false;
    const recovery = page.waitForResponse(response => response.url().endsWith("/api/projectm/inventory-alerts") && response.request().method() === "GET");
    await page.clock.fastForward(30_001); await recovery;
    await page.waitForFunction(() => !document.body.textContent.includes("ทดสอบโหลดอัตโนมัติไม่สำเร็จ"));
    failed = true; await input.fill("300"); await page.getByRole("button", { name: "บันทึก", exact: true }).first().click();
    await page.getByText("ทดสอบส่งข้อมูลไม่สำเร็จ").waitFor(); failed = false;
    await input.fill(""); await page.getByRole("button", { name: "บันทึก", exact: true }).first().click();
    await page.getByText("บันทึกแล้ว", { exact: true }).waitFor();
    assert.equal(saved.target, "");
    assert.equal(await page.getByText("ปิดอยู่", { exact: true }).count(), 1);
    await filter.selectOption("gamepoint"); await filter.selectOption("plsbuy");
    assert.equal(await input.inputValue(), "", "disabled target stays disabled after switching providers");
    await page.screenshot({ path: path.join(output, `alerts-${width}.png`), fullPage: true });
    canManage = false;
    await page.getByRole("button", { name: "โหลดยอดและสถานะใหม่" }).click();
    await page.waitForFunction(() => document.querySelectorAll('button[type="submit"]').length === 0 && [...document.querySelectorAll('input')].every(input => input.disabled));
    assert.equal(await page.getByRole("button", { name: "บันทึก", exact: true }).count(), 0);
    assert.equal(await filter.inputValue(), "plsbuy", "reload keeps the selected provider");
    await filter.selectOption("gamepoint");
    assert.equal(await page.getByText("ไม่ทราบยอด MYR", { exact: true }).count(), 1, "viewers can still use the filter");
    assert.deepEqual(errors, []); await page.close(); canManage = true; balance = "49.99"; target = "100.00";
  }
  console.log(`PASS: mobile/desktop filters, automatic balance refresh with draft preservation and error recovery, target save/disable, viewer permissions and no overflow. Screenshots: ${output}`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
