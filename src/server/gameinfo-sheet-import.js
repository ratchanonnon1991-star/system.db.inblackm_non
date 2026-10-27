// Fills GameInfo from the old "1.1 ข้อมูลเติมเกม UID" Google Sheet: publisher,
// category, the ⚠️ warning, the remark, the sales channels, and the UID packs
// from each game's own tab. Read through
// the same service account the iTune sheet sync uses (read-only scope), and
// like the website import it only ever fills what GameInfo has left empty.
import { readFile } from "node:fs/promises";
import { createGoogleReader } from "@/server/google-sheets";
import { getGameListRow, listGameListRows, updateGameListRow } from "@/server/gameinfo-gamelist";
import { getGamelistPublishers, getGamelistTags, listGamelistPublishersByGame, listGamelistTagsByGame, saveGamelistPublishers, saveGamelistTags } from "@/server/gameinfo-gamelist-tags";
import { getGamelistWarning, listGamelistWarningPresence, saveGamelistWarning } from "@/server/gameinfo-gamelist-tutorial";
import { getGamelistPacks, listGamelistRealPackCountByGame, recordGameinfoAudit, saveGamelistPacks } from "@/server/gameinfo-gamelist-packs";
import { listGamelistSalesChannelKeysByGame, listGamelistSalesChannels, saveGamelistSalesChannels } from "@/server/gameinfo-sales-channels";
import { gameinfoSheetGameKey, parseGameinfoSourceSheet } from "@/lib/gameinfo-sales-channels";
import { gameinfoHasRealPacks } from "@/lib/gameinfo-pack-model";
import { countGameinfoSheetPacks, gameinfoSheetCostFormulaColumns, gameinfoSheetCostProfiles, gameinfoSheetPackTree, gameinfoSheetPackUnits, parseGameinfoSheetPackTab } from "@/lib/gameinfo-sheet-packs";

const DEFAULT_SHEET_ID = "192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks";
export const GAMEINFO_SHEET_IMPORT_PARTS = ["publisher", "category", "warning", "remark", "channels", "packs"];

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

// `exportAccess` (Drive read) is only for scripts/import-sheet-notices.mjs,
// which exports the whole workbook for its pictures — never in a web request.
export function openGameinfoSheetReader({ exportAccess = false } = {}) {
  if (!process.env.ITUNE_SHEETS_CREDENTIALS) {
    throw createHttpError("ยังไม่ได้ตั้งค่า Google service account (ITUNE_SHEETS_CREDENTIALS) บน server", 503);
  }
  return createGoogleReader({ readOnly: true, exportAccess });
}

const openReader = () => openGameinfoSheetReader();

export async function withSheetAccess(read) {
  try {
    return await read();
  } catch (error) {
    if (error?.status === 403 || error?.status === 404) {
      // Google says which: not shared, API not enabled for the key's project, or no such sheet.
      const reason = String(error.message || "").replace(/^Google API HTTP \d+: /, "");
      if (/has not been used|is disabled|SERVICE_DISABLED/i.test(reason)) {
        throw createHttpError(`อ่านชีตไม่ได้ — ยังไม่ได้เปิด Google Sheets API ในโปรเจกต์ของ service account (${reason})`, 503);
      }
      const email = await gameinfoSheetServiceAccount();
      throw createHttpError(`อ่านชีตไม่ได้ — แชร์ชีตให้ ${email || "service account"} แบบผู้มีสิทธิ์อ่านก่อน (Google: ${reason})`, 403);
    }
    throw error;
  }
}

export function readSource(reader) {
  const sheetId = gameinfoSourceSheetId();
  return withSheetAccess(async () => {
    const [gamelist, onoff] = await Promise.all([
      reader.rows(sheetId, "GAMELIST"),
      reader.rows(sheetId, "List Game เปิด-ปิด"),
    ]);
    return parseGameinfoSourceSheet({ gamelist, onoff });
  });
}

// "U.HONKAI IMPACT(ASIA)" → "honkaiimpact(asia)": tab names carry a mode prefix.
function tabNameKey(title) {
  return String(title || "").replace(/^\s*(U|ID)\s*\.\s*/i, "").replace(/\s+/g, "").toLocaleLowerCase("en");
}

/** Each given sheet game's own tab: Map key → title. The one GAMELIST links to, else the one named after the game. */
export async function gameinfoSheetGameTabs(reader, sheetGames) {
  const tabs = await reader.tabs(gameinfoSourceSheetId());
  const byGid = new Map(tabs.map((tab) => [tab.gid, tab.title]));
  const byName = new Map(tabs.map((tab) => [tabNameKey(tab.title), tab.title]));
  const wanted = new Map();
  for (const game of sheetGames) {
    const title = byGid.get(game.tabGid) || byName.get(tabNameKey(game.name));
    if (title && !["gamelist", "listgameเปิด-ปิด"].includes(tabNameKey(title))) wanted.set(game.key, title);
  }
  return wanted;
}

/** The pack table of each given sheet game's own tab: Map key → { tab, parsed }. */
async function readPackTabs(reader, sheetGames) {
  if (!sheetGames.length) return new Map();
  const sheetId = gameinfoSourceSheetId();
  return withSheetAccess(async () => {
    const wanted = await gameinfoSheetGameTabs(reader, sheetGames);
    const rowsByTab = await reader.batchRows(sheetId, [...new Set(wanted.values())]);
    const out = new Map();
    for (const [key, tab] of wanted) {
      const parsed = parseGameinfoSheetPackTab(rowsByTab[tab] || []);
      if (parsed) out.set(key, { tab, parsed });
    }
    return out;
  });
}

// What one sheet game would add to one GameInfo game, given what it has now.
function proposalFor(sheetGame, { hasPublisher, hasCategory, hasWarning, remark, channelKeys, hasPacks, packTab }) {
  const fills = {};
  if (sheetGame.publisher && !hasPublisher) fills.publisher = sheetGame.publisher;
  if (sheetGame.category && !hasCategory) fills.category = sheetGame.category;
  if (sheetGame.warning && !hasWarning) fills.warning = sheetGame.warning;
  if (sheetGame.remark && !String(remark || "").trim()) fills.remark = sheetGame.remark;
  const channels = Object.values(sheetGame.channels).filter((row) => !channelKeys.has(row.channel));
  if (channels.length) fills.channels = channels;
  if (packTab && !hasPacks) {
    fills.packs = {
      tab: packTab.tab,
      count: countGameinfoSheetPacks(packTab.parsed),
      unit: gameinfoSheetPackUnits(packTab.parsed),
      rates: gameinfoSheetCostProfiles(packTab.parsed).map((profile) => `${profile.inputCurrency} ${profile.baseValue}`),
    };
  }
  return fills;
}

/** Every GameInfo game the sheet can still add something to, plus what did not match. */
// `source` (already-parsed sheet games) and `reader` are for tests; normally the sheet is read.
export async function previewGameinfoSheetImport({ source: givenSource = null, reader: givenReader = null } = {}) {
  const reader = givenReader || (givenSource ? null : openReader());
  const [source, rows, publishersByGame, tagsByGame, warningPresence, channelKeysByGame, packCountByGame] = await Promise.all([
    givenSource || readSource(reader),
    listGameListRows(),
    listGamelistPublishersByGame(),
    listGamelistTagsByGame(),
    listGamelistWarningPresence(),
    listGamelistSalesChannelKeysByGame(),
    listGamelistRealPackCountByGame(),
  ]);
  const sheetByKey = new Map(source.map((game) => [game.key, game]));
  const matched = rows
    .map((row) => ({ row, sheetGame: sheetByKey.get(gameinfoSheetGameKey(row.game)) }))
    .filter((item) => item.sheetGame);
  // Only the tabs of games that still have no packs are worth reading.
  const packTabs = reader
    ? await readPackTabs(reader, matched.filter(({ row }) => !packCountByGame[row.id]).map(({ sheetGame }) => sheetGame))
    : new Map();
  const matchedKeys = new Set();
  const items = [];
  let complete = 0;
  for (const { row, sheetGame } of matched) {
    matchedKeys.add(sheetGame.key);
    const fills = proposalFor(sheetGame, {
      hasPublisher: (publishersByGame[row.id] || []).length > 0,
      hasCategory: (tagsByGame[row.id] || []).length > 0,
      hasWarning: Boolean(warningPresence[row.id]),
      remark: row.remark,
      channelKeys: channelKeysByGame[row.id] || new Set(),
      hasPacks: Boolean(packCountByGame[row.id]),
      packTab: packTabs.get(sheetGame.key),
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
export async function applyGameinfoSheetImport(gameIds, parts, actor = null, { source = null, reader: givenReader = null } = {}) {
  if (!Array.isArray(gameIds) || !gameIds.length) throw createHttpError("ยังไม่ได้เลือกเกม", 400);
  if (gameIds.length > 500) throw createHttpError("นำเข้าได้ครั้งละไม่เกิน 500 เกม", 400);
  const wanted = new Set((parts || []).filter((part) => GAMEINFO_SHEET_IMPORT_PARTS.includes(part)));
  if (!wanted.size) throw createHttpError("ยังไม่ได้เลือกข้อมูลที่จะนำเข้า", 400);
  const reader = givenReader || (source ? null : openReader());
  const sheetByKey = new Map((source || await readSource(reader)).map((game) => [game.key, game]));
  let packTabs = new Map();
  if (wanted.has("packs") && reader) {
    const ids = new Set(gameIds.map(Number));
    const chosen = (await listGameListRows()).filter((row) => ids.has(row.id));
    packTabs = await readPackTabs(reader, chosen.map((row) => sheetByKey.get(gameinfoSheetGameKey(row.game))).filter(Boolean));
  }
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
      const [publishers, tags, warning, channels, packs] = await Promise.all([
        getGamelistPublishers(gameId),
        getGamelistTags(gameId),
        getGamelistWarning(gameId),
        listGamelistSalesChannels(gameId),
        getGamelistPacks(gameId),
      ]);
      const fills = proposalFor(sheetGame, {
        hasPublisher: publishers.length > 0,
        hasCategory: tags.length > 0,
        hasWarning: warning.categories.some((category) => category.steps.length > 0),
        remark: row.remark,
        channelKeys: new Set(channels.map((item) => item.channel)),
        hasPacks: gameinfoHasRealPacks(packs.currencies),
        packTab: packTabs.get(sheetGame.key),
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
      if (wanted.has("packs") && fills.packs) {
        // The empty placeholder pack goes; the game's formula columns and
        // cost profiles stay, joined by one profile per cost currency in the tab.
        const tree = gameinfoSheetPackTree(packTabs.get(sheetGame.key).parsed);
        const kept = packs.costProfiles.filter((profile) => !tree.costProfiles.some((added) => added.id === profile.id));
        const costProfiles = [...kept, ...tree.costProfiles];
        await saveGamelistPacks(gameId, {
          currencies: tree.currencies,
          computedColumns: gameinfoSheetCostFormulaColumns(packs.computedColumns, costProfiles) || packs.computedColumns,
          costProfiles,
          actor,
          source: "import",
          expectedVersion: packs.version,
        });
        filled.push("packs");
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
      packs: count("packs"),
      failed: results.filter((item) => item.error).length,
    },
  };
}

/**
 * For games already imported before the cost formula existed: every UID game
 * with a cost profile from the sheet and no ต้นทุน formula of its own gets
 * one. Packs and everything else are saved back unchanged.
 */
export async function applyGameinfoSheetCostFormulas(actor = null) {
  const updated = [];
  const failed = [];
  for (const row of await listGameListRows()) {
    try {
      const packs = await getGamelistPacks(row.id);
      const computedColumns = gameinfoSheetCostFormulaColumns(packs.computedColumns, packs.costProfiles);
      if (!computedColumns) continue;
      await saveGamelistPacks(row.id, {
        currencies: packs.currencies,
        computedColumns,
        costProfiles: packs.costProfiles,
        actor,
        source: "import",
        expectedVersion: packs.version,
      });
      updated.push({ gameId: row.id, game: String(row.game).split("\n")[0] });
    } catch (error) {
      failed.push({ gameId: row.id, error: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" });
    }
  }
  return { updated, failed };
}
