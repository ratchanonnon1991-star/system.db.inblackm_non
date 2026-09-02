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
  const [confirmedGames, setConfirmedGames] = useState(() => new Set());
  const [confirmedColumns, setConfirmedColumns] = useState(() => new Set());
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
      // Nothing starts ticked. Creating a game or a column is not undoable and
      // a typo'd game name looks exactly like a new game, so the user has to
      // say yes to each one rather than notice and say no.
      setConfirmedGames(new Set());
      setConfirmedColumns(new Set());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function toggle(setter, value) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function performImport() {
    if (!file || !preview) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (kind === "packs") form.append("mode", mode);
      // Apply re-reads the file, so it is told what was ticked rather than
      // trusting the preview. Sending the lists even when empty is what
      // distinguishes "confirmed none" from "never saw a preview".
      if (kind === "packs" && preview.newGames) {
        form.append("confirmNewGames", JSON.stringify([...confirmedGames]));
      }
      if (kind === "packs" && preview.newColumns) {
        form.append("confirmNewColumns", JSON.stringify([...confirmedColumns]));
      }
      const result = await apiJson(`${CONFIG[kind].applyUrl}${dataMode === "idpass" ? "?mode=idpass" : ""}`, {
        method: "PUT",
        body: form,
        fallbackError: "นำเข้า CSV ไม่สำเร็จ",
      });
      setSuccess(
        kind === "games"
          ? `เพิ่มเกมแล้ว ${result.createdCount} เกม`
          : [
              `นำเข้าแล้ว ${result.packCount} packs ใน ${result.gameCount} เกม`,
              result.createdGameCount ? `สร้างเกมใหม่ ${result.createdGameCount} เกม` : "",
              result.newColumnCount ? `สร้างคอลัมน์ใหม่ ${result.newColumnCount} คอลัมน์` : "",
              result.skippedGameNames?.length ? `ข้ามเกมที่ไม่ได้ยืนยัน ${result.skippedGameNames.length} เกม` : "",
            ]
              .filter(Boolean)
              .join(" · ")
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
                {preview ? (
                  <Preview
                    kind={kind}
                    preview={preview}
                    errors={errors}
                    mode={mode}
                    setMode={setMode}
                    confirmedGames={confirmedGames}
                    confirmedColumns={confirmedColumns}
                    onToggleGame={(name) => toggle(setConfirmedGames, name)}
                    onToggleColumn={(label) => toggle(setConfirmedColumns, label)}
                  />
                ) : null}
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

function Preview({
  kind,
  preview,
  errors,
  mode,
  setMode,
  confirmedGames,
  confirmedColumns,
  onToggleGame,
  onToggleColumn,
}) {
  const existingGames = (preview.games || []).filter((game) => !game.isNew);
  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-linear-hairline bg-linear-surface-2 p-4">
        {kind === "games" ? (
          <><p className="font-medium text-linear-ink">พบ {preview.rows.length} เกมที่เพิ่มได้</p>{preview.rows.map((row, index) => <p key={`${row.game}-${index}`} className="mt-1 text-sm text-linear-ink-muted">{row.game} · {row.region || "ไม่ระบุ Region"}</p>)}</>
        ) : (
          <>
            <p className="font-medium text-linear-ink">
              เขียนลงเกมที่มีอยู่ {existingGames.length} เกม รวม{" "}
              {existingGames.reduce((sum, game) => sum + game.packCount, 0)} packs
            </p>
            {existingGames.map((game) => (
              <p key={game.gameId} className="mt-1 flex justify-between gap-3 text-sm text-linear-ink-muted">
                <span className="min-w-0 truncate">
                  ID {game.gameId} · {game.currentGameName || game.gameName || "ไม่พบเกม"}
                  {game.matchedByName ? (
                    <span className="ml-1 text-[10px] text-linear-ink-tertiary">จับคู่จากชื่อ</span>
                  ) : null}
                </span>
                <span className="shrink-0">{game.packCount} packs</span>
              </p>
            ))}
            {existingGames.length === 0 ? (
              <p className="mt-1 text-sm text-linear-ink-tertiary">ไม่มี — ไฟล์นี้เขียนลงเกมใหม่อย่างเดียว</p>
            ) : null}
          </>
        )}
      </div>

      {kind === "packs" && preview.newGames?.length ? (
        <ConfirmList
          title="เกมใหม่ที่จะถูกสร้าง"
          hint="ติ๊กเฉพาะเกมที่ต้องการสร้างจริง — ที่ไม่ติ๊กจะถูกข้ามทั้งแถวของเกมนั้น"
          items={preview.newGames.map((game) => ({
            id: game.gameName,
            label: game.gameName,
            meta: `${game.packCount} packs`,
            warning: game.similar?.length
              ? `ชื่อคล้าย ${game.similar.join(", ")} — เกมเดียวกันหรือเปล่า?`
              : "",
          }))}
          checked={confirmedGames}
          onToggle={onToggleGame}
        />
      ) : null}

      {kind === "packs" && preview.newColumns?.length ? (
        <ConfirmList
          title="คอลัมน์ใหม่ที่จะถูกสร้าง"
          hint="คอลัมน์เป็นของกลางทุกเกม — ที่ไม่ติ๊กจะไม่ถูกสร้างและค่าในคอลัมน์นั้นจะไม่ถูกนำเข้า"
          items={preview.newColumns.map((column) => ({
            id: column.label,
            label: column.label,
            meta: column.valueCount ? `${column.valueCount} ค่า` : "คอลัมน์ว่าง",
            warning: column.unknownRefs?.length
              ? `อ้างถึง ${column.unknownRefs.map((ref) => `[${ref}]`).join(", ")} ซึ่งไม่มีในระบบ`
              : column.formula
                ? `สูตรของคอลัมน์: ${column.formula}`
                : "",
          }))}
          checked={confirmedColumns}
          onToggle={onToggleColumn}
        />
      ) : null}
      {errors.length ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"><p className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle size={14} /> ต้องแก้ไฟล์ก่อนนำเข้า</p>{errors.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}</div> : null}
      {preview.warnings?.length ? <div className="rounded-xl border border-linear-warning/40 bg-linear-warning-bg p-3 text-sm font-medium text-linear-warning">{preview.warnings.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}</div> : null}
      {kind === "packs" && !errors.length ? <div className="flex flex-wrap gap-4 text-sm text-linear-ink-muted"><label className="flex gap-2"><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />แทนที่ packs เดิมของเกมในไฟล์</label><label className="flex gap-2"><input type="radio" checked={mode === "add"} onChange={() => setMode("add")} />เพิ่มต่อจาก packs เดิม</label></div> : null}
    </div>
  );
}

// Nothing here is ticked by default: these are the two things an import can
// create that cannot be undone from the UI afterwards.
function ConfirmList({ title, hint, items, checked, onToggle }) {
  return (
    <div className="rounded-xl border border-linear-warning/40 bg-linear-warning-bg p-3">
      <p className="text-sm font-medium text-linear-warning">{title} ({items.length})</p>
      <p className="mt-0.5 text-xs text-linear-ink-muted">{hint}</p>
      <div className="mt-2 space-y-1">
        {items.map((item) => (
          <label
            key={item.id}
            className="flex items-start gap-2 rounded px-1.5 py-1 text-sm text-linear-ink hover:bg-linear-surface-2"
          >
            <input
              type="checkbox"
              checked={checked.has(item.id)}
              onChange={() => onToggle(item.id)}
              className="mt-0.5 accent-linear-primary"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{item.label}</span>
                <span className="text-xs text-linear-ink-tertiary">{item.meta}</span>
              </span>
              {item.warning ? (
                <span className="mt-0.5 block text-xs text-linear-ink-muted">{item.warning}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function MenuButton({ icon: Icon, label, onClick }) { return <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-linear-ink hover:bg-linear-surface-2"><Icon size={15} className="text-linear-ink-muted" />{label}</button>; }
function MenuLink({ label, href }) { return <a href={href} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-linear-ink hover:bg-linear-surface-2"><Download size={15} className="text-linear-ink-muted" />{label}</a>; }
function Divider() { return <div className="my-1 border-t border-linear-hairline" />; }

function CsvGuide() {
  return (
    <div className="mt-5 space-y-4 text-sm text-linear-ink-muted">
      <Guide title="CSV เพิ่มเกม" fields="game* · region · platform · server · bot_manual · link" />
      <Guide
        title="CSV Packs หลายเกม"
        fields="game_id · game_name · currency_name · currency_image · category_name · pack_name* · pack_image · price* · amount_charged_fee* · channel_main* · channel_secondary · country"
      />
      <section className="rounded-xl border border-linear-hairline p-4">
        <h3 className="font-semibold text-linear-ink">ระบุเกม</h3>
        <p className="mt-2 text-xs">
          ใส่ <code className="text-linear-primary">game_id</code> หรือ{" "}
          <code className="text-linear-primary">game_name</code> อย่างใดอย่างหนึ่งก็ได้ — ชื่อที่ตรงกับเกมที่มีอยู่จะเขียนลงเกมนั้น
          ส่วนชื่อที่ไม่ตรงกับใครจะเสนอเป็นเกมใหม่ให้ติ๊กยืนยันก่อนสร้าง ถ้าชื่อใกล้เคียงเกมเดิมจะเตือนให้ดูก่อนว่าพิมพ์ผิดหรือเปล่า
        </p>
      </section>
      <section className="rounded-xl border border-linear-hairline p-4">
        <h3 className="font-semibold text-linear-ink">คอลัมน์ใหม่</h3>
        <p className="mt-2 text-xs">
          หัวคอลัมน์ที่ไม่อยู่ในรายการข้างบนจะกลายเป็นคอลัมน์ — ชื่อที่ตรงกับคอลัมน์ที่มีอยู่คือการเติมค่าลงคอลัมน์นั้น
          ชื่อใหม่จะเสนอให้ติ๊กยืนยันก่อนสร้าง คอลัมน์เป็นของกลางทุกเกม
        </p>
        <p className="mt-2 text-xs">
          ในช่องใส่ได้ทั้งค่าและสูตร เช่น <code className="text-linear-primary">1500</code> หรือ{" "}
          <code className="text-linear-primary">[ราคา] * 1.05</code> — ถ้าทุกแถวเป็นสูตรเดียวกันจะถูกยกขึ้นเป็นสูตรของคอลัมน์ให้เอง
          เว้นว่างทั้งคอลัมน์ได้ ระบบจะสร้างคอลัมน์เปล่าไว้ให้ใส่สูตรทีหลัง
        </p>
      </section>
      <p className="rounded-xl border border-linear-warning/40 bg-linear-warning-bg p-3 font-medium text-linear-warning">
        ใช้ game_id จากเมนู “โหลดรายการเกมล่าสุด” เครื่องหมาย * คือข้อมูลจำเป็นของแต่ละ pack
      </p>
    </div>
  );
}
function Guide({ title, fields }) { return <section className="rounded-xl border border-linear-hairline p-4"><h3 className="font-semibold text-linear-ink">{title}</h3><code className="mt-2 block whitespace-normal text-xs text-linear-primary">{fields}</code></section>; }
