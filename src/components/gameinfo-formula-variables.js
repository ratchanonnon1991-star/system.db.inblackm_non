"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Boxes, History, Plus, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { evaluateGameinfoFormulaVariable } from "@/lib/gameinfo-formula-variables";
import { GAMEINFO_FIELD_NAMES } from "@/lib/gameinfo-formula-fields";

function blankVariable() {
  return {
    id: `variable_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`,
    name: "",
    category: "",
    value: "",
    formula: "",
    updatedAt: "",
    updatedBy: "",
  };
}

function dateText(value) {
  if (!value) return "ยังไม่เคยบันทึก";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

function previewValue(variable, variables, values) {
  if (!variable?.name) return { text: "—", error: false };
  try {
    const result = evaluateGameinfoFormulaVariable(
      variables,
      variable.name,
      (name) => values?.[name]
    );
    if (result === undefined || result === null || result === "" || (typeof result === "number" && !Number.isFinite(result))) {
      return { text: "ยังคำนวณไม่ได้", error: true };
    }
    if (typeof result === "number") {
      return { text: result.toLocaleString("th-TH", { maximumFractionDigits: 8 }), error: false };
    }
    return { text: String(result), error: false };
  } catch (error) {
    return { text: error instanceof Error ? error.message : "สูตรไม่ถูกต้อง", error: true };
  }
}

export function GameinfoFormulaVariableSummary({ variables = [], previewValues, previewLabel = "ผลลัพธ์" }) {
  if (!variables.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {variables.map((variable) => {
        const preview = previewValue(variable, variables, previewValues);
        return (
          <div key={variable.id} className="min-w-0 rounded-md border border-linear-hairline bg-linear-surface-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-linear-ink">{variable.name}</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-linear-ink-tertiary">
                  {variable.formula || variable.value || "—"}
                </p>
              </div>
              {variable.category ? (
                <span className="shrink-0 rounded bg-linear-primary/10 px-1.5 py-0.5 text-[10px] text-linear-primary">{variable.category}</span>
              ) : null}
            </div>
            <div className="mt-3 flex items-end justify-between gap-3 border-t border-linear-hairline pt-2">
              <span className="text-[10px] text-linear-ink-tertiary">{previewLabel}</span>
              <strong className={`max-w-[70%] truncate text-sm tabular-nums ${preview.error ? "text-red-400" : "text-linear-primary"}`} title={preview.text}>
                {preview.text}
              </strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function GameinfoFormulaVariablesButton({ gameId, initialVariables, previewValues, endpoint, toolbar, disabled, onSaved }) {
  const [open, setOpen] = useState(false);
  const [variables, setVariables] = useState(initialVariables || []);
  const [baseline, setBaseline] = useState(initialVariables || []);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [loadedPreviewValues, setLoadedPreviewValues] = useState(null);
  const [activeVariableId, setActiveVariableId] = useState("");

  const groups = useMemo(() => {
    const grouped = new Map();
    for (const variable of variables) {
      const key = variable.category || "";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(variable);
    }
    return [...grouped.entries()];
  }, [variables]);

  async function show() {
    if (disabled) return;
    setOpen(true);
    setLoading(true);
    setError("");
    setShowHistory(false);
    try {
      const data = await apiJson(endpoint || `/api/gameinfo/gamelist/${gameId}/variables`, {
        fallbackError: "โหลดตัวแปรผสมไม่สำเร็จ",
      });
      setVariables(data.variables || []);
      setBaseline(data.variables || []);
      setLogs(data.logs || []);
      setLoadedPreviewValues(data.previewValues || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "โหลดตัวแปรผสมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  function requestClose() {
    if (JSON.stringify(variables) !== JSON.stringify(baseline) && !window.confirm("ยังไม่ได้บันทึกตัวแปรผสม ต้องการปิดหรือไม่?")) return;
    setOpen(false);
  }

  function update(id, patch) {
    setVariables((current) => current.map((variable) => variable.id === id ? { ...variable, ...patch } : variable));
  }

  function insertVariableReference(name) {
    const targetId = variables.some((variable) => variable.id === activeVariableId)
      ? activeVariableId
      : variables[0]?.id;
    if (!targetId) return;
    setVariables((current) => current.map((variable) => {
      if (variable.id !== targetId) return variable;
      const separator = variable.formula && !/\s$/.test(variable.formula) ? " " : "";
      return { ...variable, formula: `${variable.formula}${separator}[${name}]` };
    }));
    setActiveVariableId(targetId);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const data = await apiJson(endpoint || `/api/gameinfo/gamelist/${gameId}/variables`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables }),
        fallbackError: "บันทึกตัวแปรผสมไม่สำเร็จ",
      });
      setVariables(data.variables);
      setBaseline(data.variables);
      onSaved?.(data.variables);
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกตัวแปรผสมไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => { event.stopPropagation(); show(); }}
        className={`flex items-center gap-1 border border-linear-hairline-strong text-xs text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-40 ${toolbar ? "h-10 rounded-xl px-3" : "rounded-md px-2 py-1"}`}
      >
        <Boxes size={13} /> ตัวแปรผสม
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1 text-linear-ink shadow-2xl">
            <div className="flex items-center gap-2 border-b border-linear-hairline px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold">ตัวแปรผสมสูตร/ราคา — ใช้ร่วมกันทุกเกม</h2>
                <p className="text-xs text-linear-ink-tertiary">อ้างในสูตร pack ด้วย [ชื่อตัวแปร] · เว้นหมวดหมู่เพื่อวางแบบลอย</p>
              </div>
              <div className="flex-1" />
              <button type="button" onClick={() => setShowHistory((value) => !value)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-linear-ink-muted hover:bg-linear-surface-2">
                <History size={13} /> ประวัติ ({logs.length})
              </button>
              <button type="button" onClick={requestClose} className="text-xs text-linear-ink-tertiary hover:text-linear-ink">ปิด</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {loading ? <p className="py-10 text-center text-sm text-linear-ink-tertiary">กำลังโหลด...</p> : null}
              {!loading && showHistory ? (
                <div className="space-y-2">
                  {logs.length ? logs.map((log) => (
                    <div key={log.id} className="rounded-md border border-linear-hairline p-3 text-xs">
                      <p className="font-medium text-linear-ink">{log.actorName}</p>
                      <p className="text-linear-ink-tertiary">{dateText(log.createdAt)} · {Array.isArray(log.after) ? log.after.length : 0} ตัวแปร</p>
                    </div>
                  )) : <p className="py-8 text-center text-sm text-linear-ink-tertiary">ยังไม่มีประวัติ</p>}
                </div>
              ) : null}
              {!loading && !showHistory ? (
                <div className="space-y-5">
                  <section className="rounded-md border border-linear-hairline bg-linear-surface-2 p-3">
                    <p className="mb-2 text-[11px] text-linear-ink-tertiary">
                      ตัวแปรที่ใช้ได้ (กดเพื่อแทรกในช่องสูตรที่เลือก):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[...new Set([
                        ...GAMEINFO_FIELD_NAMES,
                        ...variables.map((variable) => variable.name).filter(Boolean),
                      ])].map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => insertVariableReference(name)}
                          disabled={!variables.length}
                          className="rounded bg-linear-surface-3 px-2 py-1 text-[11px] text-linear-ink-muted hover:bg-linear-primary/15 hover:text-linear-primary disabled:opacity-40"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                    {variables.length ? (
                      <p className="mt-2 text-[10px] text-linear-ink-tertiary">
                        {activeVariableId
                          ? `จะแทรกลงใน: ${variables.find((variable) => variable.id === activeVariableId)?.name || "ตัวแปรที่เลือก"}`
                          : "คลิกช่องสูตรของตัวแปรที่ต้องการก่อน หรือระบบจะแทรกลงตัวแปรแรก"}
                      </p>
                    ) : null}
                  </section>
                  {groups.map(([category, items]) => (
                    <section key={category || "__floating__"}>
                      <h3 className="mb-2 text-xs font-semibold text-linear-ink-muted">{category || "ไม่อยู่ในหมวดหมู่"}</h3>
                      <div className="grid gap-3 lg:grid-cols-2">
                        {items.map((variable) => (
                          <div key={variable.id} className="rounded-md border border-linear-hairline bg-linear-surface-2 p-3">
                            <div className="mb-2 flex items-start gap-2">
                              <div className="grid flex-1 grid-cols-2 gap-2">
                                <VariableInput label="ชื่อตัวแปร" value={variable.name} placeholder="เช่น ราคาขายสุทธิ" onChange={(name) => update(variable.id, { name })} />
                                <VariableInput label="หมวดหมู่ (ไม่บังคับ)" value={variable.category} placeholder="เช่น ราคา, ต้นทุน" onChange={(categoryValue) => update(variable.id, { category: categoryValue })} />
                              </div>
                              <button type="button" onClick={() => setVariables((current) => current.filter((item) => item.id !== variable.id))} className="mt-5 flex h-8 w-8 items-center justify-center rounded text-red-400 hover:bg-red-500/10" aria-label={`ลบ ${variable.name || "ตัวแปร"}`}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <div className="grid grid-cols-[0.7fr_1.3fr] gap-2">
                              <VariableInput label="ค่าคงที่" value={variable.value} placeholder="เช่น 35.5" onChange={(value) => update(variable.id, { value })} />
                              <VariableInput
                                label="สูตร (ถ้ามีจะใช้แทนค่าคงที่)"
                                value={variable.formula}
                                placeholder="เช่น [ยอดที่กด + fee] * [USDT/THB]"
                                mono
                                active={activeVariableId === variable.id}
                                onFocus={() => setActiveVariableId(variable.id)}
                                onChange={(formula) => update(variable.id, { formula })}
                              />
                            </div>
                            <VariablePreview
                              variable={variable}
                              variables={variables}
                              values={previewValues ?? loadedPreviewValues}
                            />
                            <p className="mt-2 text-[10px] text-linear-ink-tertiary">แก้ล่าสุด: {dateText(variable.updatedAt)}{variable.updatedBy ? ` โดย ${variable.updatedBy}` : ""}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                  {variables.length === 0 ? <p className="rounded-md border border-dashed border-linear-hairline-strong p-8 text-center text-sm text-linear-ink-tertiary">ยังไม่มีตัวแปรผสม</p> : null}
                </div>
              ) : null}
              {error ? <p role="alert" className="mt-3 text-xs text-red-400">{error}</p> : null}
            </div>
            {!loading && !showHistory ? (
              <div className="flex items-center gap-2 border-t border-linear-hairline px-5 py-3">
                <button type="button" onClick={() => setVariables((current) => [...current, blankVariable()])} disabled={variables.length >= 100} className="flex items-center gap-1 rounded-md border border-linear-hairline-strong px-3 py-1.5 text-xs text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-40">
                  <Plus size={13} /> เพิ่มตัวแปร
                </button>
                <div className="flex-1" />
                <button type="button" onClick={requestClose} disabled={saving} className="px-3 py-1.5 text-xs text-linear-ink-muted">ยกเลิก</button>
                <button type="button" onClick={save} disabled={saving} className="rounded-md bg-linear-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function VariablePreview({ variable, variables, values }) {
  const preview = previewValue(variable, variables, values);
  return (
    <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-md border border-linear-hairline bg-linear-surface-1 px-2.5 py-1.5">
      <span className="text-[10px] text-linear-ink-tertiary">ผลลัพธ์</span>
      <strong className={`truncate text-sm tabular-nums ${preview.error ? "text-red-400" : "text-linear-primary"}`} title={preview.text}>
        {preview.text}
      </strong>
    </div>
  );
}

function VariableInput({ label, value, onChange, onFocus, placeholder, mono, active }) {
  return (
    <label className="min-w-0 text-[10px] text-linear-ink-tertiary">
      <span className="mb-1 block truncate">{label}</span>
      <input
        value={value}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`h-9 w-full rounded-md border bg-linear-surface-1 px-2 text-sm text-linear-ink outline-none placeholder:text-linear-ink-tertiary focus:border-linear-primary ${active ? "border-linear-primary ring-1 ring-linear-primary/30" : "border-linear-hairline-strong"} ${mono ? "font-mono text-xs" : ""}`}
      />
    </label>
  );
}
