"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import GameinfoImagePreview from "./gameinfo-image-preview";

function genId() {
  return `step_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function emptyStep() {
  return { id: genId(), title: "", description: "", imageUrl: "", videoUrl: "" };
}

// Trigger button + popup overlay for one game's "how to top up" tutorial —
// steps (unlimited, numbered 1..N) each with a title, instructions, and an
// optional image/video URL. Storage is gamelist_tutorials (see
// src/server/gameinfo-gamelist-tutorial.js), fetched lazily the first time
// the popup opens rather than preloaded onto every row of the list table.
// `editable` (staff/admin) gets the add/edit/save form; everyone else gets a
// read-only view of the same steps.
export default function GameinfoTutorialButton({ gameId, gameName, editable }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="rounded-md border border-linear-hairline-strong px-2 py-1 text-xs text-linear-ink-muted hover:bg-linear-surface-2 hover:text-linear-ink"
        title="วิธีเติมเกม"
      >
        Tutorial
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <TutorialModal
            gameId={gameId}
            gameName={gameName}
            editable={editable}
            onClose={() => setOpen(false)}
          />,
          document.body
        )}
    </>
  );
}

function TutorialModal({ gameId, gameName, editable, onClose }) {
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson(`/api/gameinfo/gamelist/${gameId}/tutorial`, {
          fallbackError: "โหลด tutorial ไม่สำเร็จ",
        });
        if (!cancelled) setSteps(data.tutorial.steps);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "โหลด tutorial ไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function updateStep(idx, patch) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, emptyStep()]);
  }
  function removeStep(idx) {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const data = await apiJson(`/api/gameinfo/gamelist/${gameId}/tutorial`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
        fallbackError: "บันทึก tutorial ไม่สำเร็จ",
      });
      setSteps(data.tutorial.steps);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึก tutorial ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-linear-hairline px-5 py-3">
          <h2 className="text-sm font-semibold text-linear-ink">
            Tutorial: {gameName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 items-center justify-center rounded px-2 text-xs text-linear-ink-tertiary hover:bg-linear-surface-2 hover:text-linear-ink"
            aria-label="ปิด"
          >
            ปิด
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-linear-ink-tertiary">กำลังโหลด...</p>
          ) : editable ? (
            <EditableSteps steps={steps} onUpdate={updateStep} onRemove={removeStep} />
          ) : (
            <ReadOnlySteps steps={steps} />
          )}
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        </div>

        {editable && !loading && (
          <div className="flex items-center gap-3 border-t border-linear-hairline px-5 py-3">
            <button
              type="button"
              onClick={addStep}
              className="flex items-center gap-1 rounded-md border border-linear-primary/40 px-3 py-1.5 text-xs text-linear-primary hover:bg-linear-primary/10"
            >
              <Plus size={13} /> เพิ่มหัวข้อ
            </button>
            <div className="flex-1" />
            {savedAt && !saving && <span className="text-xs text-emerald-400">บันทึกแล้ว</span>}
            <button
              type="button"
              onClick={onClose}
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

function EditableSteps({ steps, onUpdate, onRemove }) {
  if (steps.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-linear-hairline-strong p-8 text-center text-sm text-linear-ink-tertiary">
        ยังไม่มีหัวข้อ กด &quot;เพิ่มหัวข้อ&quot; ด้านล่างเพื่อเริ่ม
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {steps.map((step, idx) => (
        <div key={step.id} className="rounded-md border border-linear-hairline bg-linear-surface-2 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-linear-primary">หัวข้อที่ {idx + 1}</span>
            <button
              type="button"
              onClick={() => onRemove(idx)}
              title="ลบหัวข้อ"
              aria-label="ลบหัวข้อ"
              className="flex items-center justify-center rounded-md bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/15"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={step.title}
              onChange={(e) => onUpdate(idx, { title: e.target.value })}
              placeholder={`ชื่อหัวข้อ ${idx + 1} เช่น เข้าเกมแล้วเปิดเมนูเติมเงิน`}
              className="h-9 w-full rounded border border-linear-hairline-strong bg-linear-surface-1 px-2 text-sm text-linear-ink outline-none focus:border-linear-primary"
            />
            <textarea
              value={step.description}
              onChange={(e) => onUpdate(idx, { description: e.target.value })}
              placeholder="รายละเอียดวิธีทำ"
              rows={3}
              className="w-full resize-y rounded border border-linear-hairline-strong bg-linear-surface-1 px-2 py-1.5 text-sm text-linear-ink outline-none focus:border-linear-primary"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-1.5">
                {step.imageUrl ? (
                  <GameinfoImagePreview src={step.imageUrl} alt="">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={step.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                  </GameinfoImagePreview>
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-linear-surface-3 text-[10px] text-linear-ink-tertiary">
                    IMG
                  </span>
                )}
                <input
                  type="url"
                  value={step.imageUrl}
                  onChange={(e) => onUpdate(idx, { imageUrl: e.target.value })}
                  placeholder="ลิงก์รูป (URL)"
                  className="h-9 w-full rounded border border-linear-hairline-strong bg-linear-surface-1 px-2 text-xs text-linear-ink outline-none focus:border-linear-primary"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-linear-surface-3 text-[10px] text-linear-ink-tertiary">
                  VDO
                </span>
                <input
                  type="url"
                  value={step.videoUrl}
                  onChange={(e) => onUpdate(idx, { videoUrl: e.target.value })}
                  placeholder="ลิงก์คลิป (URL)"
                  className="h-9 w-full rounded border border-linear-hairline-strong bg-linear-surface-1 px-2 text-xs text-linear-ink outline-none focus:border-linear-primary"
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReadOnlySteps({ steps }) {
  if (steps.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-linear-hairline-strong p-8 text-center text-sm text-linear-ink-tertiary">
        ยังไม่มี tutorial สำหรับเกมนี้
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {steps.map((step, idx) => (
        <div key={step.id} className="rounded-md border border-linear-hairline bg-linear-surface-2 p-3">
          <h3 className="mb-1 text-sm font-medium text-linear-ink">
            {idx + 1}. {step.title || "(ไม่มีชื่อหัวข้อ)"}
          </h3>
          {step.description && (
            <p className="whitespace-pre-wrap text-sm text-linear-ink-muted">{step.description}</p>
          )}
          {(step.imageUrl || step.videoUrl) && (
            <div className="mt-3 space-y-2">
              {step.imageUrl && (
                <GameinfoImagePreview
                  src={step.imageUrl}
                  alt=""
                  wrapperClassName="block w-full"
                  hoverPreview={false}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={step.imageUrl}
                    alt=""
                    className="max-h-80 w-full rounded-md object-cover"
                  />
                </GameinfoImagePreview>
              )}
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
