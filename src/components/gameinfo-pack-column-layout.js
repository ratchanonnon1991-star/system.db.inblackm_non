"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Columns3, Copy, LoaderCircle, Lock, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { requestGameinfoDiscard } from "@/lib/gameinfo-unsaved-changes";
import {
  gameinfoPackLayoutStorageKey,
  normalizeGameinfoPackLayout,
  orderGameinfoPackColumns,
  reorderGameinfoPackColumns,
} from "@/lib/gameinfo-pack-columns";

function normalizeLayoutForScreen(layout, columns, lockRequired) {
  const normalized = normalizeGameinfoPackLayout(layout, columns);
  if (!lockRequired) return normalized;
  return {
    ...normalized,
    hidden: normalized.hidden.filter(
      (id) => !columns.find((column) => column.id === id)?.required
    ),
  };
}

function sameLayout(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// `localStorage` was the pre-Task-15 home for this setting. It is now read
// only as a migration draft when a user has not saved any DB preset yet; no
// column drag/toggle writes there any more.
function readLegacyLayout(storageKey) {
  try {
    const raw = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    if (!raw || (!Array.isArray(raw.order) && !Array.isArray(raw.hidden))) return null;
    return raw;
  } catch {
    return null;
  }
}

export function useGameinfoPackColumnLayout({
  columns,
  userId,
  gameId,
  surface,
  lockRequired = false,
}) {
  const storageKey = gameinfoPackLayoutStorageKey({ userId, gameId, surface });
  const presetsUrl = `/api/gameinfo/gamelist/${gameId}/packs/presets?surface=${encodeURIComponent(surface)}`;
  const [layout, setLayout] = useState(null);
  const [baselineLayout, setBaselineLayout] = useState(null);
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [baselineName, setBaselineName] = useState("");
  const [legacyDraft, setLegacyDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const normalizedLayout = useMemo(
    () => normalizeLayoutForScreen(layout, columns, lockRequired),
    [layout, columns, lockRequired]
  );
  const normalizedBaseline = useMemo(
    () => normalizeLayoutForScreen(baselineLayout, columns, lockRequired),
    [baselineLayout, columns, lockRequired]
  );
  const dirty =
    presetName !== baselineName ||
    !sameLayout(normalizedLayout, normalizedBaseline);
  const selectedPreset = presets.find((preset) => String(preset.id) === selectedPresetId) || null;
  const presetLocked = surface === "view" && Boolean(selectedPreset?.locked);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const legacy = readLegacyLayout(storageKey);
      setLayout(legacy);
      setBaselineLayout(legacy);
      setPresets([]);
      setSelectedPresetId("");
      setPresetName("");
      setBaselineName("");
      setLegacyDraft(Boolean(legacy));
      setLoading(true);
      setError("");
      setNotice("");

      async function loadPresets() {
        try {
          const data = await apiJson(presetsUrl, {
            fallbackError: "โหลด preset การแสดงคอลัมน์ไม่สำเร็จ",
          });
          if (cancelled) return;
          const nextPresets = Array.isArray(data?.presets) ? data.presets : [];
          const selected = nextPresets[0] || null;
          setPresets(nextPresets);
          if (selected) {
            setLayout(selected.layout);
            setBaselineLayout(selected.layout);
            setSelectedPresetId(String(selected.id));
            setPresetName(selected.name || "");
            setBaselineName(selected.name || "");
            setLegacyDraft(false);
          }
        } catch (loadError) {
          if (!cancelled) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : "โหลด preset การแสดงคอลัมน์ไม่สำเร็จ"
            );
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      }

      void loadPresets();
    });
    return () => {
      cancelled = true;
    };
  }, [presetsUrl, storageKey]);

  const orderedColumns = useMemo(
    () => orderGameinfoPackColumns(columns, normalizedLayout),
    [columns, normalizedLayout]
  );
  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => !normalizedLayout.hidden.includes(column.id)),
    [orderedColumns, normalizedLayout.hidden]
  );

  function setVisible(columnId, visible) {
    if (loading || saving) return;
    setLayout((current) => {
      const next = normalizeLayoutForScreen(current, columns, lockRequired);
      if (lockRequired && columns.find((column) => column.id === columnId)?.required) return next;
      const hidden = new Set(next.hidden);
      if (visible) hidden.delete(columnId);
      else hidden.add(columnId);
      return { ...next, hidden: [...hidden] };
    });
    setNotice("");
  }

  function reorder(activeId, overId) {
    if (loading || saving) return;
    setLayout((current) =>
      reorderGameinfoPackColumns(
        normalizeLayoutForScreen(current, columns, lockRequired),
        activeId,
        overId
      )
    );
    setNotice("");
  }

  function setFilters(filters) {
    if (loading || saving) return;
    setLayout((current) => ({
      ...normalizeLayoutForScreen(current, columns, lockRequired),
      filters,
    }));
    setNotice("");
  }

  function reset() {
    if (loading || saving) return;
    setLayout(normalizeLayoutForScreen(null, columns, lockRequired));
    setNotice("");
  }

  function selectPreset(presetId) {
    const selected = presets.find((preset) => String(preset.id) === String(presetId));
    if (!selected || String(selected.id) === selectedPresetId) return;
    const applySelectedPreset = () => {
      setLayout(selected.layout);
      setBaselineLayout(selected.layout);
      setSelectedPresetId(String(selected.id));
      setPresetName(selected.name || "");
      setBaselineName(selected.name || "");
      setLegacyDraft(false);
      setError("");
      setNotice("");
    };
    if (dirty) {
      requestGameinfoDiscard({
        title: "เปลี่ยน preset?",
        message: "การตั้งค่าคอลัมน์ที่ยังไม่บันทึกจะหายไป",
        confirmLabel: "เปลี่ยน preset",
        onConfirm: applySelectedPreset,
      });
      return;
    }
    applySelectedPreset();
  }

  async function savePreset({ asNew = false } = {}) {
    if (saving) return false;
    const name = presetName.trim().replace(/\s+/g, " ");
    if (!name) {
      setError("กรุณาตั้งชื่อ preset ก่อนบันทึก");
      return false;
    }
    if (!asNew && presetLocked) {
      setError("preset นี้ถูกล็อกจากหน้าแก้ไข — ตั้งชื่อใหม่เพื่อเก็บเป็นของคุณเอง");
      return false;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await apiJson(presetsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId: asNew || !selectedPresetId ? null : Number(selectedPresetId),
          name,
          layout: normalizedLayout,
        }),
        fallbackError: "บันทึก preset การแสดงคอลัมน์ไม่สำเร็จ",
      });
      const saved = data?.preset;
      if (!saved?.id) throw new Error("เซิร์ฟเวอร์ไม่ได้ส่ง preset ที่บันทึกแล้วกลับมา");
      setPresets((current) => [
        saved,
        ...current.filter((preset) => String(preset.id) !== String(saved.id)),
      ]);
      setLayout(saved.layout);
      setBaselineLayout(saved.layout);
      setSelectedPresetId(String(saved.id));
      setPresetName(saved.name || name);
      setBaselineName(saved.name || name);
      setLegacyDraft(false);
      setNotice(asNew ? "สร้าง preset ใหม่แล้ว" : "บันทึก preset แล้ว");
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "บันทึก preset การแสดงคอลัมน์ไม่สำเร็จ"
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  return {
    layout: normalizedLayout,
    orderedColumns,
    visibleColumns,
    presets,
    selectedPresetId,
    presetName,
    dirty,
    loading,
    saving,
    error,
    notice,
    legacyDraft,
    presetLocked,
    surface,
    setVisible,
    setFilters,
    reorder,
    reset,
    selectPreset,
    setPresetName: (nextName) => {
      setPresetName(nextName);
      setNotice("");
    },
    savePreset,
  };
}

export function GameinfoPackColumnControls({
  columns,
  hidden,
  filters = [],
  presets,
  selectedPresetId,
  presetName,
  dirty,
  loading,
  saving,
  error,
  notice,
  legacyDraft,
  onSetVisible,
  onFiltersChange,
  onReset,
  onSelectPreset,
  onPresetNameChange,
  onSavePreset,
  lockRequired = false,
  presetLocked = false,
}) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const triggerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [managing, setManaging] = useState(false);
  const selectedPreset =
    presets.find((preset) => String(preset.id) === String(selectedPresetId)) || null;
  const trimmedName = presetName.trim().replace(/\s+/g, " ");
  const nameMatch = presets.find((preset) => preset.name === trimmedName) || null;
  const nameIsSelected = nameMatch != null && String(nameMatch.id) === String(selectedPresetId);
  const action = (() => {
    if (!trimmedName) return { label: "สร้าง", disabled: true };
    if (!nameMatch) return { label: "สร้าง", asNew: true, disabled: loading || saving };
    if (nameIsSelected) {
      return {
        label: "บันทึก",
        asNew: false,
        disabled: loading || saving || presetLocked || !dirty,
        hint: presetLocked
          ? "preset นี้ถูกล็อกจากหน้าแก้ไข — ตั้งชื่อใหม่เพื่อเก็บเป็นของคุณเอง"
          : dirty
            ? ""
            : "ยังไม่มีการเปลี่ยนแปลงให้บันทึก",
      };
    }
    return { label: "บันทึก", disabled: true, hint: "มีชื่อนี้อยู่แล้ว — ตั้งชื่ออื่น" };
  })();

  function openManage(nextName) {
    onPresetNameChange(nextName);
    setManaging(true);
  }

  function closeManage() {
    setManaging(false);
    onPresetNameChange(selectedPreset?.name || "");
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={popoverId}
        className="inline-flex items-center gap-1.5 rounded-md border border-linear-hairline-strong px-3 py-1.5 text-xs text-linear-ink-muted hover:bg-linear-surface-2"
      >
        <Columns3 size={14} /> คอลัมน์/ตัวกรอง{dirty ? <span className="text-linear-primary">•</span> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          positionMethod="fixed"
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
          className="isolate z-50"
        >
        <Popover.Popup
          id={popoverId}
          initialFocus={closeButtonRef}
          finalFocus={triggerRef}
          className="max-h-[calc(100dvh-1rem)] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-linear-hairline bg-linear-surface-1 p-3 outline-none"
          style={{ boxShadow: "var(--ll-shadow-modal)" }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <Popover.Title className="text-sm font-medium text-linear-ink">preset การแสดงคอลัมน์</Popover.Title>
              <p className="text-[10px] text-linear-ink-tertiary">
                เก็บคอลัมน์ที่แสดงและลำดับตำแหน่ง · ใช้ร่วมกันทั้งหน้าแก้ไขและหน้าดู
              </p>
            </div>
            <Popover.Close
              ref={closeButtonRef}
              type="button"
              aria-label="ปิดการตั้งค่าคอลัมน์"
              className="rounded p-1 text-linear-ink-tertiary hover:bg-linear-surface-3"
            >
              <X size={14} />
            </Popover.Close>
          </div>

          <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-linear-ink-tertiary">
            preset ที่บันทึกไว้
            <div className="mt-1 flex items-center gap-1.5">
              <select
                value={selectedPresetId}
                disabled={loading || saving || presets.length === 0}
                onChange={(event) => onSelectPreset(event.target.value)}
                aria-label="preset ที่บันทึกไว้"
                className="min-w-0 flex-1 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-linear-ink outline-none focus:border-linear-primary"
              >
                {presets.length === 0 ? (
                  <option value="">ยังไม่มี preset ที่บันทึกไว้</option>
                ) : (
                  presets.map((preset) => (
                    <option key={preset.id} value={String(preset.id)}>
                      {preset.name}{preset.locked ? " (อ่านอย่างเดียว)" : ""}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={() => openManage(selectedPreset?.name || "")}
                disabled={loading || saving || !selectedPresetId}
                title="เปลี่ยนชื่อหรือบันทึกทับ preset นี้"
                aria-label="แก้ไข preset ที่เลือก"
                className="shrink-0 rounded-md border border-linear-hairline-strong p-1.5 text-linear-ink-tertiary hover:bg-linear-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => openManage("")}
                disabled={loading || saving}
                title="สร้าง preset ใหม่จากการตั้งค่าปัจจุบัน"
                aria-label="สร้าง preset ใหม่"
                className="shrink-0 rounded-md border border-linear-hairline-strong p-1.5 text-linear-ink-tertiary hover:bg-linear-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          {presetLocked && !managing ? (
            <p className="mb-3 flex items-start gap-1.5 rounded-md border border-linear-hairline bg-linear-surface-2 px-2 py-1.5 text-[10px] text-linear-ink-tertiary">
              <Lock size={11} className="mt-px shrink-0" />
              <span>preset นี้มาจากหน้าแก้ไข จึงใช้ได้แต่บันทึกทับจากหน้านี้ไม่ได้ กด + เพื่อสร้างสำเนา</span>
            </p>
          ) : null}

          {managing ? (
            <div className="mb-3 rounded-md border border-linear-hairline bg-linear-surface-2 p-2">
              <label className="block text-[10px] font-medium uppercase tracking-wide text-linear-ink-tertiary">
                ชื่อ preset
                <input
                  value={presetName}
                  maxLength={80}
                  autoFocus
                  disabled={loading || saving}
                  onChange={(event) => onPresetNameChange(event.target.value)}
                  placeholder="เช่น เฉพาะราคา"
                  className="mt-1 block w-full rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-linear-ink outline-none placeholder:text-linear-ink-tertiary focus:border-linear-primary"
                />
              </label>
              {action.hint ? <p className="mt-1.5 text-[10px] text-linear-ink-tertiary">{action.hint}</p> : null}
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeManage}
                  disabled={saving}
                  className="rounded-md px-2.5 py-1.5 text-xs text-linear-ink-tertiary hover:bg-linear-surface-3 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const saved = await onSavePreset({ asNew: Boolean(action.asNew) });
                    if (saved) setManaging(false);
                  }}
                  disabled={action.disabled}
                  className="inline-flex items-center gap-1 rounded-md bg-linear-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-linear-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <LoaderCircle size={12} className="animate-spin" /> : action.asNew ? <Copy size={12} /> : <Save size={12} />}
                  {action.label}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-linear-ink">คอลัมน์ที่แสดง</p>
            <button
              type="button"
              onClick={onReset}
              disabled={loading || saving}
              className="inline-flex items-center gap-1 text-xs text-linear-primary hover:underline disabled:opacity-50"
            >
              <RotateCcw size={12} /> คืนค่าเริ่มต้น
            </button>
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto">
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
                    disabled={locked || loading || saving}
                    onChange={(event) => onSetVisible(column.id, event.target.checked)}
                    className="accent-linear-primary"
                  />
                  <span className="min-w-0 flex-1 truncate">{column.label}</span>
                  {locked ? <span className="text-[10px] text-linear-ink-tertiary">จำเป็น</span> : null}
                </label>
              );
            })}
          </div>

          <div className="mt-3 border-t border-linear-hairline pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-linear-ink">ตัวกรองแถว (ตรงทุกเงื่อนไข)</p>
              <button
                type="button"
                disabled={loading || saving || filters.length >= 10 || columns.length === 0}
                onClick={() => onFiltersChange([
                  ...filters,
                  { columnId: columns[0]?.id || "", operator: "contains", value: "" },
                ])}
                className="inline-flex items-center gap-1 text-xs text-linear-primary hover:underline disabled:opacity-50"
              >
                <Plus size={12} /> เพิ่ม
              </button>
            </div>
            {filters.length === 0 ? (
              <p className="text-[10px] text-linear-ink-tertiary">ยังไม่กรอง — แสดงทุก pack</p>
            ) : (
              <div className="space-y-2">
                {filters.map((filter, index) => (
                  <div key={`${filter.columnId}:${index}`} className="grid grid-cols-[1fr_88px_auto] gap-1">
                    <select
                      value={filter.columnId}
                      onChange={(event) => onFiltersChange(filters.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, columnId: event.target.value } : item
                      ))}
                      className="min-w-0 rounded border border-linear-hairline-strong bg-linear-surface-2 px-1.5 py-1 text-[10px] text-linear-ink"
                    >
                      {columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}
                    </select>
                    <select
                      value={filter.operator}
                      onChange={(event) => onFiltersChange(filters.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, operator: event.target.value } : item
                      ))}
                      className="rounded border border-linear-hairline-strong bg-linear-surface-2 px-1 py-1 text-[10px] text-linear-ink"
                    >
                      <option value="contains">มีคำว่า</option>
                      <option value="equals">เท่ากับ</option>
                      <option value="not_empty">มีข้อมูล</option>
                      <option value="empty">ว่าง</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => onFiltersChange(filters.filter((_, itemIndex) => itemIndex !== index))}
                      className="rounded p-1 text-linear-danger hover:bg-linear-danger-bg"
                      aria-label="ลบตัวกรอง"
                    ><Trash2 size={12} /></button>
                    {filter.operator === "contains" || filter.operator === "equals" ? (
                      <input
                        value={filter.value}
                        onChange={(event) => onFiltersChange(filters.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, value: event.target.value } : item
                        ))}
                        placeholder="ค่าที่ต้องการกรอง"
                        className="col-span-3 rounded border border-linear-hairline-strong bg-linear-surface-2 px-2 py-1 text-[10px] text-linear-ink outline-none focus:border-linear-primary"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="mt-3 text-[10px] text-linear-ink-tertiary">
            ลากหัวตารางเพื่อเรียงคอลัมน์ แล้วกดบันทึกเพื่อใช้กับทุกตารางในหน้านี้
          </p>
          {legacyDraft ? (
            <p className="mt-1 text-[10px] text-linear-primary">
              พบการตั้งค่าเดิมจากเครื่องนี้ — ตั้งชื่อแล้วบันทึกเพื่อย้ายเข้า preset
            </p>
          ) : null}
          {dirty && !legacyDraft ? (
            <p className="mt-1 text-[10px] text-linear-primary">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-linear-danger">{error}</p> : null}
          {notice ? <p className="mt-2 text-xs text-linear-success">{notice}</p> : null}

          {dirty && !managing ? (
            <div className="mt-3 flex justify-end border-t border-linear-hairline pt-3">
              <button
                type="button"
                onClick={() => openManage(selectedPreset?.name || "")}
                disabled={loading || saving}
                className="inline-flex items-center gap-1 rounded-md bg-linear-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-linear-primary-hover disabled:opacity-50"
              >
                <Save size={12} /> บันทึก preset
              </button>
            </div>
          ) : null}
        </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
