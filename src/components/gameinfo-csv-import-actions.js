"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  Download,
  FilePlus2,
  FileSpreadsheet,
  PackagePlus,
  X,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";

const CONFIG = {
  games: {
    title: "เพิ่มเกมด้วย CSV",
    description: "เพิ่มหลายเกมลง game_list พร้อมกัน ระบบจะไม่บันทึกหากมีแถวผิดหรือชื่อเกมซ้ำ",
    previewUrl: "/api/gameinfo/gamelist/import",
    applyUrl: "/api/gameinfo/gamelist/import",
    templateUrl: "/api/gameinfo/gamelist/import",
  },
  packs: {
    title: "นำเข้า Packs ทุกเกม",
    description: "แต่ละแถวต้องมี game_id ของเกมที่มีอยู่แล้ว ระบบจะตรวจทุกเกมก่อนบันทึกพร้อมกัน",
    previewUrl: "/api/gameinfo/import/preview",
    applyUrl: "/api/gameinfo/import/apply",
    templateUrl: "/api/gameinfo/import/template",
  },
  guide: {
    title: "คู่มือจัดข้อมูล CSV",
    description: "ใช้เฉพาะคอลัมน์ที่ GameInfo แสดงหรือแก้ไขจริง คอลัมน์อื่นจะไม่ถูกรับเข้าระบบ",
  },
};

export default function GameinfoCsvImportActions({ hasUnsavedChanges = false }) {
  const [kind, setKind] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState("replace");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleOutside(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function open(nextKind) {
    setMenuOpen(false);
    setKind(nextKind);
    setFile(null);
    setPreview(null);
    setMode("replace");
    setError("");
    setSuccess("");
  }

  function close() {
    if (busy) return;
    if (success) {
      window.location.reload();
      return;
    }
    setKind(null);
  }

  async function previewFile(nextFile) {
    setFile(nextFile);
    setPreview(null);
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", nextFile);
      setPreview(
        await apiJson(CONFIG[kind].previewUrl, {
          method: "POST",
          body: form,
          fallbackError: "อ่านไฟล์ไม่สำเร็จ",
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function applyImport() {
    if (!file || !preview) return;
    if (
      hasUnsavedChanges &&
      !window.confirm("มีการแก้ไขในตารางที่ยังไม่ได้บันทึก การนำเข้า CSV จะโหลดหน้าใหม่และทิ้งการแก้ไขนั้น ดำเนินการต่อหรือไม่?")
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (kind === "packs") form.append("mode", mode);
      const result = await apiJson(CONFIG[kind].applyUrl, {
        method: "PUT",
        body: form,
        fallbackError: "นำเข้า CSV ไม่สำเร็จ",
      });
      setSuccess(
        kind === "games"
          ? `เพิ่มเกมแล้ว ${result.createdCount} เกม`
          : `นำเข้าแล้ว ${result.packCount} packs ใน ${result.gameCount} เกม`
      );
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "นำเข้า CSV ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const blockingErrors = preview?.errors || [];
  const canApply = Boolean(preview && blockingErrors.length === 0);

  return (
    <>
      <div className="ml-auto flex flex-wrap gap-2">
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((openNow) => !openNow)}
            aria-expanded={menuOpen}
            className="flex h-10 items-center gap-2 rounded-xl bg-linear-primary px-3 text-sm font-medium text-white hover:bg-linear-primary-hover"
          >
            <FileSpreadsheet size={16} /> จัดการ CSV <ChevronDown size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 z-40 w-64 overflow-hidden rounded-xl border border-linear-hairline bg-linear-surface-1 p-1.5 shadow-xl">
              <MenuButton icon={FilePlus2} label="เพิ่มเกมด้วย CSV" onClick={() => open("games")} />
              <MenuButton icon={PackagePlus} label="นำเข้า Packs ทุกเกม" onClick={() => open("packs")} />
              <div className="my-1 border-t border-linear-hairline" />
              <MenuLink icon={Download} label="โหลดรายการเกมล่าสุด" href="/api/gameinfo/gamelist/export" onClick={() => setMenuOpen(false)} />
              <MenuLink icon={Download} label="โหลด Packs ทุกเกม" href="/api/gameinfo/import/export" onClick={() => setMenuOpen(false)} />
              <div className="my-1 border-t border-linear-hairline" />
              <MenuButton icon={BookOpen} label="วิธีจัดข้อมูล CSV" onClick={() => open("guide")} />
            </div>
          )}
        </div>
      </div>

      {kind && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => event.target === event.currentTarget && close()}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="gameinfo-csv-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="gameinfo-csv-title" className="text-lg font-semibold text-linear-ink">
                  {CONFIG[kind].title}
                </h2>
                <p className="mt-1 text-sm text-linear-ink-subtle">{CONFIG[kind].description}</p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                aria-label="ปิด"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-linear-ink-muted hover:bg-linear-surface-2"
              >
                <X size={17} />
              </button>
            </div>

            {kind !== "guide" && <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="rounded-lg border border-linear-hairline-strong px-3 py-2 text-sm text-linear-ink hover:bg-linear-surface-2 disabled:opacity-50"
              >
                {file ? "เลือกไฟล์ใหม่" : "เลือกไฟล์ CSV"}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0];
                  if (nextFile) previewFile(nextFile);
                  event.target.value = "";
                }}
              />
              {file && <span className="text-sm text-linear-ink-muted">{file.name}</span>}
              <a
                href={CONFIG[kind].templateUrl}
                className="ml-auto flex items-center gap-1.5 text-sm text-linear-primary hover:underline"
              >
                <Download size={14} /> ดาวน์โหลด template
              </a>
              {kind === "packs" && (
                <a
                  href="/api/gameinfo/import/export"
                  className="flex items-center gap-1.5 text-sm text-linear-ink-muted hover:text-linear-ink"
                >
                  <Download size={14} /> export ทุกเกม
                </a>
              )}
            </div>}

            {kind === "guide" && <CsvGuide />}

            {busy && <p className="mt-4 text-sm text-linear-ink-subtle">กำลังประมวลผล…</p>}
            {error && (
              <div className="mt-4 whitespace-pre-line rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}
            {success && (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                {success}
              </div>
            )}

            {preview && (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-linear-hairline bg-linear-surface-2 p-4">
                  {kind === "games" ? (
                    <>
                      <p className="font-medium text-linear-ink">พบ {preview.rows.length} เกมที่เพิ่มได้</p>
                      {preview.rows.length > 0 && (
                        <div className="mt-2 max-h-40 overflow-y-auto text-sm text-linear-ink-muted">
                          {preview.rows.map((row, index) => (
                            <div key={`${row.game}-${index}`} className="border-b border-linear-hairline py-1.5 last:border-0">
                              {row.game} <span className="text-linear-ink-tertiary">— {row.region || "ไม่ระบุ Region"}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-linear-ink">
                        พบ {preview.games.length} เกม รวม {preview.games.reduce((sum, game) => sum + game.packCount, 0)} packs
                      </p>
                      <div className="mt-2 max-h-40 overflow-y-auto text-sm text-linear-ink-muted">
                        {preview.games.map((game) => (
                          <div key={game.gameId} className="flex justify-between gap-3 border-b border-linear-hairline py-1.5 last:border-0">
                            <span>ID {game.gameId} — {game.currentGameName || game.gameName || "ไม่พบเกม"}</span>
                            <span>{game.packCount} packs</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {preview.warnings?.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                    {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                  </div>
                )}
                {blockingErrors.length > 0 && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                    <p className="mb-1 flex items-center gap-1.5 font-medium"><AlertTriangle size={14} /> ต้องแก้ไฟล์ก่อนนำเข้า</p>
                    <ul className="ml-5 list-disc">
                      {blockingErrors.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
                    </ul>
                  </div>
                )}

                {kind === "packs" && canApply && (
                  <div className="flex flex-wrap gap-4 text-sm text-linear-ink-muted">
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
                      แทนที่ packs เดิมของเกมในไฟล์
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={mode === "add"} onChange={() => setMode("add")} />
                      เพิ่มต่อจาก packs เดิม
                    </label>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              {kind === "guide" ? (
                <button type="button" onClick={close} className="rounded-lg bg-linear-primary px-4 py-2 text-sm font-medium text-white">
                  ปิด
                </button>
              ) : success ? (
                <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-linear-primary px-4 py-2 text-sm font-medium text-white">
                  ปิดและโหลดข้อมูลล่าสุด
                </button>
              ) : (
                <>
                  <button type="button" onClick={close} disabled={busy} className="rounded-lg px-4 py-2 text-sm text-linear-ink-muted hover:bg-linear-surface-2">
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={applyImport}
                    disabled={busy || !canApply}
                    className="rounded-lg bg-linear-primary px-4 py-2 text-sm font-medium text-white hover:bg-linear-primary-hover disabled:opacity-40"
                  >
                    ยืนยันนำเข้า
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function MenuButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-linear-ink hover:bg-linear-surface-2"
    >
      <Icon size={15} className="text-linear-ink-muted" /> {label}
    </button>
  );
}

function MenuLink({ icon: Icon, label, href, onClick }) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-linear-ink hover:bg-linear-surface-2"
    >
      <Icon size={15} className="text-linear-ink-muted" /> {label}
    </a>
  );
}

function CsvGuide() {
  const gameFields = [
    ["game", "ชื่อเกม", "ต้องใส่"],
    ["region", "ภูมิภาคของเกม เช่น TH, Global", "ไม่บังคับ"],
    ["platform", "แพลตฟอร์ม เช่น Mobile, PC", "ไม่บังคับ"],
    ["server", "เซิร์ฟเวอร์ เช่น Asia", "ไม่บังคับ"],
    ["bot_manual", "รูปแบบการทำงาน เช่น Bot หรือ Manual", "ไม่บังคับ"],
    ["link", "ลิงก์เว็บไซต์ของเกม", "ไม่บังคับ"],
  ];
  const packFields = [
    ["game_id", "ID จากเมนู “โหลดรายการเกมล่าสุด” ใช้ผูก pack กับเกม", "ต้องใส่"],
    ["currency_name", "ชื่อสกุลเงิน/ไอเทมหลัก", "ไม่บังคับ"],
    ["currency_image", "URL รูปสกุลเงิน", "ไม่บังคับ"],
    ["category_name", "ชื่อหมวด pack", "ไม่บังคับ"],
    ["pack_name", "ชื่อ pack", "ต้องใส่"],
    ["pack_image", "URL รูป pack", "ไม่บังคับ"],
    ["price", "ราคา", "ต้องใส่"],
    ["amount_charged", "ยอดที่กดก่อนรวม fee", "ไม่บังคับ"],
    ["amount_charged_fee", "ยอดที่กดรวม fee", "ต้องใส่"],
    ["channel_main", "ช่องทางหลัก หลายค่าแบ่งด้วย , ; |", "ต้องใส่"],
    ["channel_secondary", "ช่องทางรอง หลายค่าแบ่งด้วย , ; |", "ไม่บังคับ"],
    ["country", "ประเทศ ใช้กับ pack ที่ต้องเปิด VPN", "ไม่บังคับ"],
  ];

  return (
    <div className="mt-5 space-y-5 text-sm">
      <GuideSection
        title="CSV เพิ่มเกม"
        note="หนึ่งแถวต่อหนึ่งเกม ชื่อคอลัมน์ต้องตรงตามนี้ ระบบไม่รับ id และฟิลด์ซ่อนในฐานข้อมูล"
        fields={gameFields}
      />
      <GuideSection
        title="CSV Packs ทุกเกม"
        note="หนึ่งแถวต่อหนึ่ง pack ใช้ game_id เดิมซ้ำได้หลายแถวเพื่อเพิ่มหลาย pack ให้เกมเดียวกัน"
        fields={packFields}
      />
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300">
        ไม่ต้องใส่ rank_stars, is_repeatable, remark, vpn, channel ของ game_list หรือ game_name — ระบบไม่รับคอลัมน์เหล่านี้และจะปฏิเสธไฟล์ที่ส่งเข้ามา
      </div>
    </div>
  );
}

function GuideSection({ title, note, fields }) {
  return (
    <section className="overflow-hidden rounded-xl border border-linear-hairline">
      <div className="bg-linear-surface-2 px-4 py-3">
        <h3 className="font-semibold text-linear-ink">{title}</h3>
        <p className="mt-1 text-xs text-linear-ink-subtle">{note}</p>
      </div>
      <div className="divide-y divide-linear-hairline">
        {fields.map(([name, meaning, required]) => (
          <div key={name} className="grid grid-cols-1 gap-1 px-4 py-2.5 sm:grid-cols-[140px_1fr_90px] sm:gap-3">
            <code className="text-xs text-linear-primary">{name}</code>
            <span className="text-linear-ink-muted">{meaning}</span>
            <span className="text-xs text-linear-ink-tertiary">{required}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
