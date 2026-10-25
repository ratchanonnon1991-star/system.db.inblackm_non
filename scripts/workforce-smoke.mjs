// Real dashboard component and compiled CSS; mocked HTTP only, no real DB.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { addDays, hourAt } from "../src/lib/workforce-planning.js";
import { buildWorkforceReport } from "../src/server/workforce-report.js";
const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const root = process.cwd(), output = await mkdtemp(path.join(tmpdir(), "workforce-smoke-"));
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: "development", devtool: false, entry: path.join(root, "tests/ui/workforce-entry.jsx"), output: { path: output, filename: "preview.js" },
    plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "development" }) })],
    resolve: { alias: { "next/link$": path.join(root, "tests/ui/usdcodashop-link.js"), "@": path.join(root, "src") }, extensions: [".js", ".jsx", ".mjs"] },
    module: { rules: [{ test: /\.m?jsx?$/, resolve: { fullySpecified: false } }, { test: /\.jsx?$/, exclude: /node_modules/, use: path.join(root, "tests/ui/jsx-loader.cjs") }] },
  });
  compiler.run((error, stats) => compiler.close(() => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
async function cssFiles(dir) {
  const values = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) values.push(...await cssFiles(file));
    else if (item.name.endsWith(".css")) values.push(await readFile(file, "utf8"));
  }
  return values;
}
const css = (await cssFiles(path.join(root, ".next/static"))).join("\n"), bundle = await readFile(path.join(output, "preview.js"));
const server = createServer((request, response) => {
  if (request.url === "/preview.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle); }
  else { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div id="root"></div><script src="/preview.js"></script></body></html>`); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const date = "2026-10-24", now = new Date("2026-10-24T18:00:00+07:00"), buckets = [];
  for (let d = 56; d >= 0; d--) for (let h = 9; h < 33; h++) {
    for (const channel of ["itemku", "web"]) buckets.push({ channel, hour: hourAt(addDays(date, -d), h).toISOString(), orders: 5, units: h >= 18 ? 15 : 10, open_orders: 0, open_units: 0, unknown_status: 0, cancelled: 0 });
  }
  for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    await context.addInitScript(value => localStorage.setItem("ll-theme", value), theme);
    const page = await context.newPage();
    await page.clock.install({ time: now });
    const errors = []; let offline = false;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/workforce?**", route => {
      if (offline) return route.fulfill({ status: 503, json: { error: "จำลองฐานข้อมูลขัดข้อง" } });
      const url = new URL(route.request().url());
      const report = buildWorkforceReport({ buckets: buckets.filter(b => +new Date(b.hour) <= +now), sources: [{ database: "web", table: "queue_bot_orders", available: true }], warnings: [], fetchedAt: now.toISOString() }, { date: url.searchParams.get("date"), now, channel: url.searchParams.get("channel") });
      return route.fulfill({ json: { report } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole("heading", { name: "รายชั่วโมง", exact: true }).waitFor();
    assert.equal(await page.getByText(/Full time|Intern|Part time/).count(), 0);
    assert.equal(await page.getByRole("spinbutton").count(), 3);
    await page.getByLabel("ชิ้นงาน / คน / ชม.").fill("8");
    await page.reload();
    await page.getByRole("heading", { name: "รายชั่วโมง", exact: true }).waitFor();
    assert.equal(await page.getByLabel("ชิ้นงาน / คน / ชม.").inputValue(), "8");
    await page.getByLabel("ช่องทาง", { exact: true }).selectOption("itemku");
    await page.getByRole("heading", { name: "รายชั่วโมง", exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `workforce-${width}-${theme}.png`), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth ? [] :
      [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(e => `${e.tagName}.${e.className} ${Math.round(e.getBoundingClientRect().right)}`));
    assert.deepEqual(overflow, [], `horizontal overflow at ${width}px ${theme}`);
    assert.deepEqual(errors, []);
    offline = true;
    await page.getByRole("button", { name: "อัปเดตข้อมูล", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "จำลองฐานข้อมูลขัดข้อง" }).waitFor();
    offline = false;
    await page.getByRole("button", { name: "ลองใหม่", exact: true }).click();
    await page.getByRole("heading", { name: "รายชั่วโมง", exact: true }).waitFor();
    await context.close();
  }
  console.log(`PASS: mobile/desktop, light/dark, single rate, saved plan, channel filter, failures and retry; no horizontal page overflow. Screenshots: ${output}`);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
