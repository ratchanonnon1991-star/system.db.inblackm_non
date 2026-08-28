"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, X } from "lucide-react";
import GameinfoImagePickerModal from "./gameinfo-image-picker-modal";
import { useGameinfoUnsavedChanges } from "@/lib/gameinfo-unsaved-changes";
import { gameinfoStableColorStyle } from "@/lib/gameinfo-stable-color";

// Multi-value chip input with the same "remembers past values" dropdown as
// GameinfoMemoryInput — used for pack payment channels. Ported from
// gameinfo's TagsInput.tsx (slate palette swapped for zinc).
export default function GameinfoTagsInput({
  values,
  onChange,
  suggestions,
  placeholder,
  max,
  invalid,
  neutral = false,
  tagImages,
  onTagImageChange,
  imageLabel = "หมวดหมู่",
  stableColors = false,
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [imageTag, setImageTag] = useState("");
  const [imageError, setImageError] = useState("");
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const atMax = typeof max === "number" && values.length >= max;
  useGameinfoUnsavedChanges(Boolean(text.trim()));

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    function updatePos() {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom, left: r.left, width: r.width });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

  function add(v) {
    const t = v.trim();
    if (!t) return;
    if (values.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setText("");
      return;
    }
    if (atMax) return;
    onChange([...values, t]);
    setText("");
    if (onTagImageChange && !(suggestions || []).some((s) => s.toLowerCase() === t.toLowerCase())) {
      setOpen(false);
      setImageTag(t);
    }
  }

  function remove(i) {
    onChange(values.filter((_, idx) => idx !== i));
  }

  const q = text.trim().toLowerCase();
  const filtered = (suggestions || [])
    .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()))
    .filter((s) => s.toLowerCase().includes(q))
    .slice(0, 8);
  const imageFor = (tag) => Object.entries(tagImages || {}).find(
    ([name]) => name.toLocaleLowerCase("th") === tag.toLocaleLowerCase("th")
  )?.[1] || "";

  function editImage(tag) {
    setOpen(false);
    setImageError("");
    setImageTag(tag);
  }

  function saveImage(imageUrl) {
    const tag = imageTag;
    Promise.resolve(onTagImageChange?.(tag, imageUrl)).catch((error) => {
      setImageError(error instanceof Error ? error.message : `บันทึกรูป${imageLabel}ไม่สำเร็จ`);
    });
  }

  return (
    <div className="relative" ref={ref}>
      <div
        className={`flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded border px-2 py-1 focus-within:border-linear-primary/40 focus-within:bg-linear-surface-1 ${
          invalid ? "border-red-500/40" : "border-transparent hover:bg-linear-surface-2"
        }`}
      >
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            style={stableColors ? gameinfoStableColorStyle(v) : undefined}
            className={`inline-flex items-center gap-1 rounded border border-transparent px-2 py-0.5 text-xs ${stableColors ? "gameinfo-stable-tag" : neutral ? "bg-linear-surface-3 text-linear-ink-muted" : "bg-linear-primary/15 text-linear-primary"}`}
          >
            {onTagImageChange ? (
              <button type="button" onClick={() => editImage(v)} className="flex items-center" aria-label={`ใส่รูป ${v}`} title={`ใส่รูป${imageLabel}`}>
                {imageFor(v) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageFor(v)} alt="" className="h-4 w-4 rounded object-cover" />
                ) : <ImageIcon size={12} />}
              </button>
            ) : null}
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              className={stableColors ? "flex items-center opacity-70 hover:opacity-100" : neutral ? "flex items-center text-linear-ink-tertiary hover:text-linear-ink" : "flex items-center text-linear-primary"}
              aria-label="ลบ"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {!atMax && (
          <input
            type="text"
            value={text}
            placeholder={values.length === 0 ? placeholder : ""}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              if (text.trim()) add(text);
            }}
            // Adding a tag keeps the input focused (its onMouseDown calls
            // preventDefault) — a later click to reopen the dropdown
            // wouldn't re-fire onFocus since focus never changed.
            onClick={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add(text);
              } else if (e.key === "Backspace" && !text && values.length) {
                remove(values.length - 1);
              }
            }}
            autoComplete="off"
            className="min-w-[80px] flex-1 border-none py-0.5 text-sm outline-none placeholder:text-linear-ink-tertiary"
          />
        )}
      </div>
      {open &&
        !atMax &&
        filtered.length > 0 &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            style={{ top: pos.top + 4, left: pos.left, width: pos.width }}
            className="fixed z-50 max-h-56 overflow-auto rounded-md border border-linear-hairline bg-linear-surface-1 py-1 shadow-lg"
          >
            {filtered.map((s) => (
              <li key={s} className="flex items-center">
                {onTagImageChange ? (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      editImage(s);
                    }}
                    className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-linear-ink-tertiary hover:bg-linear-surface-2 hover:text-linear-ink"
                    aria-label={`ใส่รูป ${s}`}
                    title={`ใส่รูป${imageLabel}`}
                  >
                    {imageFor(s) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageFor(s)} alt="" className="h-5 w-5 rounded object-cover" />
                    ) : <ImageIcon size={14} />}
                  </button>
                ) : null}
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(s);
                  }}
                  className="block min-w-0 flex-1 px-3 py-1.5 text-left text-sm text-linear-ink hover:bg-linear-primary/10"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
      {imageError ? <p className="mt-1 text-xs text-linear-primary">{imageError}</p> : null}
      {imageTag ? (
        <GameinfoImagePickerModal
          value={imageFor(imageTag)}
          onChange={saveImage}
          onClose={() => setImageTag("")}
        />
      ) : null}
    </div>
  );
}
