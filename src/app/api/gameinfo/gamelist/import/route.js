import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { parseCsv, toCsv } from "@/lib/gameinfo-csv";
import {
  GAMELIST_HEADERS,
  GAMELIST_SAMPLE,
  parseGameListCsvRows,
} from "@/lib/gameinfo-gamelist-csv";
import {
  createGameListRows,
  listGameListRows,
} from "@/server/gameinfo-gamelist";

async function parseUpload(request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file.text !== "function") {
    return { error: "ไม่พบไฟล์ที่อัปโหลด" };
  }
  if (!String(file.name || "").toLowerCase().endsWith(".csv")) {
    return { error: "รองรับเฉพาะไฟล์ .csv" };
  }
  const parsedCsv = parseCsv(await file.text());
  if (!parsedCsv.rows.length) return { error: "ไฟล์ว่างเปล่า หรือไม่มีข้อมูลใต้หัวคอลัมน์" };
  if (!parsedCsv.headers.includes("game")) return { error: "ไม่พบคอลัมน์ game" };
  const unsupported = parsedCsv.headers.filter((header) => !GAMELIST_HEADERS.includes(header));
  if (unsupported.length) {
    return { error: `พบคอลัมน์ที่ระบบไม่รับ: ${unsupported.join(", ")}` };
  }

  const existing = await listGameListRows();
  return parseGameListCsvRows(parsedCsv.rows, existing.map((row) => row.game));
}

export async function GET(request) {
  try {
    await requireLayoutEditor(request);
    const csv = "﻿" + toCsv(GAMELIST_HEADERS, GAMELIST_SAMPLE);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="gameinfo_games_template.csv"',
      },
    });
  } catch (err) {
    return handleApiError(err, "ดาวน์โหลด template ไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    await requireLayoutEditor(request);
    const parsed = await parseUpload(request);
    if (parsed.error) return jsonError(parsed.error, 400);
    return jsonOk(parsed);
  } catch (err) {
    return handleApiError(err, "อ่านไฟล์ไม่สำเร็จ");
  }
}

export async function PUT(request) {
  try {
    await requireLayoutEditor(request);
    const parsed = await parseUpload(request);
    if (parsed.error) return jsonError(parsed.error, 400);
    if (parsed.errors.length) return jsonError(parsed.errors.join("\n"), 400);
    if (!parsed.rows.length) return jsonError("ไม่พบเกมที่นำเข้าได้", 400);
    const rows = await createGameListRows(parsed.rows);
    return jsonOk({ rows, createdCount: rows.length }, 201);
  } catch (err) {
    return handleApiError(err, "เพิ่มเกมจาก CSV ไม่สำเร็จ");
  }
}
