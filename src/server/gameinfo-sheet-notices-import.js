// The NOTICE (ปัญหาและคำแนะนำ) notes of each game's tab, with the screenshots
// placed beside them, as the game's วิธีเติม. The Sheets API returns no
// pictures, so the whole workbook is exported as .xlsx (~50 MB) — too slow
// and too big for a web request (it once took the site down), so this runs
// only from scripts/import-sheet-notices.mjs, in its own process.
import { listGameListRows } from "@/server/gameinfo-gamelist";
import { getGamelistTutorial, listGamelistTutorialPresence, saveGamelistTutorial } from "@/server/gameinfo-gamelist-tutorial";
import { gameinfoSheetGameKey } from "@/lib/gameinfo-sales-channels";
import { countGameinfoSheetNotices, parseGameinfoSheetNotices } from "@/lib/gameinfo-sheet-notices";
import { MAX_STEP_IMAGE_DATA_BYTES } from "@/lib/gameinfo-step-image-size";
import { readXlsxSheetsWithImages } from "@/server/xlsx-reader";
import { gameinfoSheetGameTabs, gameinfoSourceSheetId, openGameinfoSheetReader, readSource, withSheetAccess } from "@/server/gameinfo-sheet-import";

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

/** Parsed notes → tutorial categories with pictures inlined, kept under the editor's 4MB limit. */
export async function buildGameinfoNoticeTutorial(categories, media) {
  let budget = MAX_STEP_IMAGE_DATA_BYTES;
  let skipped = 0;
  const out = [];
  for (const [categoryIndex, category] of categories.entries()) {
    const steps = [];
    for (const [stepIndex, step] of category.steps.entries()) {
      const imageUrls = [];
      for (const path of step.images) {
        const bytes = media(path);
        const url = bytes ? await pictureDataUrl(bytes, path) : null;
        if (url && url.length <= budget) {
          imageUrls.push(url);
          budget -= url.length;
        } else skipped += 1;
      }
      steps.push({ id: `sheet_c${categoryIndex + 1}_s${stepIndex + 1}`, title: "", description: step.description, imageUrls, videoUrl: "" });
    }
    out.push({ id: `sheet_c${categoryIndex + 1}`, name: category.name, steps });
  }
  return { categories: out, skipped };
}

/**
 * Every GameInfo game with no วิธีเติม yet whose tab has NOTICE notes gets
 * them. Without `apply` nothing is written: the result says what would be.
 */
export async function importGameinfoSheetNotices({ apply = false, actor = null, reader = openGameinfoSheetReader({ exportAccess: true }), log = () => {} } = {}) {
  const [source, rows, tutorialPresence] = await Promise.all([readSource(reader), listGameListRows(), listGamelistTutorialPresence()]);
  const sheetByKey = new Map(source.map((game) => [game.key, game]));
  const candidates = rows
    .filter((row) => !tutorialPresence[row.id])
    .map((row) => ({ row, sheetGame: sheetByKey.get(gameinfoSheetGameKey(row.game)) }))
    .filter((item) => item.sheetGame);
  const tabs = await withSheetAccess(() => gameinfoSheetGameTabs(reader, candidates.map((item) => item.sheetGame)));
  log(`เกมที่ยังไม่มีวิธีเติมและหาแท็บเจอ: ${tabs.size} — กำลัง export ชีตเป็น .xlsx …`);
  const started = Date.now();
  const buffer = await withSheetAccess(() => reader.exportXlsx(gameinfoSourceSheetId()));
  log(`ได้ไฟล์ ${(buffer.length / 1048576).toFixed(1)} MB ใน ${Math.round((Date.now() - started) / 1000)} วินาที`);
  const workbook = readXlsxSheetsWithImages(buffer, { titles: new Set(tabs.values()) });
  const byTitle = new Map(workbook.sheets.map((sheet) => [sheet.title, sheet]));
  const results = [];
  for (const { row, sheetGame } of candidates) {
    const tab = tabs.get(sheetGame.key);
    const sheet = tab ? byTitle.get(tab) : null;
    const categories = sheet ? parseGameinfoSheetNotices(sheet) : [];
    if (!categories.length) continue;
    const counts = countGameinfoSheetNotices(categories);
    const item = { gameId: row.id, game: String(row.game).split("\n")[0], tab, ...counts };
    if (apply) {
      try {
        // Someone may have written a guide since the list was read.
        const current = await getGamelistTutorial(row.id);
        if (current.categories.some((category) => category.steps.length)) {
          item.skippedReason = "มีวิธีเติมแล้ว";
        } else {
          const built = await buildGameinfoNoticeTutorial(categories, workbook.media);
          await saveGamelistTutorial(row.id, built.categories, null, actor);
          item.saved = true;
          item.skippedImages = built.skipped;
        }
      } catch (error) {
        item.error = error instanceof Error ? error.message : "บันทึกไม่สำเร็จ";
      }
    }
    log(`${item.saved ? "✓" : item.error ? "✗" : "·"} ${item.game} — ${item.steps} ข้อ, รูป ${item.images}${item.skippedImages ? ` (เกิน 4MB ข้าม ${item.skippedImages})` : ""}${item.error ? ` — ${item.error}` : ""}${item.skippedReason ? ` — ${item.skippedReason}` : ""}`);
    results.push(item);
  }
  return {
    games: results.length,
    steps: results.reduce((total, item) => total + item.steps, 0),
    images: results.reduce((total, item) => total + item.images, 0),
    saved: results.filter((item) => item.saved).length,
    failed: results.filter((item) => item.error).length,
    results,
  };
}
