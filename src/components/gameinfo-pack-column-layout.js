"use client";

import { useEffect, useMemo, useState } from "react";
import { Columns3, RotateCcw, X } from "lucide-react";
import {
  gameinfoPackLayoutStorageKey,
  normalizeGameinfoPackLayout,
  orderGameinfoPackColumns,
  reorderGameinfoPackColumns,
} from "@/lib/gameinfo-pack-columns";

export function useGameinfoPackColumnLayout({
  columns,
  userId,
  gameId,
  surface,
  lockRequired = false,
}) {
  const storageKey = gameinfoPackLayoutStorageKey({ userId, gameId, surface });
  const columnSignature = columns.map((column) => column.id).join("|");
  const [layout, setLayout] = useState(() => normalizeGameinfoPackLayout(null, columns));
  const [loadedKey, setLoadedKey] = useState("");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      let raw = null;
      try {
        raw = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      } catch {
        raw = null;
      }
      const normalized = normalizeGameinfoPackLayout(raw, columns);
      setLayout({
        ...normalized,
        hidden: lockRequired
          ? normalized.hidden.filter(
              (id) => !columns.find((column) => column.id === id)?.required
            )
          : normalized.hidden,
      });
      setLoadedKey(storageKey);
    });
    return () => {
      cancelled = true;
    };
    // columnSignature intentionally retriggers normalization when a shared
    // computed column is added or removed.
  }, [storageKey, columnSignature, lockRequired]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify(layout));
  }, [layout, loadedKey, storageKey]);

  const orderedColumns = useMemo(
    () => orderGameinfoPackColumns(columns, normalizeGameinfoPackLayout(layout, columns)),
    [columns, layout]
  );
  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => !layout.hidden.includes(column.id)),
    [orderedColumns, layout.hidden]
  );

  function setVisible(columnId, visible) {
    setLayout((current) => {
      if (lockRequired && columns.find((column) => column.id === columnId)?.required) {
        return current;
      }
      const hidden = new Set(current.hidden);
      if (visible) hidden.delete(columnId);
      else hidden.add(columnId);
      return { ...current, hidden: [...hidden] };
    });
  }

  function reorder(activeId, overId) {
    setLayout((current) => reorderGameinfoPackColumns(current, activeId, overId));
  }

  function reset() {
    setLayout(normalizeGameinfoPackLayout(null, columns));
  }

  return { layout, orderedColumns, visibleColumns, setVisible, reorder, reset };
}

export function GameinfoPackColumnControls({
  columns,
  hidden,
  onSetVisible,
  onReset,
  lockRequired = false,
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-md border border-linear-hairline-strong px-3 py-1.5 text-xs text-linear-ink-muted hover:bg-linear-surface-2"
      >
        <Columns3 size={14} /> คอลัมน์
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-linear-hairline bg-linear-surface-1 p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-linear-ink">คอลัมน์ที่แสดง</p>
              <p className="text-[10px] text-linear-ink-tertiary">การตั้งค่านี้จำเฉพาะหน้าจอของคุณ</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="ปิดการตั้งค่าคอลัมน์"
              className="rounded p-1 text-linear-ink-tertiary hover:bg-linear-surface-3"
            >
              <X size={14} />
            </button>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {columns.map((column) => {
              const locked = lockRequired && column.required;
              const checked = locked || !hidden.includes(column.id);
              return (
                <label
                  key={column.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-linear-ink-muted hover:bg-linear-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={(event) => onSetVisible(column.id, event.target.checked)}
                    className="accent-linear-primary"
                  />
                  <span className="min-w-0 flex-1 truncate">{column.label}</span>
                  {locked ? <span className="text-[10px] text-linear-ink-tertiary">จำเป็น</span> : null}
                </label>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onReset}
            className="mt-2 inline-flex items-center gap-1 text-xs text-linear-primary hover:underline"
          >
            <RotateCcw size={12} /> คืนค่าเริ่มต้น
          </button>
        </div>
      )}
    </div>
  );
}
