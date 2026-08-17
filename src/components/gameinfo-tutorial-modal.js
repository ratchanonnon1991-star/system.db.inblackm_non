"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bold, ChevronLeft, ChevronRight, Link as LinkIcon, Plus, Trash2, Type, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import GameinfoImagePreview from "./gameinfo-image-preview";
import GameinfoMemoryInput from "./gameinfo-memory-input";

function genId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function emptyStep() {
  return { id: genId("step"), title: "", description: "", imageUrls: [], videoUrl: "" };
}

function emptyCategory() {
  return { id: genId("category"), name: "", steps: [emptyStep()] };
}

// Steps store description as plain text with a light hand-rolled markup —
// no rich-text editor library, just enough to cover "adjust text size / add
// a link" from a plain textarea: "# " (large) / "### " (small) line
// prefixes, **bold**, and [label](url) links. renderStepText() below is the
// matching reader for the read-only view.
function renderInline(text, keyPrefix) {
  const regex = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  const parts = [];
  let last = 0;
  let m;
  let i = 0;
  while ((m = regex.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      parts.push(<strong key={`${keyPrefix}-${i++}`}>{m[1]}</strong>);
    } else {
      parts.push(
        <a
          key={`${keyPrefix}-${i++}`}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-linear-primary underline hover:text-linear-primary-hover"
        >
          {m[2]}
        </a>
      );
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderStepText(text) {
  if (!text) return null;
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, idx) => {
        let size = "text-sm";
        let content = line;
        if (line.startsWith("# ")) {
          size = "text-base font-semibold";
          content = line.slice(2);
        } else if (line.startsWith("### ")) {
          size = "text-xs text-linear-ink-tertiary";
          content = line.slice(4);
        }
        return (
          <p key={idx} className={`${size} whitespace-pre-wrap text-linear-ink-muted`}>
            {content === "" ? " " : renderInline(content, idx)}
          </p>
        );
      })}
    </div>
  );
}

// Trigger button + popup overlay for one game's "how to top up" tutorial —
// organized as categories shown as browser-style tabs (unlimited, freely
// named, name history shared across every game's tutorial), each holding
// its own numbered steps (title, instructions, optional image/video URL).
// Storage is gamelist_tutorials (see
// src/server/gameinfo-gamelist-tutorial.js), fetched lazily the first time
// the popup opens rather than preloaded onto every row of the list table.
// `editable` (staff/admin) gets the add/edit/save form; everyone else gets a
// read-only view of the same content.
export default function GameinfoTutorialButton({
  gameId,
  gameName,
  editable,
  hasData,
  disabled,
  variant = "tutorial",
  autoOpen = false,
}) {
  const isWarning = variant === "warning";
  const [open, setOpen] = useState(Boolean(autoOpen && hasData));
  const buttonLabel = isWarning ? "ข้อควรระวัง" : "Tutorial";

  // View-only (role "user") gets nothing to click if there's no tutorial to
  // show — editable users always keep the button so they can add one.
  if (!editable && !hasData) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen(true);
        }}
        disabled={disabled}
        className="rounded-md border border-linear-hairline-strong px-2 py-1 text-xs text-linear-ink-muted hover:bg-linear-surface-2 hover:text-linear-ink disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
        title={disabled ? `บันทึกเกมนี้ก่อนถึงจะใส่${buttonLabel}ได้` : isWarning ? "ข้อควรระวังของเกม" : "วิธีเติมเกม"}
      >
        {buttonLabel}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <TutorialModal
            gameId={gameId}
            gameName={gameName}
            editable={editable}
            variant={variant}
            onClose={() => setOpen(false)}
          />,
          document.body
        )}
    </>
  );
}

function TutorialModal({ gameId, gameName, editable, variant, onClose }) {
  const isWarning = variant === "warning";
  const endpoint = `/api/gameinfo/gamelist/${gameId}/${isWarning ? "warning" : "tutorial"}`;
  const dataKey = isWarning ? "warning" : "tutorial";
  const contentLabel = isWarning ? "ข้อควรระวัง" : "tutorial";
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [categoryNames, setCategoryNames] = useState([]);
  const [activeCatId, setActiveCatId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const dialogRef = useRef(null);
  // Snapshot of the last loaded/saved categories, to detect unsaved edits
  // when the user tries to close — kept as a JSON string ref (not state) so
  // updating it never triggers a re-render on its own.
  const savedSnapshotRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson(endpoint, {
          fallbackError: `โหลด${contentLabel}ไม่สำเร็จ`,
        });
        if (!cancelled) {
          setCategories(data[dataKey].categories);
          setCategoryNames(data.categoryNames || []);
          setActiveCatId(data[dataKey].categories[0]?.id ?? null);
          savedSnapshotRef.current = JSON.stringify(data[dataKey].categories);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : `โหลด${contentLabel}ไม่สำเร็จ`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contentLabel, dataKey, endpoint]);

  function requestClose() {
    const dirty = editable && savedSnapshotRef.current !== null && JSON.stringify(categories) !== savedSnapshotRef.current;
    if (dirty && !window.confirm("ยังไม่ได้บันทึกการแก้ไข ต้องการปิดโดยไม่บันทึกหรือไม่?")) return;
    onClose();
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, editable]);

  function updateCategory(catId, patch) {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, ...patch } : c)));
  }
  function addCategory() {
    const next = emptyCategory();
    setCategories((prev) => [...prev, next]);
    setActiveCatId(next.id);
  }
  function removeCategory(catId) {
    const category = categories.find((item) => item.id === catId);
    if (!window.confirm(`ลบหมวดหมู่${isWarning ? "ข้อควรระวัง" : " tutorial"} "${category?.name || "ไม่มีชื่อ"}" พร้อมขั้นตอนทั้งหมด ใช่ไหม?`)) return;
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    if (activeCatId === catId) {
      const idx = categories.findIndex((c) => c.id === catId);
      const remaining = categories.filter((c) => c.id !== catId);
      setActiveCatId(remaining[Math.max(0, idx - 1)]?.id ?? remaining[0]?.id ?? null);
    }
  }
  function updateStep(catId, stepIdx, patch) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== catId
          ? c
          : { ...c, steps: c.steps.map((s, j) => (j === stepIdx ? { ...s, ...patch } : s)) }
      )
    );
  }
  function addStep(catId) {
    setCategories((prev) =>
      prev.map((c) => (c.id === catId ? { ...c, steps: [...c.steps, emptyStep()] } : c))
    );
  }
  function removeStep(catId, stepIdx) {
    const category = categories.find((item) => item.id === catId);
    if (!window.confirm(`ลบข้อที่ ${stepIdx + 1} ของหมวดหมู่ "${category?.name || "ไม่มีชื่อ"}" ใช่ไหม?`)) return;
    setCategories((prev) =>
      prev.map((c) => (c.id !== catId ? c : { ...c, steps: c.steps.filter((_, j) => j !== stepIdx) }))
    );
  }
  function rememberCategoryName(name) {
    setCategoryNames((prev) => (prev.includes(name) ? prev : [...prev, name].sort((a, b) => a.localeCompare(b, "th"))));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const data = await apiJson(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories }),
        fallbackError: `บันทึก${contentLabel}ไม่สำเร็จ`,
      });
      setCategories(data[dataKey].categories);
      savedSnapshotRef.current = JSON.stringify(data[dataKey].categories);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : `บันทึก${contentLabel}ไม่สำเร็จ`);
    } finally {
      setSaving(false);
    }
  }

  const activeCategory = categories.find((c) => c.id === activeCatId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={dialogRef}
        className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-linear-hairline px-5 py-3">
          <h2 className="text-sm font-semibold text-linear-ink">
            {isWarning ? "ข้อควรระวัง" : "Tutorial"}: {gameName}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-7 items-center justify-center rounded px-2 text-xs text-linear-ink-tertiary hover:bg-linear-surface-2 hover:text-linear-ink"
            aria-label="ปิด"
          >
            ปิด
          </button>
        </div>

        {!loading && (
          <CategoryTabs
            categories={categories}
            activeCatId={activeCatId}
            onSelect={setActiveCatId}
            editable={editable}
            onAddCategory={addCategory}
            onRemoveCategory={removeCategory}
          />
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-linear-ink-tertiary">กำลังโหลด...</p>
          ) : categories.length === 0 ? (
            <p className="rounded-lg border border-dashed border-linear-hairline-strong p-8 text-center text-sm text-linear-ink-tertiary">
              {editable
                ? 'ยังไม่มีหมวดหมู่ กด "เพิ่มหมวดหมู่" ที่แถบแท็บด้านบนเพื่อเริ่ม'
                : `ยังไม่มี${isWarning ? "ข้อควรระวัง" : " tutorial"}สำหรับเกมนี้`}
            </p>
          ) : editable ? (
            <EditableCategory
              key={activeCategory.id}
              category={activeCategory}
              categoryNames={categoryNames}
              onUpdateCategory={(patch) => updateCategory(activeCategory.id, patch)}
              onUpdateStep={(stepIdx, patch) => updateStep(activeCategory.id, stepIdx, patch)}
              onAddStep={() => addStep(activeCategory.id)}
              onRemoveStep={(stepIdx) => removeStep(activeCategory.id, stepIdx)}
              onRememberCategoryName={rememberCategoryName}
            />
          ) : (
            <ReadOnlyCategory category={activeCategory} />
          )}
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        </div>

        {editable && !loading && (
          <div className="flex items-center gap-3 border-t border-linear-hairline px-5 py-3">
            {savedAt && !saving && <span className="text-xs text-emerald-400">บันทึกแล้ว</span>}
            <div className="flex-1" />
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="rounded-md border border-linear-hairline-strong px-3 py-1.5 text-xs text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-50"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-linear-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-linear-primary-hover disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Browser-style tab strip — one tab per category. The active tab visually
// merges into the content panel below it (same surface color, no bottom
// border); editable mode adds a hover "x" per tab (closes/removes that
// category) and a trailing "+" tab to add a new one.
function CategoryTabs({ categories, activeCatId, onSelect, editable, onAddCategory, onRemoveCategory }) {
  if (categories.length === 0 && !editable) return null;
  return (
    <div className="flex items-end gap-1 overflow-x-auto border-b border-linear-hairline bg-linear-surface-2 px-2 pt-2">
      {categories.map((cat, idx) => {
        const active = cat.id === activeCatId;
        return (
          <div
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={`group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-2 text-xs font-medium transition ${
              active
                ? "border-linear-hairline-strong bg-linear-surface-1 text-linear-ink"
                : "border-transparent text-linear-ink-tertiary hover:bg-linear-surface-3"
            }`}
          >
            <span className="max-w-[140px] truncate">{cat.name || `หมวดที่ ${idx + 1}`}</span>
            {editable && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveCategory(cat.id);
                }}
                title="ลบหมวดหมู่นี้"
                aria-label="ลบหมวดหมู่นี้"
                className="flex h-4 w-4 items-center justify-center rounded text-linear-ink-tertiary opacity-0 hover:bg-linear-surface-3 hover:text-red-400 group-hover:opacity-100"
              >
                <X size={10} />
              </button>
            )}
          </div>
        );
      })}
      {editable && (
        <button
          type="button"
          onClick={onAddCategory}
          title="เพิ่มหมวดหมู่"
          aria-label="เพิ่มหมวดหมู่"
          className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-linear-ink-tertiary hover:bg-linear-surface-3 hover:text-linear-ink"
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}

// Lightweight formatting toolbar over a plain <textarea> — wraps/prefixes
// the current selection with the same markup renderStepText() reads back
// (see top of file), rather than pulling in a rich-text editor library.
function StepDescriptionEditor({ value, onChange }) {
  const ref = useRef(null);

  function wrapSelection(before, after = before) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = start + before.length + selected.length;
    });
  }

  function toggleLinePrefix(prefix) {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart;
    const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
    let lineEnd = value.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = value.length;
    const line = value.slice(lineStart, lineEnd);
    const bare = line.replace(/^(#{1,3} )/, "");
    const newLine = line.startsWith(prefix) ? bare : prefix + bare;
    onChange(value.slice(0, lineStart) + newLine + value.slice(lineEnd));
    requestAnimationFrame(() => el.focus());
  }

  function insertLink() {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const label = value.slice(start, end) || "ลิงก์";
    const url = window.prompt("ใส่ URL ของลิงก์");
    if (!url) return;
    const md = `[${label}](${url})`;
    onChange(value.slice(0, start) + md + value.slice(end));
  }

  return (
    <div className="overflow-hidden rounded border border-linear-hairline-strong bg-linear-surface-1">
      <div className="flex items-center gap-1 border-b border-linear-hairline bg-linear-surface-2 px-1.5 py-1">
        <button
          type="button"
          onClick={() => wrapSelection("**")}
          title="ตัวหนา"
          className="flex h-6 w-6 items-center justify-center rounded text-linear-ink-muted hover:bg-linear-surface-3 hover:text-linear-ink"
        >
          <Bold size={12} />
        </button>
        <button
          type="button"
          onClick={() => toggleLinePrefix("# ")}
          title="ตัวใหญ่"
          className="flex h-6 items-center gap-0.5 rounded px-1.5 text-[11px] font-semibold text-linear-ink-muted hover:bg-linear-surface-3 hover:text-linear-ink"
        >
          <Type size={13} /> ใหญ่
        </button>
        <button
          type="button"
          onClick={() => toggleLinePrefix("### ")}
          title="ตัวเล็ก"
          className="flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] text-linear-ink-muted hover:bg-linear-surface-3 hover:text-linear-ink"
        >
          <Type size={10} /> เล็ก
        </button>
        <button
          type="button"
          onClick={insertLink}
          title="แทรกลิงก์"
          className="flex h-6 w-6 items-center justify-center rounded text-linear-ink-muted hover:bg-linear-surface-3 hover:text-linear-ink"
        >
          <LinkIcon size={12} />
        </button>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="รายละเอียดวิธีทำ — เลือกข้อความแล้วกดปุ่มด้านบนเพื่อจัดรูปแบบ"
        rows={10}
        className="w-full resize-y border-0 bg-transparent px-2 py-1.5 text-sm text-linear-ink outline-none"
      />
    </div>
  );
}

function EditableCategory({
  category,
  categoryNames,
  onUpdateCategory,
  onUpdateStep,
  onAddStep,
  onRemoveStep,
  onRememberCategoryName,
}) {
  return (
    <div>
      <GameinfoMemoryInput
        value={category.name}
        onChange={(name) => {
          onUpdateCategory({ name });
          if (name.trim()) onRememberCategoryName(name.trim());
        }}
        suggestions={categoryNames}
        placeholder="ชื่อหมวดหมู่ เช่น เข้าเกม, เติมเงินผ่านเว็บ, แลกโค้ด"
        className="mb-3 h-10 w-full rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-3 text-sm font-semibold text-linear-ink outline-none focus:border-linear-primary"
      />

      <div className="space-y-3">
        {category.steps.map((step, stepIdx) => (
          <div key={step.id} className="rounded-md border border-linear-hairline bg-linear-surface-2 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-linear-primary">ข้อที่ {stepIdx + 1}</span>
              <button
                type="button"
                onClick={() => onRemoveStep(stepIdx)}
                title="ลบข้อ"
                aria-label="ลบข้อ"
                className="flex items-center justify-center rounded-md bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/15"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                value={step.title}
                onChange={(e) => onUpdateStep(stepIdx, { title: e.target.value })}
                placeholder={`ชื่อข้อ ${stepIdx + 1} เช่น เข้าเกมแล้วเปิดเมนูเติมเงิน`}
                className="h-9 w-full rounded border border-linear-hairline-strong bg-linear-surface-1 px-2 text-sm text-linear-ink outline-none focus:border-linear-primary"
              />
              <StepDescriptionEditor
                value={step.description}
                onChange={(description) => onUpdateStep(stepIdx, { description })}
              />
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-linear-ink-muted">รูปภาพ (ใส่กี่รูปก็ได้)</p>
                {step.imageUrls.map((url, imgIdx) => (
                  <div key={imgIdx} className="flex items-center gap-1.5">
                    {url ? (
                      <GameinfoImagePreview src={url} alt="">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                      </GameinfoImagePreview>
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-linear-surface-3 text-[10px] text-linear-ink-tertiary">
                        IMG
                      </span>
                    )}
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => {
                        const next = [...step.imageUrls];
                        next[imgIdx] = e.target.value;
                        onUpdateStep(stepIdx, { imageUrls: next });
                      }}
                      placeholder="ลิงก์รูป (URL)"
                      className="h-9 w-full rounded border border-linear-hairline-strong bg-linear-surface-1 px-2 text-xs text-linear-ink outline-none focus:border-linear-primary"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm("ลบรูปนี้ออกจากขั้นตอนใช่ไหม?")) return;
                        onUpdateStep(stepIdx, {
                          imageUrls: step.imageUrls.filter((_, i) => i !== imgIdx),
                        });
                      }}
                      title="ลบรูปนี้"
                      aria-label="ลบรูปนี้"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-linear-ink-tertiary hover:bg-linear-surface-3 hover:text-red-400"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onUpdateStep(stepIdx, { imageUrls: [...step.imageUrls, ""] })}
                  className="flex items-center gap-1 rounded-md border border-dashed border-linear-hairline-strong px-3 py-1.5 text-xs text-linear-ink-tertiary hover:bg-linear-surface-3"
                >
                  <Plus size={12} /> เพิ่มรูป
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-linear-surface-3 text-[10px] text-linear-ink-tertiary">
                  VDO
                </span>
                <input
                  type="url"
                  value={step.videoUrl}
                  onChange={(e) => onUpdateStep(stepIdx, { videoUrl: e.target.value })}
                  placeholder="ลิงก์คลิป (URL)"
                  className="h-9 w-full rounded border border-linear-hairline-strong bg-linear-surface-1 px-2 text-xs text-linear-ink outline-none focus:border-linear-primary"
                />
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={onAddStep}
          className="flex items-center gap-1 rounded-md border border-dashed border-linear-hairline-strong px-3 py-1.5 text-xs text-linear-ink-tertiary hover:bg-linear-surface-3"
        >
          <Plus size={12} /> เพิ่มข้อในหมวดนี้
        </button>
      </div>
    </div>
  );
}

// Read-only step image display — one at a time with prev/next arrows and
// dot indicators when there's more than one, matching how gameinfo already
// browses image collections elsewhere.
function ImageSlider({ images }) {
  const [idx, setIdx] = useState(0);
  if (images.length === 0) return null;
  const clamped = Math.min(idx, images.length - 1);

  return (
    <div className="relative">
      <GameinfoImagePreview
        src={images[clamped]}
        alt=""
        wrapperClassName="block w-full"
        hoverPreview={false}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[clamped]} alt="" className="w-full rounded-md" />
      </GameinfoImagePreview>
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIdx((clamped - 1 + images.length) % images.length);
            }}
            title="รูปก่อนหน้า"
            aria-label="รูปก่อนหน้า"
            className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIdx((clamped + 1) % images.length);
            }}
            title="รูปถัดไป"
            aria-label="รูปถัดไป"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <ChevronRight size={16} />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/50 px-2 py-1">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIdx(i);
                }}
                title={`รูปที่ ${i + 1}`}
                aria-label={`รูปที่ ${i + 1}`}
                className={`h-1.5 w-1.5 rounded-full ${i === clamped ? "bg-white" : "bg-white/40"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReadOnlyCategory({ category }) {
  return (
    <div className="space-y-4">
      {category.steps.map((step, idx) => (
        <div key={step.id} className="rounded-md border border-linear-hairline bg-linear-surface-2 p-3">
          <h3 className="mb-1 text-sm font-medium text-linear-ink">
            {idx + 1}. {step.title || "(ไม่มีชื่อข้อ)"}
          </h3>
          {step.description && <div className="mt-1">{renderStepText(step.description)}</div>}
          {(step.imageUrls.length > 0 || step.videoUrl) && (
            <div className="mt-3 space-y-2">
              {step.imageUrls.length > 0 && <ImageSlider images={step.imageUrls} />}
              {step.videoUrl && (
                <a
                  href={step.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-linear-primary px-3 py-2 text-xs font-medium text-white hover:bg-linear-primary-hover"
                >
                  ดูคลิปประกอบ
                </a>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
