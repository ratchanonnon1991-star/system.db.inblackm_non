"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bold, CheckCircle2, ChevronLeft, ChevronRight, Gamepad2, Globe2, Link as LinkIcon, Plus, Trash2, TriangleAlert, Type, Upload, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { assertStepImageDataSize } from "@/lib/gameinfo-step-image-size";
import { useGameinfoDialog } from "@/lib/use-gameinfo-dialog";
import {
  requestGameinfoDiscard,
  useGameinfoUnsavedChanges,
} from "@/lib/gameinfo-unsaved-changes";
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

const MAX_TUTORIAL_IMAGE_BYTES = 4 * 1024 * 1024;

async function encodeStepImage(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("เลือกรูป PNG, JPG หรือ WebP เท่านั้น");
  if (file.size > MAX_TUTORIAL_IMAGE_BYTES) throw new Error("รูปแต่ละไฟล์ต้องไม่เกิน 4MB");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.9);
  } finally {
    bitmap.close();
  }
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
  dataMode = "uid",
  compact = false,
}) {
  const isWarning = variant === "warning";
  const isVpn = variant === "vpn";
  const [open, setOpen] = useState(false);
  const buttonLabel = isWarning ? "ข้อควรระวัง" : isVpn ? "โน้ต VPN" : "Tutorial";
  useEffect(() => {
    if (!isWarning || !autoOpen || !hasData) return;
    const timer = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [autoOpen, hasData, isWarning, gameId]);

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
        aria-label={isWarning ? "ข้อควรระวังของเกม" : isVpn ? "โน้ต VPN ของเกม" : undefined}
        className={`border text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent ${compact
          ? isWarning
            ? "flex h-10 w-12 items-center justify-center rounded-lg border-linear-primary text-linear-primary hover:bg-linear-primary/10"
            : "flex h-10 min-w-20 items-center justify-center rounded-lg border-linear-primary px-3 text-linear-primary hover:bg-linear-primary/10"
          : isWarning
            ? "rounded-md border-red-600 bg-red-600 px-2 py-1 text-white hover:bg-red-700"
            : "rounded-md border-linear-hairline-strong px-2 py-1 text-linear-ink-muted hover:bg-linear-surface-2 hover:text-linear-ink"
        }`}
        title={disabled ? `บันทึกเกมนี้ก่อนถึงจะใส่${buttonLabel}ได้` : isWarning ? "ข้อควรระวังของเกม" : isVpn ? "โน้ตเกี่ยวกับการใช้ VPN" : "วิธีเติมเกม"}
      >
        {compact && isWarning ? <TriangleAlert size={17} /> : buttonLabel}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <TutorialModal
            gameId={gameId}
            gameName={gameName}
            editable={editable}
            variant={variant}
            dataMode={dataMode}
            onClose={() => setOpen(false)}
          />,
          document.body
        )}
    </>
  );
}

export function GameinfoDetailsButton({
  gameId,
  gameName,
  editable,
  hasTutorial,
  hasVpnNote,
  disabled,
  dataMode = "uid",
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  if (!editable && !hasTutorial && !hasVpnNote) return null;
  const tabs = [
    { variant: "tutorial", label: "วิธีเติม", hasData: hasTutorial },
    { variant: "vpn", label: "VPN", hasData: hasVpnNote },
  ];
  const visibleTabs = editable ? tabs : tabs.filter((tab) => tab.hasData);
  const initialVariant = visibleTabs[0]?.variant || "tutorial";

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) setOpen(true);
        }}
        disabled={disabled}
        className={`border border-linear-hairline-strong text-xs font-medium text-linear-ink-muted hover:bg-linear-surface-2 hover:text-linear-ink disabled:cursor-not-allowed disabled:opacity-60 ${compact
          ? "flex h-10 min-w-20 items-center justify-center rounded-lg px-3"
          : "rounded-md px-2 py-1"
        }`}
        title={disabled ? "บันทึกเกมนี้ก่อนเพิ่มข้อมูล" : "วิธีเติมและข้อมูลเกม"}
      >
        ข้อมูลเกม
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <TutorialModal
          gameId={gameId}
          gameName={gameName}
          editable={editable}
          variant={initialVariant}
          contentVariants={visibleTabs}
          dataMode={dataMode}
          onClose={() => setOpen(false)}
        />,
        document.body
      )}
    </>
  );
}

const TUTORIAL_MODAL_VARIANTS = {
  tutorial: { endpoint: "tutorial", dataKey: "tutorial", contentLabel: "tutorial", title: "Tutorial", noun: " tutorial" },
  warning: { endpoint: "warning", dataKey: "warning", contentLabel: "ข้อควรระวัง", title: "ข้อควรระวัง", noun: "ข้อควรระวัง" },
  vpn: { endpoint: "vpn-note", dataKey: "vpnNote", contentLabel: "รายละเอียด VPN", title: "รายละเอียด VPN", noun: "รายละเอียด VPN" },
};

export function TutorialModal({ gameId, gameName, editable, variant, contentVariants = null, dataMode = "uid", onClose }) {
  // Category delete-confirm / empty-state copy and the endpoint/response key
  // to talk to — tutorial and warning keep their exact original strings
  // (including tutorial's leading-space " tutorial"), vpn is the only new
  // branch.
  const [activeVariant, setActiveVariant] = useState(variant);
  const meta = TUTORIAL_MODAL_VARIANTS[activeVariant] || TUTORIAL_MODAL_VARIANTS.tutorial;
  const endpoint = `/api/gameinfo/gamelist/${gameId}/${meta.endpoint}${dataMode === "idpass" ? "?mode=idpass" : ""}`;
  const dataKey = meta.dataKey;
  const contentLabel = meta.contentLabel;
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [categoryNames, setCategoryNames] = useState([]);
  const [activeCatId, setActiveCatId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [savedAt, setSavedAt] = useState(null);
  const closeTimerRef = useRef(null);
  // Snapshot of the last loaded/saved categories, used by both the modal's
  // close confirmation and the page-level unsaved-navigation guard.
  const [savedSnapshot, setSavedSnapshot] = useState(null);

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
          setSavedSnapshot(JSON.stringify(data[dataKey].categories));
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
  }, [activeVariant, contentLabel, dataKey, endpoint]);

  const dirty = editable && (pendingUploads > 0 || (savedSnapshot !== null && JSON.stringify(categories) !== savedSnapshot));
  useGameinfoUnsavedChanges(dirty);

  function requestClose() {
    if (pendingUploads > 0) { setError("รอให้เพิ่มรูปเสร็จก่อนปิดหน้าต่าง"); return; }
    if (dirty) {
      requestGameinfoDiscard({
        message: `${contentLabel}ที่ยังไม่บันทึกจะหายไป`,
        confirmLabel: "ปิดโดยไม่บันทึก",
        onConfirm: onClose,
      });
      return;
    }
    onClose();
  }

  function switchContentVariant(nextVariant) {
    if (nextVariant === activeVariant) return;
    if (pendingUploads > 0) { setError("รอให้เพิ่มรูปเสร็จก่อนเปลี่ยนแท็บ"); return; }
    const switchVariant = () => {
      setActiveVariant(nextVariant);
      setLoading(true);
      setCategories([]);
      setCategoryNames([]);
      setActiveCatId(null);
      setError("");
      setSavedAt(null);
      setSavedSnapshot(null);
    };
    if (dirty) {
      requestGameinfoDiscard({
        message: `${contentLabel}ที่ยังไม่บันทึกจะหายไปเมื่อเปลี่ยนแท็บ`,
        confirmLabel: "เปลี่ยนแท็บ",
        onConfirm: switchVariant,
      });
      return;
    }
    switchVariant();
  }

  const { dialogRef, titleId, onBackdropMouseDown } = useGameinfoDialog({ onRequestClose: requestClose });

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

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
    if (!window.confirm(`ลบหมวดหมู่${meta.noun} "${category?.name || "ไม่มีชื่อ"}" พร้อมขั้นตอนทั้งหมด ใช่ไหม?`)) return;
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
          : { ...c, steps: c.steps.map((s, j) => (j === stepIdx ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s)) }
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
    if (pendingUploads > 0) { setError("รอให้เพิ่มรูปเสร็จก่อนบันทึก"); return; }
    setSaving(true);
    setError("");
    try {
      assertStepImageDataSize(categories);
      const data = await apiJson(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories }),
        fallbackError: `บันทึก${contentLabel}ไม่สำเร็จ`,
      });
      setCategories(data[dataKey].categories);
      setSavedSnapshot(JSON.stringify(data[dataKey].categories));
      setSavedAt(Date.now());
      closeTimerRef.current = window.setTimeout(onClose, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : `บันทึก${contentLabel}ไม่สำเร็จ`);
    } finally {
      setSaving(false);
    }
  }

  const activeCategory = categories.find((c) => c.id === activeCatId) || null;
  const guideHeader = activeVariant !== "warning";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onBackdropMouseDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-linear-hairline bg-white shadow-2xl"
      >
        <div className="relative isolate flex min-h-40 shrink-0 items-center gap-5 overflow-hidden bg-gradient-to-r from-[#e00d17] via-[#b30912] to-[#85070c] px-6 py-8 text-white sm:min-h-52 sm:gap-10 sm:px-14 sm:py-10">
          <span aria-hidden="true" className="pointer-events-none absolute -right-4 bottom-0 select-none text-[7rem] font-black leading-none tracking-tight text-black/10 sm:text-[10rem]">GAME</span>
          {!guideHeader && <span className="relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-red-700 sm:h-28 sm:w-28 sm:rounded-3xl"><Gamepad2 className="h-11 w-11 sm:h-20 sm:w-20" strokeWidth={3} aria-hidden="true" /></span>}
          <h2 id={titleId} className="relative z-10 min-w-0 pr-8 text-3xl font-bold leading-tight sm:text-5xl">
            {guideHeader ? "วิธีเติมและข้อมูลเกม" : "ข้อควรระวัง"}
            <span className="mt-1 block break-words text-2xl uppercase tracking-wide sm:text-4xl">{gameName}</span>
            {!guideHeader && <span className="mt-1 block text-sm font-semibold leading-snug sm:text-base">กรุณาอ่านและทำตามขั้นตอนก่อนทำรายการ เพื่อป้องกันการทำผิดพลาด</span>}
          </h2>
          <button type="button" onClick={requestClose} className="absolute right-3 top-3 z-10 flex flex-col items-center rounded-md px-2 py-1 text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white" aria-label="ปิด">
            <X size={30} strokeWidth={3} aria-hidden="true" />
            ปิด
          </button>
        </div>

        {contentVariants?.length > 1 ? (
          <div className={guideHeader ? "flex flex-wrap gap-3 bg-white px-6 py-4 sm:px-7" : "flex gap-1 border-b border-linear-hairline bg-linear-surface-2 px-3 pt-2"} role="tablist" aria-label="ประเภทข้อมูลเกม">
            {contentVariants.map((tab) => (
              <button
                key={tab.variant}
                type="button"
                role="tab"
                aria-selected={activeVariant === tab.variant}
                onClick={() => switchContentVariant(tab.variant)}
                className={guideHeader
                  ? `flex min-h-14 min-w-40 items-center justify-center gap-3 rounded-2xl border-2 px-5 text-xl font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 ${activeVariant === tab.variant ? "border-red-600 bg-red-600" : "border-red-700 bg-red-700 hover:bg-red-600"}`
                  : `rounded-t-md border border-b-0 px-4 py-2 text-xs font-medium ${activeVariant === tab.variant ? "border-linear-hairline-strong bg-linear-surface-1 text-linear-ink" : "border-transparent text-linear-ink-tertiary hover:bg-linear-surface-3"}`}
              >
                {guideHeader && tab.variant === "tutorial" ? <Gamepad2 size={28} aria-hidden="true" /> : null}
                {guideHeader && tab.variant === "vpn" ? <Globe2 size={28} aria-hidden="true" /> : null}
                {tab.variant === "tutorial" && guideHeader ? "วิธีเติม" : tab.label}
              </button>
            ))}
          </div>
        ) : null}

        {!loading && activeVariant !== "warning" && (
          <CategoryTabs
            categories={categories}
            activeCatId={activeCatId}
            onSelect={setActiveCatId}
            editable={editable}
            onAddCategory={addCategory}
            onRemoveCategory={removeCategory}
            featured={guideHeader}
          />
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-linear-ink-tertiary">กำลังโหลด...</p>
          ) : activeVariant === "warning" ? (
            <QuickWarningList
              categories={categories}
              editable={editable}
              onCategoriesChange={setCategories}
              onUploadStateChange={(busy) => setPendingUploads((count) => count + (busy ? 1 : -1))}
              imageUploadDisabled={saving || Boolean(savedAt)}
            />
          ) : categories.length === 0 ? (
            <p className="rounded-lg border border-dashed border-linear-hairline-strong p-8 text-center text-sm text-linear-ink-tertiary">
              {editable
                ? 'ยังไม่มีหมวดหมู่ กด "เพิ่มหมวดหมู่" ที่แถบแท็บด้านบนเพื่อเริ่ม'
                : `ยังไม่มี${meta.noun}สำหรับเกมนี้`}
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
              onUploadStateChange={(busy) => setPendingUploads((count) => count + (busy ? 1 : -1))}
              imageUploadDisabled={saving || Boolean(savedAt)}
              existingCategories={categories}
            />
          ) : (
            <ReadOnlyCategory key={activeCategory.id} category={activeCategory} />
          )}
          {error && <p role="alert" className="mt-3 text-xs text-linear-danger">{error}</p>}
        </div>

        {editable && !loading && (
          <div className="flex items-center gap-3 border-t border-linear-hairline px-5 py-3">
            {savedAt && !saving && (
              <span className="flex items-center gap-1.5 text-xs text-linear-success" role="status">
                <CheckCircle2 size={15} aria-hidden="true" />
                บันทึกเรียบร้อย
              </span>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={requestClose}
              disabled={saving || pendingUploads > 0}
              className="rounded-md border border-linear-hairline-strong px-3 py-1.5 text-xs text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-50"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || pendingUploads > 0 || Boolean(savedAt)}
              className="rounded-md bg-linear-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-linear-primary-hover disabled:opacity-50"
            >
              {pendingUploads > 0 ? "กำลังเพิ่มรูป..." : saving ? "กำลังบันทึก..." : savedAt ? "บันทึกแล้ว" : "บันทึก"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickWarningList({ categories, editable, onCategoriesChange, onUploadStateChange, imageUploadDisabled }) {
  const items = categories.flatMap((category) =>
    category.steps.map((step, stepIndex) => ({ category, step, stepIndex }))
  );

  function addItem() {
    const next = emptyStep();
    if (categories.length === 0) {
      onCategoriesChange([{ id: genId("warning"), name: "ข้อควรระวัง", steps: [next] }]);
      return;
    }
    onCategoriesChange(categories.map((category, index) => index === 0
      ? { ...category, steps: [...category.steps, next] }
      : category
    ));
  }

  function updateItem(categoryId, stepIndex, patch) {
    onCategoriesChange((currentCategories) => currentCategories.map((category) => category.id === categoryId
      ? { ...category, steps: category.steps.map((step, index) => index === stepIndex ? { ...step, ...(typeof patch === "function" ? patch(step) : patch) } : step) }
      : category
    ));
  }

  function updateImage(categoryId, stepIndex, imageIndex, imageUrl) {
    const item = categories.find((category) => category.id === categoryId)?.steps[stepIndex];
    if (!item) return;
    const imageUrls = [...item.imageUrls];
    imageUrls[imageIndex] = imageUrl;
    updateItem(categoryId, stepIndex, { imageUrls });
  }

  function addImage(categoryId, stepIndex) {
    const item = categories.find((category) => category.id === categoryId)?.steps[stepIndex];
    if (!item) return;
    updateItem(categoryId, stepIndex, { imageUrls: [...item.imageUrls, ""] });
  }

  function removeImage(categoryId, stepIndex, imageIndex) {
    const item = categories.find((category) => category.id === categoryId)?.steps[stepIndex];
    if (!item) return;
    updateItem(categoryId, stepIndex, { imageUrls: item.imageUrls.filter((_, index) => index !== imageIndex) });
  }

  function removeItem(categoryId, stepIndex) {
    if (!window.confirm("ลบข้อความเตือนนี้ใช่ไหม?")) return;
    onCategoriesChange(categories
      .map((category) => category.id === categoryId
        ? { ...category, steps: category.steps.filter((_, index) => index !== stepIndex) }
        : category
      )
      .filter((category) => category.steps.length > 0)
    );
  }

  return (
    <div className={editable ? "mx-auto max-w-3xl" : "w-full"}>
      {editable ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-linear-hairline bg-linear-surface-2 p-3">
          <div>
            <p className="text-sm font-medium text-linear-ink">ข้อความเตือนแบบสั้น</p>
            <p className="text-xs text-linear-ink-tertiary">ใช้ข้อความที่อ่านจบได้ทันที และเพิ่มรูปประกอบได้ตามต้องการ</p>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linear-hairline-strong p-8 text-center text-sm text-linear-ink-tertiary">
          {editable ? "ยังไม่มีข้อความเตือน" : "ไม่มีข้อควรระวังสำหรับเกมนี้"}
        </p>
      ) : (
        <ul className={editable ? "space-y-2" : "space-y-8"}>
          {items.map(({ category, step, stepIndex }, index) => (
            <li key={`${category.id}-${step.id}`} className={editable ? "flex items-start gap-3 rounded-lg border border-linear-hairline bg-linear-surface-2 p-3" : "flex items-start gap-4 rounded-[26px] border border-[#e8e8e8] bg-[#f8f9fb] p-4 sm:gap-6 sm:p-6"}>
              <span className={editable ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-linear-surface-3 text-[11px] font-semibold text-linear-ink-tertiary" : "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#eceef0] text-xl font-bold text-[#1d1d1d] sm:h-12 sm:w-12"}>{index + 1}</span>
              <div className="min-w-0 flex-1">
                {editable ? (
                  <div className="space-y-2">
                    <input
                      value={step.title}
                      onChange={(event) => updateItem(category.id, stepIndex, { title: event.target.value })}
                      placeholder="ข้อความสั้น เช่น ห้ามเปิด VPN ระหว่างชำระเงิน"
                      className="h-9 w-full rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none focus:border-linear-primary"
                    />
                    {step.description ? (
                      <textarea
                        value={step.description}
                        onChange={(event) => updateItem(category.id, stepIndex, { description: event.target.value })}
                        placeholder="รายละเอียดเพิ่มเติมจากข้อมูลเดิม"
                        rows={3}
                        className="w-full resize-y rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-3 py-2 text-sm text-linear-ink outline-none focus:border-linear-primary"
                      />
                    ) : null}
                  </div>
                ) : (
                  <div>
                    {step.title ? <p className="text-base font-bold leading-relaxed text-[#1d1d1d] sm:text-lg">{step.title}</p> : null}
                    {step.description ? <div className={`${step.title ? "mt-2" : ""} [&_p]:text-[#4b4b4b]`}>{renderStepText(step.description)}</div> : null}
                    {!step.title && !step.description ? <p className="text-sm text-[#666]">-</p> : null}
                  </div>
                )}

                {editable ? (
                  <div className="mt-2 space-y-2">
                    {step.imageUrls.map((imageUrl, imageIndex) => (
                      <div key={imageIndex} className="flex items-center gap-2">
                        {imageUrl ? (
                          <GameinfoImagePreview src={imageUrl} alt="">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                          </GameinfoImagePreview>
                        ) : (
                          <span className="h-9 w-9 shrink-0 rounded-md border border-dashed border-linear-hairline-strong" />
                        )}
                        {imageUrl.startsWith("data:image/") ? (
                          <span className="flex h-9 min-w-0 flex-1 items-center rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-3 text-xs text-linear-ink-muted">รูปที่อัปโหลด</span>
                        ) : (
                          <input
                            value={imageUrl}
                            onChange={(event) => updateImage(category.id, stepIndex, imageIndex, event.target.value)}
                            placeholder="URL รูปภาพ"
                            className="h-9 min-w-0 flex-1 rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-3 text-xs text-linear-ink outline-none focus:border-linear-primary"
                          />
                        )}
                        <button type="button" onClick={() => removeImage(category.id, stepIndex, imageIndex)} aria-label="ลบรูป" title="ลบรูป" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-linear-ink-tertiary hover:bg-red-500/10 hover:text-red-500">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => addImage(category.id, stepIndex)} className="flex items-center gap-1 rounded-md border border-dashed border-linear-hairline-strong px-3 py-1.5 text-xs text-linear-ink-tertiary hover:bg-linear-surface-3">
                        <Plus size={13} /> เพิ่ม URL รูป
                      </button>
                      <StepImageUpload onImages={(urls) => updateItem(category.id, stepIndex, (current) => ({ imageUrls: [...current.imageUrls, ...urls] }))} onUploadStateChange={onUploadStateChange} disabled={imageUploadDisabled} existingCategories={categories} />
                    </div>
                    <p className="text-[11px] text-linear-ink-tertiary">รองรับ PNG, JPG, WebP · ไฟล์ละไม่เกิน 4 MB · รูปที่อัปโหลดในส่วนนี้รวมกันไม่เกิน 4 MB หลังแปลงไฟล์</p>
                    <input
                      value={step.videoUrl}
                      onChange={(event) => updateItem(category.id, stepIndex, { videoUrl: event.target.value })}
                      placeholder="URL วิดีโอ (ไม่บังคับ)"
                      className="h-9 w-full rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-3 text-xs text-linear-ink outline-none focus:border-linear-primary"
                    />
                  </div>
                ) : step.imageUrls.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {step.imageUrls.map((imageUrl, imageIndex) => (
                      <GameinfoImagePreview key={imageIndex} src={imageUrl} alt="">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl} alt={`รูปประกอบข้อควรระวัง ${index + 1}`} className="max-h-64 max-w-full rounded-lg border border-[#e8e8e8] bg-white object-contain shadow-sm sm:max-w-64" />
                      </GameinfoImagePreview>
                    ))}
                  </div>
                ) : null}
                {!editable && step.videoUrl ? (
                  <a href={step.videoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex h-9 items-center rounded-md border border-linear-hairline-strong px-3 text-xs font-medium text-linear-ink-muted hover:bg-linear-surface-2 hover:text-linear-ink">
                    ดูวิดีโอประกอบ
                  </a>
                ) : null}
              </div>
              {editable ? (
                <button type="button" onClick={() => removeItem(category.id, stepIndex)} aria-label="ลบข้อความเตือน" title="ลบข้อความเตือน" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-linear-ink-tertiary hover:bg-red-500/10 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <button type="button" onClick={addItem} className="mt-3 flex h-9 items-center gap-2 rounded-md border border-linear-hairline-strong px-3 text-xs font-medium text-linear-primary hover:bg-linear-surface-2">
          <Plus size={14} /> เพิ่มข้อความเตือน
        </button>
      ) : null}
    </div>
  );
}

// Browser-style tab strip — one tab per category. The active tab visually
// merges into the content panel below it (same surface color, no bottom
// border); editable mode adds a hover "x" per tab (closes/removes that
// category) and a trailing "+" tab to add a new one.
function CategoryTabs({ categories, activeCatId, onSelect, editable, onAddCategory, onRemoveCategory, featured = false }) {
  if (categories.length === 0 && !editable) return null;
  return (
    <div className={featured ? "flex items-center gap-0 overflow-x-auto bg-white px-6 pb-5 pt-1 sm:px-7" : "flex items-end gap-1 overflow-x-auto border-b border-linear-hairline bg-linear-surface-2 px-2 pt-2"}>
      {categories.map((cat, idx) => {
        const active = cat.id === activeCatId;
        return (
          <div
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={featured
              ? `group flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 border px-4 text-sm font-semibold transition ${idx === 0 ? "rounded-l-full" : ""} ${idx === categories.length - 1 ? "rounded-r-full" : ""} ${active ? "border-red-600 bg-red-600 text-white" : "border-gray-200 bg-white text-gray-900 hover:bg-red-50"}`
              : `group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-2 text-xs font-medium transition ${active ? "border-linear-hairline-strong bg-linear-surface-1 text-linear-ink" : "border-transparent text-linear-ink-tertiary hover:bg-linear-surface-3"}`}
          >
            <span className="max-w-[180px] truncate">{cat.name || `หมวดที่ ${idx + 1}`}</span>
            {editable && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveCategory(cat.id);
                }}
                title="ลบหมวดหมู่นี้"
                aria-label="ลบหมวดหมู่นี้"
                className={featured
                  ? `flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs focus-visible:outline-2 focus-visible:outline-offset-2 ${active ? "bg-white text-red-600 hover:bg-red-100 focus-visible:outline-white" : "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600"}`
                  : "flex h-4 w-4 items-center justify-center rounded text-linear-ink-tertiary opacity-0 hover:bg-linear-surface-3 hover:text-red-400 group-hover:opacity-100"}
              >
                <X size={featured ? 12 : 10} />
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
          className={featured
            ? "ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-red-600"
            : "mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-linear-ink-tertiary hover:bg-linear-surface-3 hover:text-linear-ink"}
        >
          <Plus size={featured ? 18 : 14} />
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

function StepImageUpload({ onImages, onUploadStateChange, existingCategories, disabled = false }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setUploading(true);
    onUploadStateChange(true);
    setError("");
    try {
      const urls = await Promise.all(files.map(encodeStepImage));
      assertStepImageDataSize([...existingCategories, { steps: [{ imageUrls: urls }] }]);
      onImages(urls);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
      onUploadStateChange(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handleFiles} className="hidden" aria-label="เลือกรูปประกอบ" />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || disabled} className="flex items-center gap-1 rounded-md border border-dashed border-linear-hairline-strong px-3 py-1.5 text-xs text-linear-ink-tertiary hover:bg-linear-surface-3 disabled:opacity-60">
        <Upload size={12} /> {uploading ? "กำลังเพิ่มรูป..." : "อัปโหลดรูป"}
      </button>
      {error && <p role="alert" className="text-xs text-linear-danger">{error}</p>}
    </>
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
  onUploadStateChange,
  imageUploadDisabled,
  existingCategories,
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
                    {url.startsWith("data:image/") ? (
                      <span className="flex h-9 w-full items-center rounded border border-linear-hairline-strong bg-linear-surface-1 px-2 text-xs text-linear-ink-muted">รูปที่อัปโหลด</span>
                    ) : (
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
                    )}
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
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateStep(stepIdx, { imageUrls: [...step.imageUrls, ""] })}
                    className="flex items-center gap-1 rounded-md border border-dashed border-linear-hairline-strong px-3 py-1.5 text-xs text-linear-ink-tertiary hover:bg-linear-surface-3"
                  >
                    <Plus size={12} /> เพิ่ม URL รูป
                  </button>
                  <StepImageUpload onImages={(urls) => onUpdateStep(stepIdx, (current) => ({ imageUrls: [...current.imageUrls, ...urls] }))} onUploadStateChange={onUploadStateChange} disabled={imageUploadDisabled} existingCategories={existingCategories} />
                </div>
                <p className="text-[11px] text-linear-ink-tertiary">รองรับ PNG, JPG, WebP · ไฟล์ละไม่เกิน 4 MB · รูปที่อัปโหลดในส่วนนี้รวมกันไม่เกิน 4 MB หลังแปลงไฟล์</p>
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
// Show two images per page so a step with many screenshots stays compact.
function ImageSlider({ images }) {
  const [page, setPage] = useState(0);
  if (images.length === 0) return null;
  const pageCount = Math.ceil(images.length / 2);
  const currentPage = Math.min(page, pageCount - 1);

  return (
    <div>
      <div className="relative grid grid-cols-2 items-start gap-3">
        {images.slice(currentPage * 2, currentPage * 2 + 2).map((image, offset) => (
          <GameinfoImagePreview key={`${currentPage}-${offset}`} src={image} alt={`รูปประกอบ ${currentPage * 2 + offset + 1}`} wrapperClassName="block w-full" hoverPreview={false}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={`รูปประกอบ ${currentPage * 2 + offset + 1}`} className="max-h-80 w-full rounded-md object-contain" />
          </GameinfoImagePreview>
        ))}
      {pageCount > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPage((current) => (current - 1 + pageCount) % pageCount);
            }}
            title="รูปชุดก่อนหน้า"
            aria-label="รูปชุดก่อนหน้า"
            className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPage((current) => (current + 1) % pageCount);
            }}
            title="รูปชุดถัดไป"
            aria-label="รูปชุดถัดไป"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <ChevronRight size={16} />
          </button>
        </>
      )}
      </div>
      {pageCount > 1 && (
          <div className="mt-3 flex justify-center gap-2">
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPage(i);
                }}
                title={`รูปชุดที่ ${i + 1}`}
                aria-label={`รูปชุดที่ ${i + 1}`}
                aria-current={i === currentPage ? "true" : undefined}
                className={`h-2 w-2 rounded-full ${i === currentPage ? "bg-red-600" : "bg-gray-300 hover:bg-gray-400"}`}
              />
            ))}
          </div>
      )}
    </div>
  );
}

function ReadOnlyCategory({ category }) {
  const [stepIndex, setStepIndex] = useState(0);
  const steps = category.steps;
  if (steps.length === 0) return null;
  const step = steps[stepIndex];

  return (
    <div className="relative">
        <div key={step.id} className="w-full rounded-[28px] border border-[#e8e8e8] bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.09)] sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#c91d28] text-2xl font-bold text-white" aria-hidden="true">{stepIndex + 1}</span>
            <h3 className="text-xl font-bold leading-tight text-[#1d1d1d] sm:text-2xl">{step.title || "(ไม่มีชื่อข้อ)"}</h3>
          </div>
          <div className="mt-2 sm:ml-[3.75rem]">
            {step.description && <div className="[&_p]:text-[#4b4b4b]">{renderStepText(step.description)}</div>}
            {(step.imageUrls.length > 0 || step.videoUrl) && (
              <div className="mt-3 max-w-3xl space-y-3">
                {step.imageUrls.length > 0 && <ImageSlider images={step.imageUrls} />}
                {step.videoUrl && (
                  <a
                    href={step.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full max-w-sm items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    ดูคลิปประกอบ
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      {steps.length > 1 && (
        <>
          <button type="button" onClick={() => setStepIndex((index) => (index - 1 + steps.length) % steps.length)} aria-label="ข้อก่อนหน้า" className="absolute -left-4 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-red-600/75 text-white shadow-md hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 sm:-left-5">
            <ChevronLeft size={28} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setStepIndex((index) => (index + 1) % steps.length)} aria-label="ข้อถัดไป" className="absolute -right-4 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-red-600/75 text-white shadow-md hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 sm:-right-5">
            <ChevronRight size={28} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
