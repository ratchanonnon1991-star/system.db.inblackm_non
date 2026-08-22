"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { useGameinfoDialog } from "@/lib/use-gameinfo-dialog";

function newLink() {
  return {
    id: `link_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`,
    name: "",
    url: "",
  };
}

export function GameinfoGameLinksButton({
  gameId,
  gameName,
  links = [],
  editable,
  dataMode = "uid",
  disabled,
  onSaved,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(links);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { dialogRef, titleId, onBackdropMouseDown } = useGameinfoDialog({ open, onRequestClose: requestClose });

  function show() {
    if (disabled) return;
    setDraft(links.map((link) => ({ ...link })));
    setError("");
    setOpen(true);
  }

  function requestClose() {
    const dirty = editable && JSON.stringify(draft) !== JSON.stringify(links);
    if (dirty && !window.confirm("ยังไม่ได้บันทึกรายการลิงก์ ต้องการปิดโดยไม่บันทึกหรือไม่?")) return;
    setOpen(false);
  }

  if (!editable && links.length === 0) {
    return <span className="text-xs text-linear-ink-tertiary">-</span>;
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const data = await apiJson(`/api/gameinfo/gamelist/${gameId}/links${dataMode === "idpass" ? "?mode=idpass" : ""}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: draft }),
        fallbackError: "บันทึกลิงก์ไม่สำเร็จ",
      });
      onSaved?.(data.links);
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกลิงก์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          show();
        }}
        disabled={disabled}
        className="rounded-md border border-linear-hairline-strong px-2 py-1 text-xs text-linear-ink-muted hover:bg-linear-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {editable ? `จัดการลิงก์${links.length ? ` (${links.length})` : ""}` : `เลือกลิงก์ (${links.length})`}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onBackdropMouseDown}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="w-full max-w-xl rounded-lg border border-linear-hairline bg-linear-surface-1 text-linear-ink shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-linear-hairline px-4 py-3">
              <h2 id={titleId} className="text-sm font-semibold text-linear-ink">ลิงก์เว็บ: {gameName}</h2>
              <button type="button" onClick={requestClose} className="text-xs text-linear-ink-tertiary hover:text-linear-ink">ปิด</button>
            </div>
            <div className="max-h-[65vh] space-y-2 overflow-y-auto p-4">
              {editable ? draft.map((link, index) => (
                <div key={link.id} className="grid grid-cols-[minmax(100px,0.8fr)_minmax(180px,1.5fr)_32px] gap-2">
                  <input
                    value={link.name}
                    onChange={(event) => setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}
                    placeholder="ชื่อปุ่ม เช่น เติมผ่านเว็บหลัก"
                    className="h-9 rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-2 text-sm text-linear-ink caret-linear-primary outline-none placeholder:text-linear-ink-tertiary focus:border-linear-primary"
                  />
                  <input
                    value={link.url}
                    onChange={(event) => setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))}
                    placeholder="https://..."
                    className="h-9 rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-2 text-sm text-linear-ink caret-linear-primary outline-none placeholder:text-linear-ink-tertiary focus:border-linear-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    aria-label={`ลบลิงก์ ${link.name || index + 1}`}
                    className="flex h-9 items-center justify-center rounded-md text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )) : links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-md border border-linear-hairline-strong px-3 py-2 text-sm text-linear-ink-muted hover:bg-linear-surface-2 hover:text-linear-ink"
                >
                  {link.name} <ExternalLink size={14} />
                </a>
              ))}
              {(editable ? draft : links).length === 0 ? (
                <p className="py-6 text-center text-sm text-linear-ink-tertiary">ยังไม่มีลิงก์สำหรับเกมนี้</p>
              ) : null}
              {error ? <p role="alert" className="text-xs text-linear-danger">{error}</p> : null}
            </div>
            {editable ? (
              <div className="flex items-center gap-2 border-t border-linear-hairline px-4 py-3">
                <button
                  type="button"
                  onClick={() => setDraft((current) => [...current, newLink()])}
                  disabled={draft.length >= 20}
                  className="flex items-center gap-1 rounded-md border border-linear-hairline-strong px-2 py-1.5 text-xs text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-40"
                >
                  <Plus size={13} /> เพิ่มลิงก์
                </button>
                <div className="flex-1" />
                <button type="button" onClick={requestClose} disabled={saving} className="rounded-md px-3 py-1.5 text-xs text-linear-ink-muted">ยกเลิก</button>
                <button type="button" onClick={save} disabled={saving} className="rounded-md bg-linear-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                  {saving ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function GameinfoGameLinkButtons({ links = [] }) {
  if (links.length === 0) {
    return <span className="inline-block text-xs text-linear-ink-tertiary">ยังไม่มีลิงก์เว็บเติมเกม</span>;
  }
  return links.map((link) => (
    <a
      key={link.id}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md bg-linear-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-linear-primary-hover"
    >
      {link.name} <ExternalLink size={13} />
    </a>
  ));
}
