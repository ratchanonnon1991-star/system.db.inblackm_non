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
let canManage = true, failed = false, saved;
const server = createServer(async (req, res) => {
  if (req.url === "/preview.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(bundle); }
  if (req.url === "/api/projectm/inventory-alerts") {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "PUT") {
      let body = ""; for await (const chunk of req) body += chunk;
      if (failed) { res.statusCode = 503; return res.end(JSON.stringify({ error: "ทดสอบส่งข้อมูลไม่สำเร็จ" })); }
      saved = JSON.parse(body); return res.end('{"ok":true}');
    }
    return res.end(JSON.stringify({ canManage, telegramConfigured: false, workerEnabled: false, errors: [{ provider: "netease" }],
      channels: [{ key: "plsbuy:MYR", label: "Plsbuy", provider: "plsbuy", currency: "MYR", balance: "49.99", target: "100.00", source: "plsbuy_api", balanceAt: "2026-11-02T00:00:00Z" },
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
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const input = page.getByRole("spinbutton", { name: "ยอดเป้าหมาย Plsbuy MYR" });
    await input.waitFor();
    assert.equal(await page.getByText("⚠ ต่ำกว่า 50%", { exact: true }).count(), 1);
    assert.equal(await page.getByText("ไม่ทราบยอด MYR", { exact: true }).count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await input.fill("200"); await page.getByRole("button", { name: "บันทึก", exact: true }).first().click();
    await page.getByText("บันทึกแล้ว", { exact: true }).waitFor();
    assert.deepEqual(saved, { key: "plsbuy:MYR", target: "200" });
    failed = true; await input.fill("300"); await page.getByRole("button", { name: "บันทึก", exact: true }).first().click();
    await page.getByText("ทดสอบส่งข้อมูลไม่สำเร็จ").waitFor(); failed = false;
    await input.fill(""); await page.getByRole("button", { name: "บันทึก", exact: true }).first().click();
    await page.getByText("บันทึกแล้ว", { exact: true }).waitFor();
    assert.equal(saved.target, "");
    assert.equal(await page.getByText("ปิดอยู่", { exact: true }).count(), 2);
    await page.screenshot({ path: path.join(output, `alerts-${width}.png`), fullPage: true });
    canManage = false;
    await page.getByRole("button", { name: "โหลดยอดและสถานะใหม่" }).click();
    await page.waitForFunction(() => document.querySelectorAll('button[type="submit"]').length === 0 && [...document.querySelectorAll('input')].every(input => input.disabled));
    assert.equal(await page.getByRole("button", { name: "บันทึก", exact: true }).count(), 0);
    assert.deepEqual(errors, []); await page.close(); canManage = true;
  }
  console.log(`PASS: mobile/desktop, target save/disable, failed save, viewer permissions and no page overflow. Screenshots: ${output}`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
