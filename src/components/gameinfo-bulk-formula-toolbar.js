"use client";

import { useMemo, useState } from "react";
import { Eraser, X } from "lucide-react";
import { extractFormulaRefs, parseFormula } from "@/lib/gamedb-formula";
import { GAMEINFO_FIELD_NAMES } from "@/lib/gameinfo-formula-fields";
import {
  evaluateGameinfoComputedColumn,
  validateGameinfoComputedDependencies,
} from "@/lib/gameinfo-computed-evaluator";
import { setGameinfoFormulaOverride } from "@/lib/gameinfo-formula-overrides";
import { formatGameinfoPackColumnValue } from "@/lib/gameinfo-pack-columns";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import GameinfoFormulaMemory from "./gameinfo-formula-memory";

export default function GameinfoBulkFormulaToolbar({
  computedColumns,
  selectedPacks,
  formulaVariables,
  game,
  formulaContext,
  onApply,
  onClear,
  onCancel,
}) {
  const [columnKey, setColumnKey] = useState(computedColumns[0]?.key || null);
  const [formula, setFormula] = useState("");
  const target = computedColumns.find((column) => column.key === columnKey) || null;
  const columnItems = useMemo(
    () => computedColumns.map((column) => ({ label: column.label, value: column.key })),
    [computedColumns]
  );

  const validation = useMemo(() => {
    if (!target || !formula.trim()) return { ok: false, message: "กรุณาเลือกคอลัมน์และกรอกสูตร" };
    try {
      const ast = parseFormula(formula);
      const availableNames = [
        ...GAMEINFO_FIELD_NAMES,
        ...formulaVariables.map((variable) => variable.name),
        ...computedColumns.map((column) => column.label),
      ];
      const unknown = [...extractFormulaRefs(ast)].filter((name) => !availableNames.includes(name));
      if (unknown.length) return { ok: false, message: `เกมนี้ไม่มีคอลัมน์: ${unknown.join(", ")}` };

      let nextColumns = computedColumns;
      const packCategoryIds = {};
      for (const entry of selectedPacks) {
        packCategoryIds[String(entry.pack.id)] = String(entry.categoryId);
        nextColumns = setGameinfoFormulaOverride(
          nextColumns,
          target.key,
          entry.pack.id,
          formula
        );
      }
      const dependencyErrors = validateGameinfoComputedDependencies(
        nextColumns,
        formulaVariables.map((variable) => variable.name),
        { packCategoryIds }
      );
      if (dependencyErrors.length) return { ok: false, message: dependencyErrors[0] };

      const sample = selectedPacks[0];
      const nextTarget = nextColumns.find((column) => column.key === target.key);
      const value = sample
        ? evaluateGameinfoComputedColumn(
            nextTarget,
            nextColumns,
            sample.pack,
            game,
            { ...formulaContext, categoryId: sample.categoryId }
          )
        : null;
      return {
        ok: true,
        message: `สูตรถูกต้อง · ตัวอย่าง ${formatGameinfoPackColumnValue(value, target)}`,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "สูตรไม่ถูกต้อง" };
    }
  }, [computedColumns, formula, formulaContext, formulaVariables, game, selectedPacks, target]);

  function applyMemoryPreset(preset) {
    try {
      const ast = parseFormula(preset.formula);
      const availableNames = [
        ...GAMEINFO_FIELD_NAMES,
        ...formulaVariables.map((variable) => variable.name),
        ...computedColumns.map((column) => column.label),
      ];
      const unknown = [...extractFormulaRefs(ast)].filter((name) => !availableNames.includes(name));
      if (unknown.length) return `เกมนี้ไม่มีคอลัมน์: ${unknown.join(", ")}`;
      setFormula(preset.formula);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "สูตรไม่ถูกต้อง";
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-linear-hairline-strong bg-linear-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-linear-ink">แก้สูตรหลาย Pack</h3>
          <p className="text-xs text-linear-ink-tertiary">เลือกแล้ว {selectedPacks.length} Pack</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X data-icon="inline-start" />
          ยกเลิกการเลือก
        </Button>
      </div>

      <FieldGroup className="gap-3">
        <Field data-disabled={columnItems.length === 0}>
          <FieldLabel>คอลัมน์สูตรเป้าหมาย</FieldLabel>
          {columnItems.length > 0 ? (
            <Select items={columnItems} value={columnKey} onValueChange={setColumnKey}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {columnItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <Input value="ไม่มีคอลัมน์สูตร" disabled readOnly />
          )}
        </Field>

        <Field data-invalid={Boolean(formula.trim()) && !validation.ok}>
          <FieldLabel htmlFor="gameinfo-bulk-formula">สูตรที่จะใช้กับทุก Pack ที่เลือก</FieldLabel>
          <Input
            id="gameinfo-bulk-formula"
            value={formula}
            onChange={(event) => setFormula(event.target.value)}
            placeholder="เช่น [ราคา] * 0.9"
            aria-invalid={Boolean(formula.trim()) && !validation.ok}
          />
          {formula.trim() ? (
            validation.ok
              ? <FieldDescription>{validation.message}</FieldDescription>
              : <FieldError>{validation.message}</FieldError>
          ) : null}
        </Field>
      </FieldGroup>

      {target ? (
        <GameinfoFormulaMemory
          formula={formula}
          type={target.type || "number"}
          symbol={target.symbol || ""}
          onApply={applyMemoryPreset}
        />
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onClear(target?.key)} disabled={!target}>
          <Eraser data-icon="inline-start" />
          ล้างสูตรเฉพาะ Pack
        </Button>
        <Button type="button" onClick={() => onApply(target.key, formula)} disabled={!target || !validation.ok}>
          นำไปใช้ {selectedPacks.length} Pack
        </Button>
      </div>
    </section>
  );
}
