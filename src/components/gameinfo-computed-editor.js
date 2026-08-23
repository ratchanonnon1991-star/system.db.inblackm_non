"use client";

import { useMemo, useState } from "react";
import { Calculator, Plus, X } from "lucide-react";
import {
  evaluateFormula,
  extractFormulaRefs,
  inferFormulaType,
  parseFormula,
} from "@/lib/gamedb-formula";
import { GAMEINFO_FIELD_NAMES } from "@/lib/gameinfo-formula-fields";
import { GAMEINFO_FORMULA_FUNCTION_HELP } from "@/lib/gameinfo-formula-help";
import { formatGameinfoPackColumnValue, GAMEINFO_PACK_SYMBOLS } from "@/lib/gameinfo-pack-columns";
import { validateGameinfoComputedDependencies } from "@/lib/gameinfo-computed-evaluator";
import { useGameinfoDialog } from "@/lib/use-gameinfo-dialog";

// Same parser, validation and function library as the systemdb-side formula
// editor (gamedb-modals.js's ComputedColumnModal) — this one is a full
// rebuild rather than a themed wrapper around it, so gameinfo's popups (dark
// linear-* surfaces, hairline borders, lavender accent) stay one consistent
// design system instead of dropping into the light zinc form the rest of
// systemdb still uses. Scoped to gameinfo's fixed pack/game field list
// (GAMEINFO_FIELD_NAMES) instead of arbitrary query columns — that fixed
// list is what makes this "simpler" than the systemdb editor, not a forked
// engine underneath.
const TYPE_LABELS = {
  number: "ตัวเลข",
  text: "ข้อความ",
  date: "วันที่",
  boolean: "ใช่ / ไม่ใช่",
};

const EMPTY_FIELD_NAMES = [];

export default function GameinfoComputedEditor({
  sampleRow,
  otherColumns = [],
  onAdd,
  onSave,
  onClose,
  initialColumn = null,
  extraFieldNames = EMPTY_FIELD_NAMES,
}) {
  const editingMainFormula = Boolean(initialColumn);
  const [label, setLabel] = useState(initialColumn?.label || "");
  const [formula, setFormula] = useState(initialColumn?.formula || "");
  // Empty until touched, so the type follows the formula while the user is
  // still writing it and stops the moment they choose one themselves.
  const [typeChoice, setTypeChoice] = useState(initialColumn?.type || "");
  const [symbol, setSymbol] = useState(initialColumn?.symbol || "");
  const [resetOverrides, setResetOverrides] = useState(false);
  const { dialogRef, titleId, onBackdropMouseDown } = useGameinfoDialog({ onRequestClose: onClose });

  const validation = useMemo(() => {
    if (!formula.trim()) return { ok: false, message: "", type: "number" };
    try {
      const ast = parseFormula(formula);
      const refs = [...extractFormulaRefs(ast)];
      const availableNames = [...GAMEINFO_FIELD_NAMES, ...extraFieldNames, ...otherColumns.map((column) => column.label)];
      const unknown = refs.filter((name) => !availableNames.includes(name) && name !== label.trim());
      if (unknown.length > 0) {
        return { ok: false, message: `ไม่รู้จักคอลัมน์: ${unknown.join(", ")}`, type: "number" };
      }
      const candidate = {
        key: initialColumn?.key || "__draft__",
        label: label.trim() || "__draft__",
        formula: formula.trim(),
      };
      const dependencyErrors = validateGameinfoComputedDependencies([
        ...otherColumns.filter((column) => column.key !== candidate.key),
        candidate,
      ], extraFieldNames);
      if (dependencyErrors.length) {
        return { ok: false, message: dependencyErrors[0], type: "number" };
      }
      const type = inferFormulaType(ast);
      let preview = "";
      if (sampleRow) {
        const value = evaluateFormula(ast, (name) => sampleRow[name]);
        preview = ` · แถวแรกได้ ${formatGameinfoPackColumnValue(value, {
          type: typeChoice || type,
          symbol: (typeChoice || type) === "number" ? symbol : "",
        })}`;
      }
      return { ok: true, message: `สูตรถูกต้อง${preview}`, type };
    } catch (err) {
      return { ok: false, message: err.message, type: "number" };
    }
  }, [extraFieldNames, formula, initialColumn, label, otherColumns, sampleRow, symbol, typeChoice]);

  const type = typeChoice || validation.type;
  const missing = [
    !label.trim() && "ชื่อคอลัมน์",
    !formula.trim() && "สูตร",
    formula.trim() && !validation.ok && "สูตรที่ถูกต้อง (ดูข้อความใต้ช่องสูตร)",
  ].filter(Boolean);

  function submit() {
    if (!label.trim() || !validation.ok) return;
    const nextColumn = {
      key: initialColumn?.key || `col_${Date.now()}`,
      label: label.trim(),
      formula: formula.trim(),
      type,
      symbol: type === "number" ? symbol : "",
    };
    if (editingMainFormula) onSave?.(nextColumn, { resetOverrides });
    else onAdd(nextColumn);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={onBackdropMouseDown}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-linear-hairline px-5 py-3">
          <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold text-linear-ink">
            <Calculator size={15} className="text-linear-primary" /> {editingMainFormula ? "แก้ไขสูตรหลัก" : "เพิ่มคอลัมน์/สูตร"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-linear-ink-tertiary hover:bg-linear-surface-2 hover:text-linear-ink"
            aria-label="ปิด"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-xs text-linear-ink-tertiary">ชื่อคอลัมน์</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="เช่น กำไร"
              className="h-9 w-full rounded border border-linear-hairline-strong bg-linear-surface-2 px-2 text-sm text-linear-ink outline-none focus:border-linear-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-linear-ink-tertiary">
              สูตร — ใช้ + - * / ( ) เทียบด้วย = &lt;&gt; &lt; &gt; ใส่ข้อความในเครื่องหมายคำพูด
              และอ้างคอลัมน์ด้วย [ชื่อคอลัมน์]
            </label>
            <input
              type="text"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder={'เช่น IF(DAYSUNTIL([วันหมดอายุ]) < 3, "ใกล้หมดอายุ", "ปกติ")'}
              className="h-9 w-full rounded border border-linear-hairline-strong bg-linear-surface-2 px-2 font-mono text-xs text-linear-ink outline-none focus:border-linear-primary"
            />
            {formula.trim() && (
              <p className={`mt-1 text-xs ${validation.ok ? "text-linear-success" : "text-linear-danger"}`}>
                {validation.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="gameinfo-computed-type" className="mb-1 block text-xs text-linear-ink-tertiary">
              ผลลัพธ์เป็น {typeChoice ? "(เลือกเอง)" : "(เดาจากสูตร)"}
            </label>
            <select
              id="gameinfo-computed-type"
              value={type}
              onChange={(e) => setTypeChoice(e.target.value)}
              className="h-9 w-full rounded border border-linear-hairline-strong bg-linear-surface-2 px-2 text-sm text-linear-ink outline-none focus:border-linear-primary"
            >
              {Object.entries(TYPE_LABELS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </div>

          {editingMainFormula && Object.keys(initialColumn?.rowOverrides || {}).length > 0 ? (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <input
                type="checkbox"
                checked={resetOverrides}
                onChange={(event) => setResetOverrides(event.target.checked)}
                className="mt-0.5 accent-linear-primary"
              />
              <span>
                ใช้สูตรหลักนี้กับทุก pack และล้างสูตรเฉพาะแถวทั้งหมด ({Object.keys(initialColumn.rowOverrides).length} แถว)
              </span>
            </label>
          ) : null}

          <div>
            <label htmlFor="gameinfo-computed-symbol" className="mb-1 block text-xs text-linear-ink-tertiary">
              สัญลักษณ์ที่แสดง
            </label>
            <input
              id="gameinfo-computed-symbol"
              type="text"
              value={type === "number" ? symbol : ""}
              disabled={type !== "number"}
              onChange={(e) => setSymbol(e.target.value)}
              maxLength={24}
              list="gameinfo-computed-symbol-suggestions"
              placeholder="เช่น ฿, %, USD, Coins"
              className="h-9 w-full rounded border border-linear-hairline-strong bg-linear-surface-2 px-2 text-sm text-linear-ink outline-none focus:border-linear-primary disabled:opacity-50"
            />
            <datalist id="gameinfo-computed-symbol-suggestions">
              {GAMEINFO_PACK_SYMBOLS.map((value) => (
                value ? <option key={value} value={value} /> : null
              ))}
            </datalist>
            <p className="mt-1 text-[11px] text-linear-ink-tertiary">
              พิมพ์สัญลักษณ์หรือข้อความเองได้ สูงสุด 24 ตัวอักษร และจะบันทึกพร้อมคอลัมน์
            </p>
          </div>

          <div className="rounded-md border border-linear-hairline bg-linear-surface-2 p-3">
            <p className="mb-1.5 text-xs font-medium text-linear-ink-muted">ฟังก์ชันที่ใช้ได้</p>
            <dl className="space-y-1">
              {GAMEINFO_FORMULA_FUNCTION_HELP.map(([group, list]) => (
                <div key={group} className="flex gap-2 text-xs leading-relaxed">
                  <dt className="w-12 shrink-0 text-linear-ink-tertiary">{group}</dt>
                  <dd className="min-w-0 font-mono text-linear-ink-subtle">{list}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <p className="mb-1.5 text-xs text-linear-ink-tertiary">คอลัมน์ที่ใช้ได้ (กดเพื่อแทรก):</p>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...GAMEINFO_FIELD_NAMES, ...extraFieldNames, ...otherColumns.map((column) => column.label)])].map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setFormula((prev) => `${prev}[${name}]`)}
                  className="rounded bg-linear-surface-3 px-2 py-1 text-xs text-linear-ink-muted hover:bg-linear-surface-4"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {missing.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              ยังบันทึกไม่ได้ — ต้องกรอก: {missing.join(" · ")}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-linear-hairline px-5 py-3">
          <button
            type="button"
            onClick={submit}
            disabled={!label.trim() || !validation.ok}
            className="flex items-center gap-1.5 rounded-md bg-linear-primary px-4 py-2 text-sm font-medium text-white hover:bg-linear-primary-hover disabled:opacity-50"
          >
            <Plus size={14} /> {editingMainFormula ? "บันทึกสูตรหลัก" : "เพิ่มคอลัมน์"}
          </button>
        </div>
      </div>
    </div>
  );
}
