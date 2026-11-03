// Actual UI components and server pagination helpers; all records are synthetic.
// No production DB, authentication cookies, provider calls or money writes.
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readProfitHistoryPage } from "../src/server/profit-history-page.js";
import { readInventoryPage } from "../src/server/inventory-page.js";
import { tablePage } from "../src/lib/table-pagination.js";
import { pagedSnapshots } from "../src/server/paged-snapshots.js";

const root = fileURLToPath(new URL("..", import.meta.url)), require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const output = await mkdtemp(path.join(tmpdir(), "gamedb-pagination-"));
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: "development", devtool: false, entry: path.join(root, "tests/ui/pagination-entry.jsx"), output: { path: output, filename: "preview.js" },
    plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "development" }) })],
    resolve: { alias: { "next/link$": path.join(root, "tests/ui/usdcodashop-link.js"), "next/navigation$": path.join(root, "tests/ui/pagination-navigation.js"), "@": path.join(root, "src") }, extensions: [".js", ".jsx", ".mjs"] },
    module: { rules: [{ test: /\.m?jsx?$/, resolve: { fullySpecified: false } }, { test: /\.jsx?$/, exclude: /node_modules/, use: path.join(root, "tests/ui/usdcodashop-loader.cjs") }] },
  });
  compiler.run((error, stats) => compiler.close(() => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
const globals = path.join(root, "src/app/globals.css");
const css = (await require("postcss")([require("@tailwindcss/postcss")()]).process(await readFile(globals, "utf8"), { from: globals })).css;
const bundle = await readFile(path.join(output, "preview.js"));
const actor = { id: "pagination-preview", permissions: ["projectm.claim", "profit.access"] };
let reads = 0, delayMs = 0; const events = [];
const history = Array.from({ length: 137 }, (_, index) => ({ id: `demo-${index + 1}`, orderId: `DEMO-${String(index + 1).padStart(3, "0")}`, txid: `DEMO-${String(index + 1).padStart(3, "0")}`, saleOrderId: `LOCAL-${index + 1}`, createdAt: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(), occurredAt: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(), gameName: index % 2 ? "Honkai: Star Rail" : "Genshin Impact", game: index % 2 ? "Honkai: Star Rail" : "Genshin Impact", packName: "แพ็กตัวอย่าง", cardName: "บัญชีทดลอง", cardId: "demo", categoryId: "demo", account: "DEMO-ACCOUNT", platform: index % 3 ? "page" : "", saleAmount: 100, cost: 70, profit: 30, margin: 30, usedAmount: 7000, remainingBalance: 20000 }));
const send = (res, value) => { res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(value)); };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:4193");
    if (url.pathname === "/preview.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(bundle); }
    if (url.pathname === "/preview.css") { res.setHeader("Content-Type", "text/css"); return res.end(css + "\n.qa-controls{position:sticky;top:0;z-index:100;display:flex;flex-wrap:wrap;gap:16px;padding:12px 20px;background:#fff1f2;border-bottom:1px solid #fecdd3;font:13px/1.6 system-ui;color:#881337}.qa-controls a{text-decoration:underline}"); }
    if (url.pathname === "/qa-stats") return send(res, { reportReads: reads, events });
    if (url.pathname === "/qa/control" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      delayMs = Math.min(1500, Math.max(0, Number(JSON.parse(body).delayMs) || 0));
      return send(res, { delayMs });
    }
    if (url.pathname.startsWith("/api/")) {
      // This diagnostic POST only looks up fake order metadata; money writes
      // to the ledger/provider endpoints remain rejected below.
      if (url.pathname === "/api/projectm/ledger/lookup" && req.method === "POST") return send(res, { orders: {} });
      if (req.method !== "GET") { res.statusCode = 405; return send(res, { error: "Local QA: reads only" }); }
      events.push({ path: url.pathname, query: url.search });
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const request = new Request(url);
      if (url.pathname === "/api/projectm/ledger") return send(res, url.searchParams.get("view") === "accounts" ? { accounts: [{ id: "900001", label: "บัญชีทดลอง (ข้อมูลจำลอง)", currency: "MMK", status: "active" }] } : { entries: [], truncated: false });
      if (url.pathname === "/api/profit/pack-costs") return send(res, { packs: Array.from({ length: 101 }, (_, id) => ({ source: id % 2 ? "donshop" : "agenh2h", game: "เกมทดลอง", packName: `DEMO-PACK-${String(id + 1).padStart(3, "0")}`, orderCount: id + 1, cost: 70 })) });
      if (url.pathname === "/api/gameinfo/market-mappings") return send(res, { workspace: { ownSellerCount: 1, config: { externalGameKey: "DEMO-GAME" },
        packs: Array.from({ length: 101 }, (_, id) => ({ id: `DEMO-PACK-${String(id + 1).padStart(3, "0")}`, name: `DEMO-PACK-${String(id + 1).padStart(3, "0")}`, price: "100", dataMode: "uid", mapping: id % 2 ? { status: "active", externalPackKey: `market-${id}`, name: `Market ${id}` } : null })),
        catalog: { items: [], page: 1, limit: 50, total: 0, summary: { total: 0, mapped: 0, unmapped: 0, stale: 0 } } } });
      if (url.pathname === "/api/profit/sale-prices/summary") return send(res, { platforms: [{ platform: "page" }] });
      if (url.pathname === "/api/profit/agenh2h/history") return send(res, await readProfitHistoryPage(request, actor, "agenh2h", () => { reads++; return history; }));
      if (url.pathname.startsWith("/api/profit/categories/")) {
        const snap = await pagedSnapshots.resolve({ actor, scope: "local-card", snapshot: url.searchParams.get("snapshot"), fresh: url.searchParams.get("fresh") === "1", load: () => { reads++; return history; } });
        const pagination = tablePage(history.length, url.searchParams.get("page"), url.searchParams.get("pageSize"));
        return send(res, { category: { id: "demo", name: "AgenH2H · ทดลอง" }, card: { id: "demo", name: "บัญชีทดลอง", source: "agenh2h", orderCount: 137, orderTotal: 137, saleTotal: 13700, costTotal: 9590, profitTotal: 4110, profitPct: 30, duplicateCount: 0, orders: snap.value.slice(pagination.start, pagination.end) }, pagination: { ...pagination, snapshot: snap.snapshot, observedAt: snap.observedAt } });
      }
      if (url.pathname === "/api/projectm/wavepay") return send(res, await readInventoryPage(request, actor, "wavepay-preview", () => {
        reads++;
        const entries = history.filter((row) => !url.searchParams.get("search") || row.orderId.includes(url.searchParams.get("search"))).map((row) => ({ ...row, phone: "09900000001", usedMmk: "5000.00", balanceMmk: "100000.00", usedSource: "balances", details: { game: row.gameName, pack: row.packName, saleThb: "100.00", costThb: "39.47", invoice: row.txid } }));
        return { entries, total: entries.length, dateFrom: url.searchParams.get("dateFrom"), observedAt: new Date().toISOString(), lines: [{ phone: "09900000001", orders: entries.length, balance: "100000.00", balanceAt: history[0].createdAt, used: "685000.00", sale: "13700.00", cost: "5407.39", profit: "8292.61", margin: "60.53", missingSales: 0, missingCosts: 0, laterOrders: 0 }] };
      }));
      res.statusCode = 404; return send(res, { error: "No fixture for this API" });
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end('<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GameDB Pagination · LOCAL QA</title><link rel="stylesheet" href="/preview.css"><body><div id="root"></div><script src="/preview.js"></script></body></html>');
  } catch (error) { res.statusCode = 500; send(res, { error: error.message }); }
});
server.listen(4193, "127.0.0.1", () => console.log("GameDB pagination preview: http://127.0.0.1:4193/profit (synthetic data only)"));
