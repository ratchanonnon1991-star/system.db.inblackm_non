"use client";

import { Plus, Trash2 } from "lucide-react";

export default function GameinfoCostProfileEditor({ profiles, onAdd, onUpdate, onRemove }) {
  return (
    <section className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-linear-ink">โปรไฟล์ต้นทุน ({profiles.length})</h2>
          <p className="mt-0.5 text-xs text-linear-ink-tertiary">
            ต้นทุน = ยอดที่กด + fee × อัตราที่คำนวณจากโปรไฟล์
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 rounded-md border border-linear-primary/40 px-3 py-1 text-xs text-linear-primary hover:bg-linear-primary/10"
        >
          <Plus size={13} /> เพิ่มต้นทุน
        </button>
      </div>

      {profiles.length === 0 ? (
        <p className="rounded-md border border-dashed border-linear-hairline-strong p-4 text-center text-xs text-linear-ink-tertiary">
          ยังไม่มีโปรไฟล์ต้นทุน — สูตรยังใช้ [ต้นทุน] ไม่ได้จนกว่าจะสร้างและเลือกให้ pack
        </p>
      ) : (
        <div className="space-y-2">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="grid gap-2 rounded-md border border-linear-hairline bg-linear-surface-2 p-3 md:grid-cols-[1.2fr_90px_110px_2fr_auto]"
            >
              <CostInput
                label="ชื่อโปรไฟล์"
                value={profile.label}
                placeholder="เช่น RAZER (OTHER)"
                onChange={(label) => onUpdate(profile.id, { label })}
              />
              <CostInput
                label="สกุลเงิน"
                value={profile.inputCurrency}
                placeholder="USD"
                onChange={(inputCurrency) => onUpdate(profile.id, { inputCurrency: inputCurrency.toUpperCase() })}
              />
              <CostInput
                label="ค่าพื้นฐาน"
                value={profile.baseValue}
                placeholder="1"
                inputMode="decimal"
                onChange={(baseValue) => onUpdate(profile.id, { baseValue })}
              />
              <CostInput
                label="สูตรอัตราต้นทุน (เว้นว่าง = ค่าพื้นฐาน)"
                value={profile.rateFormula}
                placeholder="[baseValue] หรือ [USDT/THB] * [baseValue]"
                mono
                onChange={(rateFormula) => onUpdate(profile.id, { rateFormula })}
              />
              <button
                type="button"
                onClick={() => onRemove(profile.id)}
                className="mt-5 flex h-9 w-9 items-center justify-center rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/15"
                title="ลบโปรไฟล์ต้นทุน"
                aria-label={`ลบโปรไฟล์ต้นทุน ${profile.label}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CostInput({ label, value, onChange, placeholder, inputMode, mono = false }) {
  return (
    <label className="min-w-0 text-[10px] text-linear-ink-tertiary">
      <span className="mb-1 block truncate" title={label}>{label}</span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`h-9 w-full rounded border border-linear-hairline-strong bg-linear-surface-1 px-2 text-sm text-linear-ink outline-none focus:border-linear-primary ${
          mono ? "font-mono text-xs" : ""
        }`}
      />
    </label>
  );
}
