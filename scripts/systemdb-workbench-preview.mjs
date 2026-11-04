// Bundle the real UI against local fixtures. No DB, session, or provider calls.
// Browser verification is performed through CUA, not a launched test browser.
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const output = await mkdtemp(path.join(tmpdir(), "systemdb-workbench-"));
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: "development", devtool: false, entry: path.join(root, "tests/ui/systemdb-workbench-entry.jsx"),
    output: { path: output, filename: "preview.js" },
    plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "development" }) })],
    resolve: { alias: { "next/link$": path.join(root, "tests/ui/usdcodashop-link.js"), "@": path.join(root, "src") }, extensions: [".js", ".jsx", ".mjs"] },
    module: { rules: [{ test: /\.m?jsx?$/, resolve: { fullySpecified: false } },
      { test: /\.jsx?$/, exclude: /node_modules/, use: path.join(root, "tests/ui/usdcodashop-loader.cjs") },
      { test: /\.css$/, type: "asset/source" }] },
  });
  compiler.run((error, stats) => compiler.close(() => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
const globals = path.join(root, "src/app/globals.css");
const baseCss = (await require("postcss")([require("@tailwindcss/postcss")()]).process(await readFile(globals, "utf8"), { from: globals })).css;
const css = baseCss + "\n" + await readFile(path.join(root, "src/components/systemdb-workbench.css"), "utf8") + `
.systemdb-local-qa-label{position:fixed;top:19px;right:195px;z-index:30;color:#fff;border:1px solid #ffffff66;border-radius:5px;padding:2px 8px;font:10px/1.7 system-ui;pointer-events:none}
@media(max-width:700px){.systemdb-local-qa-label{top:auto;bottom:6px;right:12px;background:#fff;color:#6b7378;border-color:#e5e7e9;font-size:8px;padding:0 4px}}
#builder-notice{border:1px solid #d4d4d4;border-radius:10px;padding:25px;max-width:460px;font:14px/1.7 system-ui}#builder-notice::backdrop{background:#0005}#builder-notice button{background:#e20e17;color:white;border:0;border-radius:6px;padding:9px 16px}`;
const bundle = await readFile(path.join(output, "preview.js"));
const names = ["LOVE AND DEEPSPACE", "HONKAI: STAR RAIL", "GENSHIN IMPACT", "MOBILE LEGENDS", "ZENLESS ZONE ZERO", "DUMMYLAND", "WESING", "EPIC HEROES", "MARVEL RIVALS", "PUBG MOBILE", "AUTO CHESS", "WHERE WINDS MEET"];
const gameColumns = ["GAME", "ช่องทาง", "Region / Server", "VPN", "วิธีทำงาน", "สถานะ", "LINK", "หมายเหตุ"].map((name) => ({ name, type: "text" }));
const rows = Array.from({ length: 36 }, (_, i) => [names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ""), ["WavePay", "TNT", "AgenH2H", "Donshop"][i % 4], ["MMK / GL", "PHP / GL", "IDR / SEA"][i % 3], i % 11 === 0 ? "ใช้ VPN" : "ไม่ใช้", i % 3 === 0 ? "Bot Auto" : "Manual", i % 7 === 4 ? "ต้องตรวจสอบ" : "พร้อมใช้งาน", `https://docs.example.test/guide/${i + 1}`, "ตรวจ UID และ Server ให้ตรงกับคำสั่งซื้อ"]);
const layout = { hidden: ["หมายเหตุ"], widths: { GAME: 210, ช่องทาง: 112, "Region / Server": 116, VPN: 95, วิธีทำงาน: 100, สถานะ: 130, LINK: 90 }, labels: { LINK: "คู่มือ" }, formats: { LINK: { type: "link" } } };
const queries = [{ id: 1, name: "ข้อมูลเกมและช่องทาง", description: "ค้นหาเกม ช่องทาง และวิธีเติมจากตารางของทีม", sqlText: "SELECT * FROM game_list", updatedAt: "2026-11-03", layout },
  { id: 2, name: "แพ็คและราคา", description: "ตัวอย่างตารางอีกชุดจาก API เทมเพลตเดิม", sqlText: "SELECT * FROM packs", updatedAt: "2026-11-03", layout: {} },
  { id: 3, name: "INFO — ตัวอย่างโหลดไม่สำเร็จ", sqlText: "SELECT * FROM info.GAMELIST", layout: {} },
  { id: 4, name: "ตารางว่าง", sqlText: "SELECT * FROM empty_table", layout: {} }];
const views = [{ id: 10, name: "ข้อมูลเกมและช่องทาง", description: "เทมเพลตงานเติมเกม", isDefault: true, isReadOnly: false, allowStaffEdit: true, allowUserEdit: false, config: { panels: [{ queryId: 1 }] } },
  { id: 11, name: "แพ็คและราคา", isReadOnly: true, config: { panels: [{ queryId: 2 }] } },
  { id: 12, name: "ตรวจสอบข้อมูล", isReadOnly: true, config: { panels: [{ queryId: 3 }, { queryId: 4 }] } }];
const filters = new Map();
const calls = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/preview.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(bundle); }
  if (url.pathname === "/preview.css") { res.setHeader("Content-Type", "text/css"); return res.end(css); }
  if (url.pathname === "/qa-stats") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify(calls)); }
  if (url.pathname.startsWith("/api/")) {
    calls.push({ method: req.method, path: url.pathname });
    res.setHeader("Content-Type", "application/json");
    const fail = req.headers.referer?.includes("scenario=offline");
    const send = (data, status = 200) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    if (fail && ["/api/queries", "/api/views"].includes(url.pathname)) return send({ error: "ทดสอบการโหลดรายการล้มเหลว" }, 503);
    if (url.pathname === "/api/queries") return send({ queries });
    if (url.pathname === "/api/views") return send({ views });
    if (url.pathname === "/api/my-layouts") return send({ layouts: {} });
    const match = url.pathname.match(/^\/api\/queries\/(\d+)\/(run|filter-views|notes|snapshots)$/);
    if (match) {
      const id = Number(match[1]), kind = match[2];
      if (kind === "run" && req.method === "POST") {
        if (id === 3) return send({ error: "SQL ผิดพลาด: permission denied for schema info (fixture)" }, 403);
        const columns = id === 2 ? [{ name: "GAME", type: "text" }, { name: "แพ็ค", type: "text" }, { name: "ต้นทุน USD", type: "number" }, { name: "ราคาขาย USD", type: "number" }] : gameColumns;
        const data = id === 2 ? rows.slice(0, 12).map((r, i) => [r[0], `แพ็ค ${i + 1}`, 4 + i, 5 + i]) : id === 4 ? [] : rows;
        return send({ layout: queries.find((q) => q.id === id)?.layout || {}, columns, rows: data, rowCount: data.length, durationMs: 4, truncated: false, hasMore: false });
      }
      if (kind === "filter-views") {
        if (req.method === "POST") {
          let body = ""; for await (const chunk of req) body += chunk;
          const input = JSON.parse(body);
          const list = filters.get(id) || [];
          const view = { ...input, id: list.length + 1 };
          list.push(view); filters.set(id, list); return send({ filterView: view });
        }
        return send({ filterViews: filters.get(id) || [] });
      }
      if (kind === "notes") return send({ notes: [] });
      if (kind === "snapshots") return send({ snapshots: [] });
    }
    return send({ error: "Fixture does not implement this endpoint" }, 405);
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end('<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>System DB — Real UI local QA</title><link rel="stylesheet" href="/preview.css"><body><div id="root"></div><script src="/preview.js"></script></body></html>');
});
server.listen(Number(process.env.SYSTEMDB_PREVIEW_PORT || 4191), "127.0.0.1", () => console.log(`System DB real-component QA: http://127.0.0.1:${server.address().port} (synthetic API only)`));
