// Actual inventory client, mocked API only. Never connects to a real database.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { normalizeUsdInventory } from "../src/lib/usdcodashop-inventory.js";
const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const root = process.cwd(); const output = await mkdtemp(path.join(tmpdir(), "usdcodashop-"));
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: "development", devtool: false, entry: path.join(root, "tests/ui/usdcodashop-entry.jsx"), output: { path: output, filename: "preview.js" },
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
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [375, 1536]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    let entries = []; let canManage = true; let refused = false; let offline = false; const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.route("**/api/projectm/usdcodashop", async (route) => {
      if (offline) return route.fulfill({ status: 503, json: { error: "จำลองโหลดไม่สำเร็จ" } });
      if (route.request().method() === "GET") return route.fulfill({ json: { entries, canManage, hasMore: false } });
      if (refused) return route.fulfill({ status: 409, json: { error: "รายการถูกแก้ไขแล้ว กรุณาโหลดใหม่ก่อนแก้ไข" } });
      const body = route.request().postDataJSON(); const entry = { ...normalizeUsdInventory(body), id: "1", createdBy: "khong", updatedBy: "khong", version: entries.length ? 2 : 1 };
      entries = [entry]; return route.fulfill({ json: { entry } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator("[data-theme]").evaluate((element, value) => { element.dataset.theme = value; }, theme);
    await page.getByRole("button", { name: "เตรียมข้อมูลจากชีท", exact: true }).click();
    assert.equal(await page.getByRole("textbox", { name: "ไอดี/ชื่อบัญชี", exact: true }).inputValue(), "[BOT] (USD) Codashop");
    await page.getByText("14,618.01 USD", { exact: true }).waitFor();
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page.getByRole("heading", { name: "เพิ่มรายการ USDCodashop", exact: true }).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "แก้ไข [BOT] (USD) Codashop", exact: true }).waitFor();
    assert.equal(entries.length, 1); assert.equal(entries[0].remaining, "14618.01");
    await page.getByRole("button", { name: "แก้ไข [BOT] (USD) Codashop", exact: true }).click();
    await page.getByRole("textbox", { name: "ใช้ไป (USD)", exact: true }).fill("20000");
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "มากกว่า" }).waitFor();
    await page.getByRole("textbox", { name: "ใช้ไป (USD)", exact: true }).fill("1,048.79");
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page.getByRole("heading", { name: "แก้ไขรายการ", exact: true }).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "แก้ไข [BOT] (USD) Codashop", exact: true }).waitFor();
    assert.equal(entries[0].remaining, "14617.01");
    await page.getByRole("textbox", { name: "ค้นหาไอดี/ผู้ลงรายการ", exact: true }).fill("not found");
    await page.getByText("ไม่พบรายการที่ค้นหา", { exact: true }).waitFor();
    await page.getByRole("textbox", { name: "ค้นหาไอดี/ผู้ลงรายการ", exact: true }).fill("khong");
    await page.getByRole("button", { name: "แก้ไข [BOT] (USD) Codashop", exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `inventory-${width}-${theme}.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole("button", { name: "แก้ไข [BOT] (USD) Codashop", exact: true }).click(); refused = true;
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "โหลดใหม่" }).waitFor();
    await page.getByRole("button", { name: "ยกเลิก", exact: true }).click(); refused = false; canManage = false;
    await page.getByRole("button", { name: "โหลดใหม่", exact: true }).click();
    await page.getByText("ดูข้อมูลได้ การเพิ่ม/แก้ไขต้องมีสิทธิ์ Projectm Admin", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).count(), 0);
    offline = true; await page.getByRole("button", { name: "โหลดใหม่", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "จำลองโหลดไม่สำเร็จ" }).waitFor();
    assert.deepEqual(errors, []); await page.close();
  }
  console.log(`PASS: four mobile/desktop light/dark scenarios, sheet-row-only preparation, create/edit/search permissions, calculated balance, invalid amounts, conflict and network errors. Screenshots: ${output}`);
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
