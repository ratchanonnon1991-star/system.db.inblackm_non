import "./register-app-alias.mjs";
import env from "@next/env";
import { fileURLToPath } from "node:url";

// Files each stock ID that has no GameInfo game under one, so คลัง can show and
// filter by game and the game's page shows its stock. Run on the server, from the app folder:
//   node scripts/link-stock-games.mjs                         dry run: the guess for every ID
//   node scripts/link-stock-games.mjs --apply                 saves only the sure guesses
//   node scripts/link-stock-games.mjs --apply fc01=12 delta01=34
//                                                             also saves these picks (ID=GameInfo game id)
// An ID already linked to a game is left alone; change it in คลัง › ดูไอดีนี้ › แก้ไข.
env.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
const apply = process.argv.includes("--apply");
const picks = Object.fromEntries(process.argv.slice(2).filter((arg) => /^[^=]+=\d+$/.test(arg))
  .map((arg) => { const [code, id] = arg.split("="); return [code.trim().toLowerCase(), Number(id)]; }));

const { listStockAccounts, updateStockAccount } = await import("../src/server/stock-repository.js");
const { listStockGames } = await import("../src/server/stock-games.js");
const { matchStockGame } = await import("../src/lib/stock-game-match.js");

try {
  const games = await listStockGames();
  if (!games.length) throw new Error("ต่อ GameInfo ไม่ได้ หรือไม่มีเกมเลย");
  const byId = new Map(games.map((game) => [game.id, game]));
  const accounts = (await listStockAccounts()).filter((account) => !account.gameId);
  let saved = 0, left = 0;
  for (const account of accounts) {
    const picked = picks[account.code.toLowerCase()];
    const match = picked ? { game: byId.get(picked), sure: true, picked: true } : matchStockGame(account, games);
    if (picked && !match.game) {
      console.log(`${account.code}: ไม่มีเกม id ${picked} ใน GameInfo`);
      left += 1;
      continue;
    }
    if (match.game) {
      console.log(`${account.code}: → ${match.game.name} (id ${match.game.id})${match.picked ? " · เลือกเอง" : ""}`);
      if (apply) {
        await updateStockAccount(account.id, { gameId: match.game.id, gameName: match.game.name });
        saved += 1;
      }
      continue;
    }
    left += 1;
    const options = (match.candidates || []).slice(0, 8).map((game) => `${game.name} (id ${game.id})`);
    console.log(`${account.code}: ต้องเลือกเอง${account.gameName ? ` · ชีตบอกว่า "${account.gameName}"` : ""}${options.length ? ` · ใกล้เคียง: ${options.join(", ")}` : " · ไม่พบเกมที่ชื่อคล้าย"}`);
  }
  console.log(`\n${apply ? `บันทึกแล้ว ${saved} ไอดี` : "ลองดู (ยังไม่ได้เขียน)"} · ยังไม่ผูก ${left} ไอดี · จากที่ยังไม่มีเกม ${accounts.length} ไอดี`);
  if (left) console.log("ไอดีที่ต้องเลือกเอง: ใส่ ไอดี=เลขเกม ต่อท้าย เช่น fc01=12 หรือแก้ในหน้า ดูไอดีนี้");
  if (!apply) console.log("ถ้าดูแล้วถูกต้อง รันอีกครั้งพร้อม --apply");
  process.exit(0);
} catch (error) {
  console.error("ไม่สำเร็จ:", error instanceof Error ? error.message : error);
  process.exit(1);
}
