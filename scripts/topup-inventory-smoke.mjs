// Real server-rendered hub/child markup, local fixture only; no live login/DB.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { previewMarkup, ituneMarkup } from "../tests/topup-inventory-tests.mjs";

async function cssFiles(dir) {
  const css = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) css.push(...await cssFiles(file));
    else if (entry.name.endsWith(".css")) css.push(await readFile(file, "utf8"));
  }
  return css;
}
const css = (await cssFiles(path.resolve(".next/static"))).join("\n");
const output = await mkdtemp(path.join(tmpdir(), "topup-inventory-"));
const server = createServer((request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  const content = request.url.startsWith("/projectm/th/topup-inventory/itune") ? ituneMarkup : previewMarkup;
  response.end(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div data-theme="light" class="min-h-screen bg-ll-canvas">${content}</div></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [375, 900, 1536]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/projectm/th/topup-inventory`);
    await page.locator("[data-theme]").evaluate((element, value) => { element.dataset.theme = value; }, theme);
    assert.equal(await page.getByRole("heading", { name: "Topup Inventory", exact: true }).count(), 1);
    assert.equal(await page.locator('[data-inventory-state="coming-soon"]').count(), 1);
    assert.equal(await page.getByRole("link", { name: /Moniepoint/ }).count(), 0);
    assert.equal(await page.getByRole("link", { name: /USDCodashop/ }).count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
    const entry = page.getByRole("link", { name: /iTune/ });
    assert.ok(await entry.evaluate((element) => element === document.activeElement));
    await page.screenshot({ path: path.join(output, `hub-${width}-${theme}.png`), fullPage: true });
    await page.keyboard.press("Enter");
    await page.waitForURL("**/topup-inventory/itune");
    await page.locator("[data-theme]").evaluate((element, value) => { element.dataset.theme = value; }, theme);
    assert.ok(await page.getByRole("link", { name: "Admin จัดการฝั่งแอดมิน" }).getAttribute("href") === "/projectm/th/itune/admin");
    assert.ok(await page.getByRole("link", { name: "Topup จัดการฝั่งเติมเงิน" }).getAttribute("href") === "/projectm/th/itune/topup");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, `itune-${width}-${theme}.png`), fullPage: true });
    await page.getByRole("link", { name: "กลับ Topup Inventory" }).click();
    await page.waitForURL("**/topup-inventory");
    assert.deepEqual(errors, []); await page.close();
  }
  console.log(`PASS: six responsive/theme scenarios, keyboard navigation, disabled future services, iTune links and no horizontal overflow. Screenshots: ${output}`);
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
