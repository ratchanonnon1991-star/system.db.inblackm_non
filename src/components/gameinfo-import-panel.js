"use client";

import { useState } from "react";
import Link from "next/link";
import { apiJson } from "@/lib/api-json";

// Column documentation shown on the page, so users know what each CSV column
// means without downloading the template first.
const COLUMN_DOCS = [
  ["game_id", "ไอดีเกม (ต้องมีอยู่ในระบบแล้ว) — ใช้ผูกว่าแพ็กเป็นของเกมไหน", true],
  ["game_name", "ชื่อเกน — ใช้แสดงเฉยๆ ไม่ได้ใช้ผูกเกม", false],
  ["currency_name", "ชื่อสกุลเงิน เช่น Diamonds", false],
  ["currency_image", "ลิงก์รูปสกุลเงิน (ไม่บังคับ)", false],
  ["category_name", "ชื่อหมวดหมู่ เช่น เติมปกติ, Pass", false],
  ["pack_name", "ชื่อแพ็ก — 1 แถว = 1 แพ็ก", false],
  ["pack_image", "ลิงก์รูปแพ็ก (ไม่บังคับ)", false],
  ["price", "ราคา", false],
  ["amount_charged", "ยอดที่กด", false],
  ["amount_charged_fee", "ยอดที่กด + fee", false],
  ["channel_main", "ช่องทางหลัก — ใส่หลายค่าในเซลล์เดียวคั่นด้วย , ; หรือ |", false],
  ["channel_secondary", "ช่องทางรอง — ใส่หลายค่าได้เหมือน channel_main", false],
  ["country", "ประเทศ (ใช้เมื่อเกมนั้น VPN = YES)", false],
];

// Bulk pack importer: upload a CSV whose rows carry a game_id column, preview
// grouped-by-game with an exists/not-found status, then commit (replace/add).
export default function GameinfoImportPanel({ lang }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { perGame, errors }
  const [mode, setMode] = useState("add");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleFile(file) {
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await apiJson("/api/gameinfo/import/preview", {
        method: "POST",
        body: fd,
        fallbackError: "อ่านไฟล์ไม่สำเร็จ",
      });
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const importable = (preview?.perGame || []).filter((pg) => pg.exists);

  async function commit() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await apiJson("/api/gameinfo/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perGame: importable.map((pg) => ({ gameId: pg.gameId, currencies: pg.currencies })),
          mode,
        }),
        fallbackError: "นำเข้าข้อมูลไม่สำเร็จ",
      });
      const skipped = data.notFound?.length
        ? ` · ข้าม ${data.notFound.length} เกมที่ไม่พบ`
        : "";
      setMessage(`นำเข้าสำเร็จ ${data.updated?.length || 0} เกม (${modeLabel(mode)})${skipped}`);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "นำเข้าข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/gameinfo/${lang}/admin`}
          className="text-sm text-indigo-600 hover:underline"
        >
          ← กลับหน้าจัดการ
        </Link>
        <div className="ml-auto flex flex-wrap gap-2">
          <a
            href="/api/gameinfo/import/template"
            className="rounded-md border border-indigo-300 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50"
          >
            ⬇ ดาวน์โหลด template
          </a>
          <a
            href="/api/gameinfo/import/export"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            ⬇ Export แพ็กทุกเกม
          </a>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 font-semibold text-slate-700">นำเข้าแพ็กหลายเกมจาก CSV</h2>
        <p className="mb-3 text-xs text-slate-500">
          อัปโหลดไฟล์ .csv ที่มีคอลัมน์ <code className="text-indigo-700">game_id</code>{" "}
          บอกว่าแต่ละแถวเป็นของเกมไหน — เกมที่ไม่มีในระบบจะถูกข้าม ยังไม่บันทึกจนกดปุ่มยืนยัน
        </p>
        <input
          type="file"
          accept=".csv"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
          className="text-sm"
        />
        {busy && <p className="mt-2 text-sm text-slate-500">กำลังทำงาน...</p>}
        {message && <p className="mt-2 text-sm text-emerald-600">{message}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      {preview && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-700">
              พบ {preview.perGame.length} เกมในไฟล์ · พร้อมนำเข้า {importable.length} เกม
            </h3>
            <ModeToggle mode={mode} setMode={setMode} />
          </div>

          {/* overflow-hidden clips the header row's flat bg-slate-50
              background to these rounded corners — without it, that square
              background pokes out past the curve at the top. */}
          <div className="overflow-hidden rounded-md border border-slate-200">
          <div className="scroll-x">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">game_id</th>
                  <th className="px-3 py-2">ชื่อเกม</th>
                  <th className="px-3 py-2">จำนวนแพ็ก</th>
                  <th className="px-3 py-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {preview.perGame.map((pg) => (
                  <tr key={pg.gameId} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-500">{pg.gameId}</td>
                    <td className="px-3 py-2 text-slate-700">{pg.gameName || "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{pg.packCount}</td>
                    <td className="px-3 py-2">
                      {pg.exists ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                          พร้อม
                        </span>
                      ) : (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                          ไม่พบเกม
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>

          {preview.errors?.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <ul className="ml-4 list-disc">
                {preview.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={commit}
              disabled={busy || importable.length === 0}
              className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              ยืนยันนำเข้า {importable.length} เกม
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={busy}
              className="rounded-md border border-slate-300 px-5 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              ยกเลิก
            </button>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-semibold text-slate-700">รูปแบบคอลัมน์ (pack)</h3>
        <div className="scroll-x">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">คอลัมน์</th>
                <th className="px-3 py-2">ความหมาย</th>
              </tr>
            </thead>
            <tbody>
              {COLUMN_DOCS.map(([col, desc, required]) => (
                <tr key={col} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-indigo-700">
                    {col}
                    {required && <span className="ml-1 text-red-500">*</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">* จำเป็น · 1 แถว = 1 แพ็ก</p>
      </section>
    </div>
  );
}

function ModeToggle({ mode, setMode }) {
  return (
    <div className="flex gap-1 rounded-md border border-slate-200 p-1 text-xs">
      {[
        ["add", "เพิ่มเข้าไป"],
        ["replace", "แทนที่ทั้งชุด"],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setMode(value)}
          className={`rounded px-3 py-1 font-medium ${
            mode === value ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function modeLabel(mode) {
  return mode === "add" ? "เพิ่มเข้าไป" : "แทนที่ทั้งชุด";
}
