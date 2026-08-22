import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { parseCsv, toCsv } from "@/lib/gameinfo-csv";
import {
  GAMELIST_HEADERS,
  GAMELIST_SAMPLE,
  parseGameListCsvRows,
} from "@/lib/gameinfo-gamelist-csv";
import { createGameListRows, listGameListRows, withGameinfoTransaction } from "@/server/gameinfo-gamelist";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { saveGameinfoModeData } from "@/server/gameinfo-mode-data";
import { legacyGamelistLinks } from "@/server/gameinfo-gamelist-links";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

async function parseUpload(request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file.text !== "function") return { error: "ไม่พบไฟล์ที่อัปโหลด" };
  if (!String(file.name || "").toLowerCase().endsWith(".csv")) return { error: "รองรับเฉพาะไฟล์ .csv" };
  const parsedCsv = parseCsv(await file.text());
  if (!parsedCsv.rows.length) return { error: "ไฟล์ว่างเปล่า หรือไม่มีข้อมูลใต้หัวคอลัมน์" };
  if (!parsedCsv.headers.includes("game")) return { error: "ไม่พบคอลัมน์ game" };
  const unsupported = parsedCsv.headers.filter((header) => !GAMELIST_HEADERS.includes(header));
  if (unsupported.length) return { error: `พบคอลัมน์ที่ระบบไม่รับ: ${unsupported.join(", ")}` };
  const existing = await listGameListRows();
  return parseGameListCsvRows(parsedCsv.rows, existing.map((row) => row.game));
}

export async function GET(request) {
  try {
    await requireGameinfoEditor(request);
    return new Response("﻿" + toCsv(GAMELIST_HEADERS, GAMELIST_SAMPLE), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="gameinfo_games_template.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error, "ดาวน์โหลด template ไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    await requireGameinfoEditor(request);
    const parsed = await parseUpload(request);
    return parsed.error ? jsonError(parsed.error, 400) : jsonOk(parsed);
  } catch (error) {
    return handleApiError(error, "อ่านไฟล์ไม่สำเร็จ");
  }
}

export async function PUT(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const parsed = await parseUpload(request);
    if (parsed.error) return jsonError(parsed.error, 400);
    if (parsed.errors.length) return jsonError(parsed.errors.join("\n"), 400);
    if (!parsed.rows.length) return jsonError("ไม่พบเกมที่นำเข้าได้", 400);
    const actor = auditActor(user);
    const isIdpass = normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode")) === "idpass";
    const rows = isIdpass
      ? await withGameinfoTransaction(async (client) => {
          const created = await createGameListRows(parsed.rows, actor, client);
          for (const [index, row] of created.entries()) {
            await saveGameinfoModeData(row.id, "idpass", {
              fields: {
                region: parsed.rows[index].region,
                platform: parsed.rows[index].platform,
                server: parsed.rows[index].server,
                botManual: parsed.rows[index].botManual,
              },
              links: legacyGamelistLinks(parsed.rows[index].link),
            }, client);
          }
          return created;
        })
      : await createGameListRows(parsed.rows, actor);
    return jsonOk({ rows, createdCount: rows.length }, 201);
  } catch (error) {
    return handleApiError(error, "เพิ่มเกมจาก CSV ไม่สำเร็จ");
  }
}
