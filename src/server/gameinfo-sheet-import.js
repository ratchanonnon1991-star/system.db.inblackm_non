// Fills GameInfo from the old "1.1 ข้อมูลเติมเกม UID" Google Sheet: publisher,
// category, the ⚠️ warning, the remark, and the sales channels. Read through
// the same service account the iTune sheet sync uses (read-only scope), and
// like the website import it only ever fills what GameInfo has left empty.
import { readFile } from "node:fs/promises";
import { createGoogleReader } from "@/server/google-sheets";
import { getGameListRow, listGameListRows, updateGameListRow } from "@/server/gameinfo-gamelist";
import { getGamelistPublishers, getGamelistTags, listGamelistPublishersByGame, listGamelistTagsByGame, saveGamelistPublishers, saveGamelistTags } from "@/server/gameinfo-gamelist-tags";
import { getGamelistWarning, listGamelistWarningPresence, saveGamelistWarning } from "@/server/gameinfo-gamelist-tutorial";
import { recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";
import { listGamelistSalesChannelKeysByGame, listGamelistSalesChannels, saveGamelistSalesChannels } from "@/server/gameinfo-sales-channels";
import { gameinfoSheetGameKey, parseGameinfoSourceSheet } from "@/lib/gameinfo-sales-channels";

const DEFAULT_SHEET_ID = "192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks";
export const GAMEINFO_SHEET_IMPORT_PARTS = ["publisher", "category", "warning", "remark", "channels"];

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function gameinfoSourceSheetId() {
  return String(process.env.GAMEINFO_SOURCE_SHEET_ID || DEFAULT_SHEET_ID).trim();
}

/** The address the sheet has to be shared with, or null when no key is configured. */
export async function gameinfoSheetServiceAccount() {
  const keyFile = process.env.ITUNE_SHEETS_CREDENTIALS;
  if (!keyFile) return null;
  try {
    return JSON.parse(await readFile(keyFile, "utf8")).client_email || null;
  } catch {
    return null;
  }
}

async function readSource() {
  if (!process.env.ITUNE_SHEETS_CREDENTIALS) {
    throw createHttpError("ยังไม่ได้ตั้งค่า Google service account (ITUNE_SHEETS_CREDENTIALS) บน server", 503);
  }
  const reader = createGoogleReader({ readOnly: true });
  const sheetId = gameinfoSourceSheetId();
  try {
    const [gamelist, onoff] = await Promise.all([
      reader.rows(sheetId, "GAMELIST"),
      reader.rows(sheetId, "List Game เปิด-ปิด"),
    ]);
    return parseGameinfoSourceSheet({ gamelist, onoff });
  } catch (error) {
    if (error?.status === 403 || error?.status === 404) {
      const email = await gameinfoSheetServiceAccount();
      throw createHttpError(`อ่านชีตไม่ได้ — แชร์ชีตให้ ${email || "service account"} แบบผู้มีสิทธิ์อ่านก่อน`, 403);
    }
    throw error;
  }
}

// What one sheet game would add to one GameInfo game, given what it has now.
function proposalFor(sheetGame, { hasPublisher, hasCategory, hasWarning, remark, channelKeys }) {
  const fills = {};
  if (sheetGame.publisher && !hasPublisher) fills.publisher = sheetGame.publisher;
  if (sheetGame.category && !hasCategory) fills.category = sheetGame.category;
  if (sheetGame.warning && !hasWarning) fills.warning = sheetGame.warning;
  if (sheetGame.remark && !String(remark || "").trim()) fills.remark = sheetGame.remark;
  const channels = Object.values(sheetGame.channels).filter((row) => !channelKeys.has(row.channel));
  if (channels.length) fills.channels = channels;
  return fills;
}

/** Every GameInfo game the sheet can still add something to, plus what did not match. */
// `source` (already-parsed sheet games) is for tests; normally the sheet is read.
export async function previewGameinfoSheetImport({ source: givenSource = null } = {}) {
  const [source, rows, publishersByGame, tagsByGame, warningPresence, channelKeysByGame] = await Promise.all([
    givenSource || readSource(),
    listGameListRows(),
    listGamelistPublishersByGame(),
    listGamelistTagsByGame(),
    listGamelistWarningPresence(),
    listGamelistSalesChannelKeysByGame(),
  ]);
  const sheetByKey = new Map(source.map((game) => [game.key, game]));
  const matchedKeys = new Set();
  const items = [];
  let complete = 0;
  for (const row of rows) {
    const sheetGame = sheetByKey.get(gameinfoSheetGameKey(row.game));
    if (!sheetGame) continue;
    matchedKeys.add(sheetGame.key);
    const fills = proposalFor(sheetGame, {
      hasPublisher: (publishersByGame[row.id] || []).length > 0,
      hasCategory: (tagsByGame[row.id] || []).length > 0,
      hasWarning: Boolean(warningPresence[row.id]),
      remark: row.remark,
      channelKeys: channelKeysByGame[row.id] || new Set(),
    });
    if (Object.keys(fills).length) items.push({ gameId: row.id, game: row.game, fills });
    else complete += 1;
  }
  return {
    sheetId: gameinfoSourceSheetId(),
    sheetGames: source.length,
    items,
    complete,
    unmatchedSheetGames: source.filter((game) => !matchedKeys.has(game.key)).map((game) => game.name),
  };
}

/**
 * Applies the chosen parts to the chosen games. Everything is re-read and
 * re-checked here, so a field someone filled since the preview stays theirs.
 */
export async function applyGameinfoSheetImport(gameIds, parts, actor = null, { source = null } = {}) {
  if (!Array.isArray(gameIds) || !gameIds.length) throw createHttpError("ยังไม่ได้เลือกเกม", 400);
  if (gameIds.length > 500) throw createHttpError("นำเข้าได้ครั้งละไม่เกิน 500 เกม", 400);
  const wanted = new Set((parts || []).filter((part) => GAMEINFO_SHEET_IMPORT_PARTS.includes(part)));
  if (!wanted.size) throw createHttpError("ยังไม่ได้เลือกข้อมูลที่จะนำเข้า", 400);
  const sheetByKey = new Map((source || await readSource()).map((game) => [game.key, game]));
  const results = [];
  for (const rawId of gameIds) {
    const gameId = Number(rawId);
    try {
      const row = await getGameListRow(gameId);
      const sheetGame = row ? sheetByKey.get(gameinfoSheetGameKey(row.game)) : null;
      if (!sheetGame) {
        results.push({ gameId, filled: [], error: "ไม่พบเกมนี้ในชีต" });
        continue;
      }
      const [publishers, tags, warning, channels] = await Promise.all([
        getGamelistPublishers(gameId),
        getGamelistTags(gameId),
        getGamelistWarning(gameId),
        listGamelistSalesChannels(gameId),
      ]);
      const fills = proposalFor(sheetGame, {
        hasPublisher: publishers.length > 0,
        hasCategory: tags.length > 0,
        hasWarning: warning.categories.some((category) => category.steps.length > 0),
        remark: row.remark,
        channelKeys: new Set(channels.map((item) => item.channel)),
      });
      const filled = [];
      if (wanted.has("publisher") && fills.publisher) {
        await saveGamelistPublishers(gameId, [fills.publisher]);
        filled.push("publisher");
      }
      if (wanted.has("category") && fills.category) {
        await saveGamelistTags(gameId, [fills.category]);
        filled.push("category");
      }
      if (wanted.has("warning") && fills.warning) {
        await saveGamelistWarning(gameId, [{ name: "", steps: [{ title: "ข้อควรระวัง", description: fills.warning }] }], null, actor);
        filled.push("warning");
      }
      if (wanted.has("remark") && fills.remark) {
        await updateGameListRow(gameId, { remark: fills.remark }, null, actor);
        filled.push("remark");
      }
      if (wanted.has("channels") && fills.channels) {
        await saveGamelistSalesChannels(gameId, fills.channels, { actor, source: "import" });
        filled.push("channels");
      }
      if (filled.includes("publisher") || filled.includes("category")) {
        // Those two saves keep no history of their own.
        await recordGameinfoAudit({ gameId, area: "sheet-import", action: "fill", actor, source: "import", after: { publisher: fills.publisher, category: fills.category } });
      }
      results.push({ gameId, filled });
    } catch (error) {
      results.push({ gameId, filled: [], error: error instanceof Error ? error.message : "นำเข้าไม่สำเร็จ" });
    }
  }
  const count = (part) => results.filter((item) => item.filled.includes(part)).length;
  return {
    results,
    summary: {
      games: results.filter((item) => item.filled.length).length,
      publisher: count("publisher"),
      category: count("category"),
      warning: count("warning"),
      remark: count("remark"),
      channels: count("channels"),
      failed: results.filter((item) => item.error).length,
    },
  };
}
