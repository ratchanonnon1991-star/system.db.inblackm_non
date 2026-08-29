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
import GameinfoFormulaHelpPanel from "@/components/gameinfo-formula-help-panel";
import { formatGameinfoPackColumnValue, GAMEINFO_PACK_SYMBOLS } from "@/lib/gameinfo-pack-columns";
import { validateGameinfoComputedDependencies } from "@/lib/gameinfo-computed-evaluator";
import {
  requestGameinfoDiscard,
  useGameinfoUnsavedChanges,
} from "@/lib/gameinfo-unsaved-changes";
import GameinfoFormulaMemory from "./gameinfo-formula-memory";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
  const [scopeMode, setScopeMode] = useState(
    initialColumn?.scopeMode === "category" ? "category" : "global"
  );
  const [resetOverrides, setResetOverrides] = useState(false);
  const dirty =
    label.trim() !== String(initialColumn?.label || "").trim() ||
    formula.trim() !== String(initialColumn?.formula || "").trim() ||
    typeChoice !== (initialColumn?.type || "") ||
    symbol !== (initialColumn?.symbol || "") ||
    scopeMode !== (initialColumn?.scopeMode === "category" ? "category" : "global") ||
    resetOverrides;
  useGameinfoUnsavedChanges(dirty);

  function requestClose() {
    if (dirty) {
      requestGameinfoDiscard({
        message: "สูตรที่ยังไม่บันทึกจะหายไป",
        confirmLabel: "ปิดโดยไม่บันทึก",
        onConfirm: onClose,
      });
      return;
    }
    onClose();
  }

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
      scopeMode,
    };
    if (editingMainFormula) onSave?.(nextColumn, { resetOverrides });
    else onAdd(nextColumn);
  }

  function applyMemoryPreset(preset) {
    try {
      const ast = parseFormula(preset.formula);
      const refs = [...extractFormulaRefs(ast)];
      const availableNames = [
        ...GAMEINFO_FIELD_NAMES,
        ...extraFieldNames,
        ...otherColumns.map((column) => column.label),
      ];
      const unknown = refs.filter(
        (name) => !availableNames.includes(name) && name !== label.trim()
      );
      if (unknown.length) return `เกมนี้ไม่มีคอลัมน์: ${unknown.join(", ")}`;
      const candidate = {
        key: initialColumn?.key || "__draft__",
        label: label.trim() || "__draft__",
        formula: preset.formula,
      };
      const dependencyErrors = validateGameinfoComputedDependencies(
        [...otherColumns.filter((column) => column.key !== candidate.key), candidate],
        extraFieldNames
      );
      if (dependencyErrors.length) return dependencyErrors[0];
      setFormula(preset.formula);
      setTypeChoice(preset.type || "number");
      setSymbol(preset.type === "number" ? preset.symbol || "" : "");
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "สูตรไม่ถูกต้อง";
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle className="flex items-center gap-2">
              <Calculator data-icon="inline-start" />
              {editingMainFormula ? "แก้ไขสูตรหลัก" : "เพิ่มคอลัมน์/สูตร"}
            </DialogTitle>
            <DialogDescription>
              กำหนดชื่อ สูตร รูปแบบผลลัพธ์ และเลือกใช้สูตรจาก Formula Memory
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={requestClose}
            aria-label="ปิด"
          >
            <X />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-xs text-linear-ink-tertiary">ชื่อคอลัมน์</label>
            <Input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="เช่น กำไร"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-linear-ink-tertiary">
              สูตร — ใช้ + - * / ( ) เทียบด้วย = &lt;&gt; &lt; &gt; ใส่ข้อความในเครื่องหมายคำพูด
              และอ้างคอลัมน์ด้วย [ชื่อคอลัมน์]
            </label>
            <Input
              type="text"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder={'เช่น IF(DAYSUNTIL([วันหมดอายุ]) < 3, "ใกล้หมดอายุ", "ปกติ")'}
              className="font-mono text-xs"
            />
            {formula.trim() && (
              <p className={`mt-1 text-xs ${validation.ok ? "text-linear-success" : "text-linear-danger"}`}>
                {validation.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="gameinfo-computed-scope" className="mb-1 block text-xs text-linear-ink-tertiary">
              ขอบเขตการใช้สูตร
            </label>
            <select
              id="gameinfo-computed-scope"
              value={scopeMode}
              onChange={(event) => setScopeMode(event.target.value)}
              className="h-9 w-full rounded border border-linear-hairline-strong bg-linear-surface-2 px-2 text-sm text-linear-ink outline-none focus:border-linear-primary"
            >
              <option value="global">ใช้สูตรหลักทั้งคอลัมน์</option>
              <option value="category">แยกสูตรตามหมวด</option>
            </select>
            <p className="mt-1 text-[11px] text-linear-ink-tertiary">
              หมวดที่ยังไม่มีสูตรเฉพาะจะใช้สูตรหลักด้านบนเสมอ ชื่อหมวดไม่มีผลต่อสูตร
            </p>
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

          {editingMainFormula && (
            Object.keys(initialColumn?.rowOverrides || {}).length > 0 ||
            Object.keys(initialColumn?.categoryFormulas || {}).length > 0
          ) ? (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-linear-warning/40 bg-linear-warning-bg p-3 text-xs text-linear-warning">
              <input
                type="checkbox"
                checked={resetOverrides}
                onChange={(event) => setResetOverrides(event.target.checked)}
                className="mt-0.5 accent-linear-primary"
              />
              <span>
                ใช้สูตรหลักนี้กับทุก pack และล้างสูตรเฉพาะหมวด/เฉพาะ pack ทั้งหมด
              </span>
            </label>
          ) : null}

          <div>
            <label htmlFor="gameinfo-computed-symbol" className="mb-1 block text-xs text-linear-ink-tertiary">
              สัญลักษณ์ที่แสดง
            </label>
            <Input
              id="gameinfo-computed-symbol"
              type="text"
              value={type === "number" ? symbol : ""}
              disabled={type !== "number"}
              onChange={(e) => setSymbol(e.target.value)}
              maxLength={24}
              list="gameinfo-computed-symbol-suggestions"
              placeholder="เช่น ฿, %, USD, Coins"
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

          <GameinfoFormulaHelpPanel />

          <div>
            <p className="mb-1.5 text-xs text-linear-ink-tertiary">คอลัมน์ที่ใช้ได้ (กดเพื่อแทรก):</p>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...GAMEINFO_FIELD_NAMES, ...extraFieldNames, ...otherColumns.map((column) => column.label)])].map((name) => (
                <Button
                  key={name}
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => setFormula((prev) => `${prev}[${name}]`)}
                >
                  {name}
                </Button>
              ))}
            </div>
          </div>

          {missing.length > 0 && (
            <div className="rounded-md border border-linear-warning/40 bg-linear-warning-bg px-3 py-2 text-xs font-medium text-linear-warning">
              ยังบันทึกไม่ได้ — ต้องกรอก: {missing.join(" · ")}
            </div>
          )}
          </div>

          <GameinfoFormulaMemory
            formula={formula}
            type={type}
            symbol={symbol}
            onApply={applyMemoryPreset}
            className="overflow-y-auto border-t border-linear-hairline bg-linear-surface-2 p-4 lg:border-l lg:border-t-0"
          />
        </div>

        <div className="flex items-center justify-end border-t px-5 py-3">
          <Button
            type="button"
            onClick={submit}
            disabled={!label.trim() || !validation.ok}
          >
            <Plus data-icon="inline-start" /> {editingMainFormula ? "บันทึกสูตรหลัก" : "เพิ่มคอลัมน์"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
