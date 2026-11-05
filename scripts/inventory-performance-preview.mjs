// Local browser QA of the actual clients. All data/controls are synthetic;
// no DB/session/provider calls and no browser automation are launched here.
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codaReportCsv } from "../src/lib/usdcodashop-report.js";
import { codaCurrentCostFigures } from "../src/lib/usdcodashop-cost.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const output = await mkdtemp(path.join(tmpdir(), "inventory-performance-"));
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: "development", devtool: false, entry: path.join(root, "tests/ui/inventory-performance-entry.jsx"),
    output: { path: output, filename: "preview.js" }, plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "development" }) })],
    resolve: { alias: { "next/link$": path.join(root, "tests/ui/usdcodashop-link.js"), "@": path.join(root, "src") }, extensions: [".js", ".jsx", ".mjs"] },
    module: { rules: [{ test: /\.m?jsx?$/, resolve: { fullySpecified: false } }, { test: /\.jsx?$/, exclude: /node_modules/, use: path.join(root, "tests/ui/usdcodashop-loader.cjs") }] },
  });
  compiler.run((error, stats) => compiler.close(() => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
const globals = path.join(root, "src/app/globals.css");
const css = (await require("postcss")([require("@tailwindcss/postcss")()]).process(await readFile(globals, "utf8"), { from: globals })).css;
const bundle = await readFile(path.join(output, "preview.js"));
let delayMs = 0, fail = false, active = 0, maxActive = 0;
const events = [];
const quote = { currency: "USD", rate: "33.66", source: "LOCAL FIXTURE", rateAt: "2026-11-03T00:00:00Z", fetchedAt: "2026-11-03T00:00:00Z" };
const entries = Array.from({ length: 3 }, (_, i) => {
  const entry = { id: String(i + 1), kind: "order", orderId: `DEMO-${i + 1}`, amount: "1.00", balance: "100.00", occurredAt: "2026-11-03T03:00:00Z", recordedBy: "Test data", fillCount: 1, fills: [],
    details: { source: "page", game: "Sample Game", pack: `Sample Pack ${i + 1}`, saleThb: "50.00", costThb: "33.66", invoice: `TEST-${i + 1}`, providerBalance: "100.00", operator: "QA" } };
  entry.figures = codaCurrentCostFigures(entry, quote); return entry;
});
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/preview.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(bundle); }
  if (url.pathname === "/preview.css") { res.setHeader("Content-Type", "text/css"); return res.end(css + '\n.qa-controls{position:sticky;top:0;z-index:100;display:flex;flex-wrap:wrap;gap:12px;padding:10px 16px;border-bottom:1px solid #ddd;background:#fff7f7;font:12px/1.7 system-ui;color:#4f2525}.qa-controls a,.qa-controls button{border:1px solid #d4bcbc;border-radius:4px;padding:1px 7px}'); }
  if (url.pathname === "/qa/control" && req.method === "POST") {
    let body = ""; for await (const chunk of req) body += chunk;
    const value = JSON.parse(body); delayMs = Math.min(65000, Math.max(0, Number(value.delayMs) || 0)); fail = Boolean(value.fail);
    res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ delayMs, fail }));
  }
  if (url.pathname === "/qa-stats") {
    res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ active, maxActive, events }));
  }
  if (url.pathname.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json");
    if (req.method !== "GET") { res.statusCode = 405; return res.end(JSON.stringify({ error: "Local preview allows reads only" })); }
    const record = { path: url.pathname, query: url.search, start: Date.now(), state: "reading", delayMs, fail };
    events.push(record); if (events.length > 200) events.shift(); active++; maxActive = Math.max(active, maxActive);
    const timer = setTimeout(() => {
      record.state = "complete"; record.end = Date.now(); active--;
      res.setHeader("Cache-Control", "no-store");
      if (record.fail) { res.statusCode = 504; return res.end(JSON.stringify({ error: "ทดสอบ: ประวัติใช้เวลาประมวลผลเกินกำหนด กรุณาลดช่วงวันที่แล้วลองใหม่" })); }
      if (url.pathname.endsWith("/wavepay")) {
        const rows = entries.map((entry) => ({ ...entry, details: { ...entry.details, costThb: "39.47" }, phone: "09900000001", usedMmk: "5000.00", balanceMmk: "100000.00", usedSource: "balances" }));
        const lines = [{ phone: "09900000001", orders: rows.length, balance: "100000.00", balanceAt: entries[0].occurredAt, used: "15000.00", sale: "150.00", cost: "118.41", profit: "31.59", margin: "21.06", missingSales: 0, missingCosts: 0, laterOrders: 0 }];
        const selected = rows.filter((row) => !url.searchParams.get("search") || row.orderId.includes(url.searchParams.get("search")));
        return res.end(JSON.stringify({ dateFrom: url.searchParams.get("dateFrom"), dateTo: url.searchParams.get("dateTo"), lines, total: selected.length, entries: selected, page: 1, pageSize: 100, observedAt: new Date().toISOString() }));
      }
      const selected = url.searchParams.get("kind") === "deposit" ? [] : entries.filter((entry) => !url.searchParams.get("search") || entry.orderId.includes(url.searchParams.get("search")));
      if (url.searchParams.get("format") === "csv") { res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", 'attachment; filename="local-inventory.csv"'); return res.end(codaReportCsv(selected)); }
      return res.end(JSON.stringify({ configured: true, canManage: false, boundary: "DEMO", opening: "100", deposits: "0", used: "3.00", remaining: "100.00", calculatedRemaining: "97.00", balanceAsOf: entries[0].occurredAt, balanceOrderId: "DEMO-3", lastSync: entries[0].occurredAt, page: 1, total: selected.length, entries: selected, costQuote: quote,
        summary: { sale: (selected.length * 50).toFixed(2), cost: (selected.length * 33.66).toFixed(2), profit: (selected.length * 16.34).toFixed(2), usedUsd: selected.length.toFixed(2), depositUsd: "0", orders: selected.length, deposits: 0, missingSales: 0, missingCosts: 0, duplicateOrders: 0, duplicateTransactions: 0 } }));
    }, delayMs);
    res.on("close", () => { if (!res.writableEnded && record.state === "reading") { clearTimeout(timer); record.state = "aborted"; record.end = Date.now(); active--; } });
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end('<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Topup Inventory Performance — LOCAL QA</title><link rel="stylesheet" href="/preview.css"><body><div id="root"></div><script src="/preview.js"></script></body></html>');
});
server.listen(4192, "127.0.0.1", () => console.log("Inventory performance local preview: http://127.0.0.1:4192/usdcodashop (synthetic reads only)"));
