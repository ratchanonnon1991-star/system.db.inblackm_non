// Fills GameInfo from the old "1.1 ข้อมูลเติมเกม UID" Google Sheet: publisher,
// category, the ⚠️ warning, the remark, the sales channels, the UID packs
// from each game's own tab, and that tab's NOTICE notes with their pictures
// (from an .xlsx export, since the Sheets API has no pictures). Read through
// the same service account the iTune sheet sync uses (read-only scope), and
// like the website import it only ever fills what GameInfo has left empty.
import { readFile } from "node:fs/promises";
import { createGoogleReader } from "@/server/google-sheets";
import { getGameListRow, listGameListRows, updateGameListRow } from "@/server/gameinfo-gamelist";
import { getGamelistPublishers, getGamelistTags, listGamelistPublishersByGame, listGamelistTagsByGame, saveGamelistPublishers, saveGamelistTags } from "@/server/gameinfo-gamelist-tags";
import { getGamelistTutorial, getGamelistWarning, listGamelistTutorialPresence, listGamelistWarningPresence, saveGamelistTutorial, saveGamelistWarning } from "@/server/gameinfo-gamelist-tutorial";
import { readXlsxSheetsWithImages } from "@/server/xlsx-reader";
import { countGameinfoSheetNotices, parseGameinfoSheetNotices } from "@/lib/gameinfo-sheet-notices";
import { MAX_STEP_IMAGE_DATA_BYTES } from "@/lib/gameinfo-step-image-size";
import { getGamelistPacks, listGamelistRealPackCountByGame, recordGameinfoAudit, saveGamelistPacks } from "@/server/gameinfo-gamelist-packs";
import { listGamelistSalesChannelKeysByGame, listGamelistSalesChannels, saveGamelistSalesChannels } from "@/server/gameinfo-sales-channels";
import { gameinfoSheetGameKey, parseGameinfoSourceSheet } from "@/lib/gameinfo-sales-channels";
import { gameinfoHasRealPacks } from "@/lib/gameinfo-pack-model";
import { countGameinfoSheetPacks, gameinfoSheetCostFormulaColumns, gameinfoSheetCostProfiles, gameinfoSheetPackTree, gameinfoSheetPackUnits, parseGameinfoSheetPackTab } from "@/lib/gameinfo-sheet-packs";

const DEFAULT_SHEET_ID = "192YoswgJIVdU-XQtbEUQrRg-h7jqbEblrGvA4Jqdnks";
export const GAMEINFO_SHEET_IMPORT_PARTS = ["publisher", "category", "warning", "remark", "channels", "packs", "notices"];

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

function openReader() {
  if (!process.env.ITUNE_SHEETS_CREDENTIALS) {
    throw createHttpError("ยังไม่ได้ตั้งค่า Google service account (ITUNE_SHEETS_CREDENTIALS) บน server", 503);
  }
  return createGoogleReader({ readOnly: true, exportAccess: true });
}

async function withSheetAccess(read) {
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

function readSource(reader) {
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
async function gameTabs(reader, sheetGames) {
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
    const wanted = await gameTabs(reader, sheetGames);
    const rowsByTab = await reader.batchRows(sheetId, [...new Set(wanted.values())]);
    const out = new Map();
    for (const [key, tab] of wanted) {
      const parsed = parseGameinfoSheetPackTab(rowsByTab[tab] || []);
      if (parsed) out.set(key, { tab, parsed });
    }
    return out;
  });
}

// The export is tens of MB and takes Google longer than a request may run
// behind Cloudflare, so it loads in the background: a request either finds it
// ready or starts it and says so. One download serves a preview and the
// applies after it.
const WORKBOOK_TTL_MS = 30 * 60 * 1000;
let workbookCache = null;
let workbookLoad = null;

function startWorkbookLoad(reader, sheetId) {
  if (workbookLoad?.sheetId === sheetId && !workbookLoad.error) return workbookLoad;
  const load = { sheetId, error: null, startedAt: Date.now() };
  load.promise = withSheetAccess(() => reader.exportXlsx(sheetId))
    .then((buffer) => {
      workbookCache = { sheetId, at: Date.now(), workbook: readXlsxSheetsWithImages(buffer) };
      workbookLoad = null;
    })
    .catch((error) => {
      load.error = error instanceof Error ? error.message : "โหลดไฟล์ชีตไม่สำเร็จ";
    });
  workbookLoad = load;
  return load;
}

/** The exported workbook, or null while it is still loading (`wait` waits instead, for tests and scripts). */
async function sourceWorkbook(reader, { wait = false } = {}) {
  const sheetId = gameinfoSourceSheetId();
  if (workbookCache && workbookCache.sheetId === sheetId && Date.now() - workbookCache.at < WORKBOOK_TTL_MS) return workbookCache.workbook;
  const load = startWorkbookLoad(reader, sheetId);
  if (wait) await load.promise;
  if (load.error) {
    workbookLoad = null; // the next request tries again
    throw createHttpError(`โหลดรูปจากชีตไม่สำเร็จ: ${load.error}`, 502);
  }
  return wait ? workbookCache?.workbook ?? null : null;
}

/**
 * Each given sheet game's NOTICE sections: Map key → { tab, categories, media },
 * or null while the workbook is still loading.
 */
async function readNoticeTabs(reader, sheetGames, options = {}) {
  if (!sheetGames.length) return new Map();
  const workbook = await sourceWorkbook(reader, options);
  if (!workbook) return null;
  const wanted = await withSheetAccess(() => gameTabs(reader, sheetGames));
  const byTitle = new Map(workbook.sheets.map((sheet) => [sheet.title, sheet]));
  const out = new Map();
  for (const [key, tab] of wanted) {
    const sheet = byTitle.get(tab);
    const categories = sheet ? parseGameinfoSheetNotices(sheet) : [];
    if (categories.length) out.set(key, { tab, categories, media: workbook.media });
  }
  return out;
}

const MEDIA_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

// A picture as the data URL tutorial steps store, shrunk like the editor's
// own upload (1600px, WebP) when sharp is there to do it.
async function pictureDataUrl(bytes, path) {
  try {
    const { default: sharp } = await import("sharp");
    const webp = await sharp(bytes).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    return `data:image/webp;base64,${webp.toString("base64")}`;
  } catch {
    const type = MEDIA_TYPES[String(path).split(".").pop().toLowerCase()];
    return type ? `data:${type};base64,${bytes.toString("base64")}` : null;
  }
}

/**
 * The NOTICE sections as tutorial categories with their pictures inlined.
 * Pictures that would take the game past the editor's 4MB limit are left out.
 */
async function noticeTutorial(noticeTab) {
  let budget = MAX_STEP_IMAGE_DATA_BYTES;
  let skipped = 0;
  const categories = [];
  for (const [categoryIndex, category] of noticeTab.categories.entries()) {
    const steps = [];
    for (const [stepIndex, step] of category.steps.entries()) {
      const imageUrls = [];
      for (const path of step.images) {
        const bytes = noticeTab.media(path);
        const url = bytes ? await pictureDataUrl(bytes, path) : null;
        if (url && url.length <= budget) {
          imageUrls.push(url);
          budget -= url.length;
        } else skipped += 1;
      }
      steps.push({ id: `sheet_c${categoryIndex + 1}_s${stepIndex + 1}`, title: "", description: step.description, imageUrls, videoUrl: "" });
    }
    categories.push({ id: `sheet_c${categoryIndex + 1}`, name: category.name, steps });
  }
  return { categories, skipped };
}

// What one sheet game would add to one GameInfo game, given what it has now.
function proposalFor(sheetGame, { hasPublisher, hasCategory, hasWarning, remark, channelKeys, hasPacks, packTab, hasTutorial, noticeTab }) {
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
  if (noticeTab && !hasTutorial) fills.notices = { tab: noticeTab.tab, ...countGameinfoSheetNotices(noticeTab.categories) };
  return fills;
}

/** Every GameInfo game the sheet can still add something to, plus what did not match. */
// `source` (already-parsed sheet games) and `reader` are for tests; normally the sheet is read.
export async function previewGameinfoSheetImport({ source: givenSource = null, reader: givenReader = null, waitForPictures = false } = {}) {
  const reader = givenReader || (givenSource ? null : openReader());
  const [source, rows, publishersByGame, tagsByGame, warningPresence, channelKeysByGame, packCountByGame, tutorialPresence] = await Promise.all([
    givenSource || readSource(reader),
    listGameListRows(),
    listGamelistPublishersByGame(),
    listGamelistTagsByGame(),
    listGamelistWarningPresence(),
    listGamelistSalesChannelKeysByGame(),
    listGamelistRealPackCountByGame(),
    listGamelistTutorialPresence(),
  ]);
  const sheetByKey = new Map(source.map((game) => [game.key, game]));
  const matched = rows
    .map((row) => ({ row, sheetGame: sheetByKey.get(gameinfoSheetGameKey(row.game)) }))
    .filter((item) => item.sheetGame);
  // Only the tabs of games that still have no packs are worth reading.
  const packTabs = reader
    ? await readPackTabs(reader, matched.filter(({ row }) => !packCountByGame[row.id]).map(({ sheetGame }) => sheetGame))
    : new Map();
  // The notes need the whole workbook; if that export fails the rest of the preview still stands.
  let noticeTabs = new Map();
  let noticesError = null;
  let noticesPending = false;
  if (reader?.exportXlsx) {
    try {
      const found = await readNoticeTabs(reader, matched.filter(({ row }) => !tutorialPresence[row.id]).map(({ sheetGame }) => sheetGame), { wait: waitForPictures });
      if (found) noticeTabs = found;
      else noticesPending = true;
    } catch (error) {
      noticesError = error instanceof Error ? error.message : "อ่านรูปจากชีตไม่สำเร็จ";
    }
  }
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
      hasTutorial: Boolean(tutorialPresence[row.id]),
      noticeTab: noticeTabs.get(sheetGame.key),
    });
    if (Object.keys(fills).length) items.push({ gameId: row.id, game: row.game, fills });
    else complete += 1;
  }
  return {
    sheetId: gameinfoSourceSheetId(),
    sheetGames: source.length,
    items,
    complete,
    noticesError,
    noticesPending,
    unmatchedSheetGames: source.filter((game) => !matchedKeys.has(game.key)).map((game) => game.name),
  };
}

/**
 * Applies the chosen parts to the chosen games. Everything is re-read and
 * re-checked here, so a field someone filled since the preview stays theirs.
 */
export async function applyGameinfoSheetImport(gameIds, parts, actor = null, { source = null, reader: givenReader = null, waitForPictures = false } = {}) {
  if (!Array.isArray(gameIds) || !gameIds.length) throw createHttpError("ยังไม่ได้เลือกเกม", 400);
  if (gameIds.length > 500) throw createHttpError("นำเข้าได้ครั้งละไม่เกิน 500 เกม", 400);
  const wanted = new Set((parts || []).filter((part) => GAMEINFO_SHEET_IMPORT_PARTS.includes(part)));
  if (!wanted.size) throw createHttpError("ยังไม่ได้เลือกข้อมูลที่จะนำเข้า", 400);
  const reader = givenReader || (source ? null : openReader());
  const sheetByKey = new Map((source || await readSource(reader)).map((game) => [game.key, game]));
  let packTabs = new Map();
  let noticeTabs = new Map();
  if ((wanted.has("packs") || wanted.has("notices")) && reader) {
    const ids = new Set(gameIds.map(Number));
    const chosen = (await listGameListRows()).filter((row) => ids.has(row.id));
    const chosenGames = chosen.map((row) => sheetByKey.get(gameinfoSheetGameKey(row.game))).filter(Boolean);
    if (wanted.has("packs")) packTabs = await readPackTabs(reader, chosenGames);
    if (wanted.has("notices") && reader.exportXlsx) {
      noticeTabs = await readNoticeTabs(reader, chosenGames, { wait: waitForPictures });
      if (!noticeTabs) throw createHttpError("กำลังโหลดรูปจากชีต (ไฟล์ใหญ่) — ลองใหม่ในอีก 1–2 นาที", 503);
    }
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
      const [publishers, tags, warning, channels, packs, tutorial] = await Promise.all([
        getGamelistPublishers(gameId),
        getGamelistTags(gameId),
        getGamelistWarning(gameId),
        listGamelistSalesChannels(gameId),
        getGamelistPacks(gameId),
        getGamelistTutorial(gameId),
      ]);
      const fills = proposalFor(sheetGame, {
        hasPublisher: publishers.length > 0,
        hasCategory: tags.length > 0,
        hasWarning: warning.categories.some((category) => category.steps.length > 0),
        remark: row.remark,
        channelKeys: new Set(channels.map((item) => item.channel)),
        hasPacks: gameinfoHasRealPacks(packs.currencies),
        packTab: packTabs.get(sheetGame.key),
        hasTutorial: tutorial.categories.some((category) => category.steps.length > 0),
        noticeTab: noticeTabs.get(sheetGame.key),
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
      let skippedImages = 0;
      if (wanted.has("notices") && fills.notices) {
        const built = await noticeTutorial(noticeTabs.get(sheetGame.key));
        await saveGamelistTutorial(gameId, built.categories, null, actor);
        skippedImages = built.skipped;
        filled.push("notices");
      }
      if (filled.includes("publisher") || filled.includes("category")) {
        // Those two saves keep no history of their own.
        await recordGameinfoAudit({ gameId, area: "sheet-import", action: "fill", actor, source: "import", after: { publisher: fills.publisher, category: fills.category } });
      }
      results.push({ gameId, filled, ...(skippedImages ? { skippedImages } : {}) });
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
      notices: count("notices"),
      skippedImages: results.reduce((total, item) => total + (item.skippedImages || 0), 0),
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
