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
import {
  allowGameinfoNavigation,
  requestGameinfoDiscard,
} from "@/lib/gameinfo-unsaved-changes";

const CONFIG = {
  games: {
    title: "เพิ่มเกมด้วย CSV",
    description: "เพิ่มหลายเกมพร้อมกัน ระบบจะไม่บันทึกหากมีแถวผิดหรือชื่อเกมซ้ำ",
    previewUrl: "/api/gameinfo/gamelist/import",
    applyUrl: "/api/gameinfo/gamelist/import",
    templateUrl: "/api/gameinfo/gamelist/import",
  },
  packs: {
    title: "นำเข้า Packs ทุกเกม",
    description: "แต่ละแถวต้องมี game_id ที่มีอยู่แล้ว ระบบจะตรวจทุกเกมก่อนบันทึกพร้อมกัน",
    previewUrl: "/api/gameinfo/import/preview",
    applyUrl: "/api/gameinfo/import/apply",
    templateUrl: "/api/gameinfo/import/template",
  },
  guide: { title: "วิธีจัดข้อมูล CSV", description: "ระบบรับเฉพาะข้อมูลที่หน้า GameInfo ใช้จริง" },
};

export default function GameinfoCsvImportActions({ hasUnsavedChanges = false, dataMode = "uid" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [kind, setKind] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState("replace");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function closeOutside(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    function closeEscape(event) {
      if (event.key === "Escape" && !busy) {
        setMenuOpen(false);
        setKind(null);
      }
    }
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [busy]);

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
      allowGameinfoNavigation();
      window.location.reload();
    }
    else setKind(null);
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
      const result = await apiJson(`${CONFIG[kind].previewUrl}${dataMode === "idpass" ? "?mode=idpass" : ""}`, {
        method: "POST",
        body: form,
        fallbackError: "อ่านไฟล์ไม่สำเร็จ",
      });
      setPreview(result);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function performImport() {
    if (!file || !preview) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (kind === "packs") form.append("mode", mode);
      const result = await apiJson(`${CONFIG[kind].applyUrl}${dataMode === "idpass" ? "?mode=idpass" : ""}`, {
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
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "นำเข้า CSV ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function applyImport() {
    if (!file || !preview) return;
    if (hasUnsavedChanges) {
      requestGameinfoDiscard({
        message: "มีข้อมูลในตารางที่ยังไม่บันทึก การนำเข้าแล้วโหลดหน้าใหม่จะทิ้งข้อมูลนั้น",
        confirmLabel: "นำเข้าต่อ",
        onConfirm: () => { void performImport(); },
      });
      return;
    }
    void performImport();
  }

  const errors = preview?.errors || [];
  const canApply = Boolean(preview && errors.length === 0);

  return (
    <>
      <div ref={menuRef} className="relative ml-auto">
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          aria-expanded={menuOpen}
          className="flex h-10 items-center gap-2 rounded-xl bg-linear-primary px-3 text-sm font-medium text-white hover:bg-linear-primary-hover"
        >
          <FileSpreadsheet size={16} /> จัดการ CSV <ChevronDown size={14} />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-12 z-40 w-64 rounded-xl border border-linear-hairline bg-linear-surface-1 p-1.5 shadow-xl">
            <MenuButton icon={FilePlus2} label="เพิ่มเกมด้วย CSV" onClick={() => open("games")} />
            <MenuButton icon={PackagePlus} label="นำเข้า Packs ทุกเกม" onClick={() => open("packs")} />
            <Divider />
            <MenuLink label="โหลดรายการเกมล่าสุด" href={`/api/gameinfo/gamelist/export${dataMode === "idpass" ? "?mode=idpass" : ""}`} />
            <MenuLink label="โหลด Packs ทุกเกม" href={`/api/gameinfo/import/export${dataMode === "idpass" ? "?mode=idpass" : ""}`} />
            <Divider />
            <MenuButton icon={BookOpen} label="วิธีจัดข้อมูล CSV" onClick={() => open("guide")} />
          </div>
        ) : null}
      </div>

      {kind ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && close()}>
          <section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5 shadow-2xl">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-linear-ink">{CONFIG[kind].title}</h2>
                <p className="mt-1 text-sm text-linear-ink-subtle">{CONFIG[kind].description}</p>
              </div>
              <button type="button" onClick={close} disabled={busy} aria-label="ปิด" className="rounded-lg p-2 text-linear-ink-muted hover:bg-linear-surface-2"><X size={17} /></button>
            </header>

            {kind === "guide" ? <CsvGuide /> : (
              <>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="rounded-lg border border-linear-hairline-strong px-3 py-2 text-sm text-linear-ink hover:bg-linear-surface-2 disabled:opacity-50">
                    {file ? "เลือกไฟล์ใหม่" : "เลือกไฟล์ CSV"}
                  </button>
                  <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => {
                    const nextFile = event.target.files?.[0];
                    if (nextFile) previewFile(nextFile);
                    event.target.value = "";
                  }} />
                  {file ? <span className="text-sm text-linear-ink-muted">{file.name}</span> : null}
                  <a href={CONFIG[kind].templateUrl} className="ml-auto inline-flex items-center gap-1 text-sm text-linear-primary hover:underline"><Download size={14} /> template</a>
                </div>
                {busy ? <p className="mt-4 text-sm text-linear-ink-subtle">กำลังประมวลผล…</p> : null}
                {error ? <p className="mt-4 whitespace-pre-line rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</p> : null}
                {success ? <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">{success}</p> : null}
                {preview ? <Preview kind={kind} preview={preview} errors={errors} mode={mode} setMode={setMode} /> : null}
              </>
            )}

            <footer className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={close} disabled={busy} className="rounded-lg px-4 py-2 text-sm text-linear-ink-muted hover:bg-linear-surface-2">{success ? "ปิดและโหลดข้อมูลล่าสุด" : "ยกเลิก"}</button>
              {kind !== "guide" && !success ? <button type="button" onClick={applyImport} disabled={busy || !canApply} className="rounded-lg bg-linear-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-40">ยืนยันนำเข้า</button> : null}
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Preview({ kind, preview, errors, mode, setMode }) {
  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-linear-hairline bg-linear-surface-2 p-4">
        {kind === "games" ? (
          <><p className="font-medium text-linear-ink">พบ {preview.rows.length} เกมที่เพิ่มได้</p>{preview.rows.map((row, index) => <p key={`${row.game}-${index}`} className="mt-1 text-sm text-linear-ink-muted">{row.game} · {row.region || "ไม่ระบุ Region"}</p>)}</>
        ) : (
          <><p className="font-medium text-linear-ink">พบ {preview.games.length} เกม รวม {preview.games.reduce((sum, game) => sum + game.packCount, 0)} packs</p>{preview.games.map((game) => <p key={game.gameId} className="mt-1 flex justify-between text-sm text-linear-ink-muted"><span>ID {game.gameId} · {game.currentGameName || game.gameName || "ไม่พบเกม"}</span><span>{game.packCount} packs</span></p>)}</>
        )}
      </div>
      {errors.length ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"><p className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle size={14} /> ต้องแก้ไฟล์ก่อนนำเข้า</p>{errors.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}</div> : null}
      {preview.warnings?.length ? <div className="rounded-xl border border-linear-warning/40 bg-linear-warning-bg p-3 text-sm font-medium text-linear-warning">{preview.warnings.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}</div> : null}
      {kind === "packs" && !errors.length ? <div className="flex flex-wrap gap-4 text-sm text-linear-ink-muted"><label className="flex gap-2"><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />แทนที่ packs เดิมของเกมในไฟล์</label><label className="flex gap-2"><input type="radio" checked={mode === "add"} onChange={() => setMode("add")} />เพิ่มต่อจาก packs เดิม</label></div> : null}
    </div>
  );
}

function MenuButton({ icon: Icon, label, onClick }) { return <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-linear-ink hover:bg-linear-surface-2"><Icon size={15} className="text-linear-ink-muted" />{label}</button>; }
function MenuLink({ label, href }) { return <a href={href} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-linear-ink hover:bg-linear-surface-2"><Download size={15} className="text-linear-ink-muted" />{label}</a>; }
function Divider() { return <div className="my-1 border-t border-linear-hairline" />; }

function CsvGuide() {
  return <div className="mt-5 space-y-4 text-sm text-linear-ink-muted"><Guide title="CSV เพิ่มเกม" fields="game* · region · platform · server · bot_manual · link" /><Guide title="CSV Packs หลายเกม" fields="game_id* · game_name · currency_name · currency_image · category_name · pack_name* · pack_image · price* · amount_charged_fee* · channel_main* · channel_secondary · country" /><p className="rounded-xl border border-linear-warning/40 bg-linear-warning-bg p-3 font-medium text-linear-warning">ใช้ game_id จากเมนู “โหลดรายการเกมล่าสุด” เครื่องหมาย * คือข้อมูลจำเป็น ระบบไม่รับคอลัมน์ฐานข้อมูลที่หน้า GameInfo ไม่ได้ใช้</p></div>;
}
function Guide({ title, fields }) { return <section className="rounded-xl border border-linear-hairline p-4"><h3 className="font-semibold text-linear-ink">{title}</h3><code className="mt-2 block whitespace-normal text-xs text-linear-primary">{fields}</code></section>; }
