"use client";

import { useEffect, useMemo, useState } from "react";
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
import { apiJson } from "@/lib/api-json";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [entryMode, setEntryMode] = useState(initialColumn?.entryMode === "manual" ? "manual" : "formula");
  const [label, setLabel] = useState(initialColumn?.label || "");
  // One column definition is shared by every game, so a formula written here
  // lands in one of two places: the definition (every game computes it) or
  // this game's own gameFormula. Editing used to always write the definition,
  // silently changing the column in all 216 games; a column that already has a
  // formula of its own for this game opens on that formula and that scope.
  const [formulaScope, setFormulaScope] = useState(
    String(initialColumn?.gameFormula || "").trim() ? "game" : "all"
  );
  const [formula, setFormula] = useState(
    String(initialColumn?.gameFormula || "").trim() || initialColumn?.formula || ""
  );
  // Empty until touched, so the type follows the formula while the user is
  // still writing it and stops the moment they choose one themselves.
  const [typeChoice, setTypeChoice] = useState(initialColumn?.type || "");
  const [symbol, setSymbol] = useState(initialColumn?.symbol || "");
  const [scopeMode, setScopeMode] = useState(
    initialColumn?.scopeMode === "category" ? "category" : "global"
  );
  const [resetOverrides, setResetOverrides] = useState(false);
  const normalizedLabel = label.trim().toLocaleLowerCase("th");
  const labelExists = Boolean(normalizedLabel) && [
    ...GAMEINFO_FIELD_NAMES,
    ...extraFieldNames,
    ...otherColumns.map((column) => column.label),
  ].some((name) => String(name).trim().toLocaleLowerCase("th") === normalizedLabel);
  const labelError = labelExists ? `มีชื่อ "${label.trim()}" อยู่แล้ว` : "";
  const initialFormula =
    String(initialColumn?.gameFormula || "").trim() || String(initialColumn?.formula || "").trim();
  const dirty =
    label.trim() !== String(initialColumn?.label || "").trim() ||
    entryMode !== (initialColumn?.entryMode === "manual" ? "manual" : "formula") ||
    formulaScope !== (String(initialColumn?.gameFormula || "").trim() ? "game" : "all") ||
    formula.trim() !== initialFormula ||
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
    if (entryMode === "manual" && !formula.trim()) return { ok: true, message: "", type: "number" };
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
  }, [entryMode, extraFieldNames, formula, initialColumn, label, otherColumns, sampleRow, symbol, typeChoice]);

  const type = typeChoice || validation.type;
  const missing = [
    !label.trim() && "ชื่อคอลัมน์",
    labelError && "ชื่อคอลัมน์ที่ไม่ซ้ำ",
    entryMode === "formula" && !formula.trim() && "สูตร",
    formula.trim() && !validation.ok && "สูตรที่ถูกต้อง (ดูข้อความใต้ช่องสูตร)",
  ].filter(Boolean);

  function submit() {
    if (!label.trim() || labelError || !validation.ok) return;
    const written = entryMode === "manual" ? "" : formula.trim();
    const nextColumn = {
      key: initialColumn?.key || `col_${Date.now()}`,
      label: label.trim(),
      // "This game only" leaves the shared formula exactly as it was, so every
      // other game keeps computing what it computed before this edit.
      formula: formulaScope === "game" ? String(initialColumn?.formula || "") : written,
      gameFormula: formulaScope === "game" ? written : "",
      entryMode,
      type,
      symbol: type === "number" ? symbol : "",
      scopeMode,
    };
    if (editingMainFormula) onSave?.(nextColumn, { resetOverrides });
    else onAdd(nextColumn);
  }

  // What other games already compute in this column. Only for a column that
  // exists — a brand new one has no history to offer.
  const [otherFormulas, setOtherFormulas] = useState([]);
  const columnKey = initialColumn?.key || "";
  const columnLabel = initialColumn?.label || "";
  useEffect(() => {
    if (!columnKey) return undefined;
    let cancelled = false;
    apiJson(
      `/api/gameinfo/column-formulas?columnKey=${encodeURIComponent(columnKey)}&label=${encodeURIComponent(columnLabel)}`
    )
      .then((data) => {
        if (!cancelled) setOtherFormulas(data.formulas || []);
      })
      // A suggestion nobody asked for must not turn into an error banner.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [columnKey, columnLabel]);
  const suggestions = useMemo(
    () => otherFormulas.filter((item) => item.formula.trim() !== formula.trim()),
    [otherFormulas, formula]
  );

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
        className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle className="flex items-center gap-2">
              <Calculator data-icon="inline-start" />
              {editingMainFormula ? "แก้ไขคอลัมน์" : "เพิ่มคอลัมน์/สูตร"}
            </DialogTitle>
            <DialogDescription>
              {entryMode === "manual"
                ? "สร้างคอลัมน์ว่างสำหรับกรอกตัวเลขหรือสูตรแยกแต่ละ Pack"
                : "กำหนดชื่อ สูตร รูปแบบผลลัพธ์ และเลือกใช้สูตรจาก Formula Memory"}
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

        <div className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain lg:grid-cols-[minmax(0,1fr)_20rem] lg:overflow-hidden">
          <div className="flex flex-col gap-3 px-5 py-4 lg:min-h-0 lg:overflow-y-auto">
          <div>
            <label className="mb-1 block text-xs text-linear-ink-tertiary">ชื่อคอลัมน์</label>
            <Input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="เช่น กำไร"
              aria-invalid={Boolean(labelError)}
            />
            {labelError ? <p role="alert" className="mt-1 text-xs text-linear-danger">{labelError}</p> : null}
          </div>

          <div>
            <label className="mb-1 block text-xs text-linear-ink-tertiary">รูปแบบคอลัมน์</label>
            <Tabs value={entryMode} onValueChange={setEntryMode}>
              <TabsList className="grid h-9 w-full grid-cols-2">
                <TabsTrigger value="formula">ใช้สูตรทั้งคอลัมน์</TabsTrigger>
                <TabsTrigger value="manual">กรอกเองแต่ละ Pack</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="mt-1 text-[11px] text-linear-ink-tertiary">
              {entryMode === "manual"
                ? "เริ่มต้นเป็นค่าว่าง และแต่ละ Pack ใส่ตัวเลขหรือสูตรของตัวเองได้"
                : "กำหนดสูตรหลักครั้งเดียว แล้วใช้กับทุก Pack"}
            </p>
          </div>

          <div className={entryMode === "manual" ? "hidden" : undefined}>
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

          <div className={entryMode === "manual" ? "hidden" : undefined}>
            <label className="mb-1 block text-xs text-linear-ink-tertiary">สูตรนี้ใช้กับเกมไหน</label>
            <Tabs value={formulaScope} onValueChange={setFormulaScope}>
              <TabsList className="grid h-9 w-full grid-cols-2">
                <TabsTrigger value="all">ทุกเกมที่ใช้คอลัมน์นี้</TabsTrigger>
                <TabsTrigger value="game">เฉพาะเกมนี้</TabsTrigger>
              </TabsList>
            </Tabs>
            {formulaScope === "game" ? (
              <p className="mt-1 text-[11px] text-linear-ink-tertiary">
                เก็บเป็นสูตรเฉพาะเกม เกมอื่นยังคำนวณด้วยสูตรกลางเหมือนเดิม
                {String(initialColumn?.formula || "").trim()
                  ? ` (สูตรกลางตอนนี้: ${initialColumn.formula})`
                  : " (คอลัมน์นี้ยังไม่มีสูตรกลาง)"}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-linear-warning">
                คอลัมน์เป็นของกลาง — บันทึกแล้วทุกเกมที่ใช้คอลัมน์นี้จะคำนวณตามสูตรนี้
                {String(initialColumn?.gameFormula || "").trim()
                  ? " และสูตรเฉพาะเกมของเกมนี้จะถูกยกเลิก"
                  : ""}
              </p>
            )}
          </div>

          {suggestions.length > 0 && entryMode === "formula" ? (
            <div>
              <p className="mb-1.5 text-xs text-linear-ink-tertiary">
                สูตรที่ใช้อยู่ในคอลัมน์นี้ (กดเพื่อใช้ตาม):
              </p>
              <div className="flex flex-col gap-1">
                {suggestions.map((item) => (
                  <button
                    key={item.formula}
                    type="button"
                    onClick={() => setFormula(item.formula)}
                    className="flex flex-col items-start gap-0.5 rounded-md border border-linear-hairline-strong px-2.5 py-1.5 text-left hover:bg-linear-surface-2"
                  >
                    <span className="w-full truncate font-mono text-[11px] text-linear-ink">{item.formula}</span>
                    <span className="text-[10px] text-linear-ink-tertiary">
                      {item.shared ? "สูตรกลางของคอลัมน์" : `ใช้ใน ${item.gameCount} เกม`}
                      {item.games.length
                        ? ` · ${item.games.join(", ")}${item.moreGames ? ` +${item.moreGames}` : ""}`
                        : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className={entryMode === "manual" ? "hidden" : undefined}>
            <label htmlFor="gameinfo-computed-scope" className="mb-1 block text-xs text-linear-ink-tertiary">
              ขอบเขตการใช้สูตร (ภายในเกมนี้)
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

          {entryMode === "formula" && editingMainFormula && (
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

          {entryMode === "formula" ? <GameinfoFormulaHelpPanel /> : null}

          <div className={entryMode === "manual" ? "hidden" : undefined}>
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

          {entryMode === "formula" ? <GameinfoFormulaMemory
            formula={formula}
            type={type}
            symbol={symbol}
            onApply={applyMemoryPreset}
            className="border-t border-linear-hairline bg-linear-surface-2 p-4 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0"
          /> : (
            <aside className="border-t border-linear-hairline bg-linear-surface-2 p-4 text-xs text-linear-ink-tertiary lg:border-l lg:border-t-0">
              หลังเพิ่มคอลัมน์ ให้กดเซลล์ของแต่ละ Pack เพื่อใส่ตัวเลขหรือสูตร
            </aside>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end border-t px-5 py-3">
          <Button
            type="button"
            onClick={submit}
            disabled={!label.trim() || Boolean(labelError) || !validation.ok}
          >
            <Plus data-icon="inline-start" /> {editingMainFormula ? "บันทึกคอลัมน์" : "เพิ่มคอลัมน์"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
