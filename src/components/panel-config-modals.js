"use client";

import { useMemo, useState } from "react";
import {
  ChartColumn,
  Palette,
  Plus,
  Save,
  SlidersHorizontal,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { extractSqlParams } from "@/lib/gamedb-sql-params";
import {
  PARAM_TYPES,
  RULE_OPS,
  RULE_TONES,
  TONE_CELL_CLASS,
  TONE_LABELS,
} from "@/lib/gamedb-layout";

const inputClass =
  "h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white";
const labelClass = "mb-1 block text-[10px] font-black text-zinc-500";

function ModalShell({ title, icon, onClose, children, onSave, saveLabel = "บันทึก" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-black">
            {icon} {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-50"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">{children}</div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onSave}
            className="flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-red-700"
          >
            <Save size={13} /> {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Turns the :placeholders found in the SQL into labelled, typed inputs. */
export function ParamsSettingsModal({ sqlText, params, onSave, onClose }) {
  const names = useMemo(() => extractSqlParams(sqlText), [sqlText]);
  const [draft, setDraft] = useState(() =>
    names.map((name) => {
      const existing = params.find((param) => param.name === name);
      return (
        existing || { name, label: name, type: "text", defaultValue: "", options: [] }
      );
    })
  );

  const setField = (name, key, value) =>
    setDraft((prev) =>
      prev.map((param) => (param.name === name ? { ...param, [key]: value } : param))
    );

  return (
    <ModalShell
      title="พารามิเตอร์ของ Query"
      icon={<SlidersHorizontal size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={() => onSave(draft)}
    >
      {names.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-[11px] font-semibold text-zinc-400">
          ยังไม่พบพารามิเตอร์ใน SQL — เขียน <code className="font-mono">:ชื่อ</code> ใน
          SQL เช่น <code className="font-mono">WHERE created_at &gt;= :from</code>{" "}
          แล้วกลับมาตั้งค่าที่นี่
        </p>
      ) : (
        draft.map((param) => (
          <div key={param.name} className="rounded-xl border border-zinc-200 p-3">
            <p className="mb-2 font-mono text-[11px] font-black text-red-600">:{param.name}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className={labelClass}>ป้ายกำกับ</label>
                <input
                  type="text"
                  value={param.label}
                  onChange={(e) => setField(param.name, "label", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>ชนิด</label>
                <select
                  value={param.type}
                  onChange={(e) => setField(param.name, "type", e.target.value)}
                  className={inputClass}
                >
                  {PARAM_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type === "text"
                        ? "ข้อความ"
                        : type === "number"
                          ? "ตัวเลข"
                          : type === "date"
                            ? "วันที่"
                            : "ตัวเลือก (dropdown)"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>ค่าเริ่มต้น</label>
                <input
                  type="text"
                  value={param.defaultValue}
                  onChange={(e) => setField(param.name, "defaultValue", e.target.value)}
                  className={inputClass}
                />
              </div>
              {param.type === "select" && (
                <div>
                  <label className={labelClass}>ตัวเลือก (คั่นด้วย ,)</label>
                  <input
                    type="text"
                    value={param.options.join(",")}
                    onChange={(e) =>
                      setField(
                        param.name,
                        "options",
                        e.target.value
                          .split(",")
                          .map((option) => option.trim())
                          .filter(Boolean)
                      )
                    }
                    className={inputClass}
                  />
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </ModalShell>
  );
}

/** Which table/rows this query is allowed to write back to. */
export function EditableSettingsModal({ columnNames, editable, onSave, onClose }) {
  const [table, setTable] = useState(editable?.table || "");
  const [pk, setPk] = useState(editable?.pk || "");
  const [columns, setColumns] = useState(editable?.columns || []);

  const toggle = (name) =>
    setColumns((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );

  const pkInResult = !pk || columnNames.includes(pk);

  return (
    <ModalShell
      title="ตั้งค่าการแก้ไขข้อมูล"
      icon={<Table2 size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={() =>
        onSave(
          table.trim() && pk.trim()
            ? { table: table.trim(), pk: pk.trim(), columns }
            : null
        )
      }
    >
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
        เปิดแล้ว Admin จะดับเบิลคลิกแก้ค่าในตารางได้ ระบบจะเขียน UPDATE กลับไปที่ตารางนี้
        ทีละ 1 แถว และบันทึกลง log ทุกครั้ง (staff แก้ไม่ได้)
      </p>
      <div>
        <label className={labelClass}>ตารางที่จะเขียนกลับ (เช่น packages หรือ public.packages)</label>
        <input
          type="text"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          placeholder="ชื่อตารางจริงในฐานข้อมูล"
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>คอลัมน์ที่เป็น key (ต้องมีอยู่ในผลลัพธ์ของ Query)</label>
        <input
          type="text"
          value={pk}
          onChange={(e) => setPk(e.target.value)}
          placeholder="เช่น id"
          className={inputClass}
        />
        {!pkInResult && (
          <p className="mt-1 text-[10px] font-bold text-red-600">
            ผลลัพธ์ยังไม่มีคอลัมน์ &quot;{pk}&quot; — เพิ่มเข้าไปใน SELECT ก่อน ไม่งั้นแก้ไม่ได้
          </p>
        )}
      </div>
      <div>
        <label className={labelClass}>คอลัมน์ที่อนุญาตให้แก้</label>
        <div className="flex flex-wrap gap-1">
          {columnNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${
                columns.includes(name)
                  ? "border-red-600 bg-red-600 text-white"
                  : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

export function RulesModal({ columns, rules, onSave, onClose }) {
  const [draft, setDraft] = useState(rules);
  const [form, setForm] = useState({
    colId: columns[0]?.id || "",
    op: ">",
    value: "",
    tone: "red",
  });

  return (
    <ModalShell
      title="ระบายสีตามเงื่อนไข"
      icon={<Palette size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={() => onSave(draft)}
    >
      {draft.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-5 text-center text-[11px] font-semibold text-zinc-400">
          ยังไม่มีกฎ — เพิ่มด้านล่าง เช่น &quot;คงเหลือ &lt; 10 = แดง&quot;
        </p>
      ) : (
        draft.map((rule, index) => {
          const column = columns.find((col) => col.id === rule.colId);
          return (
            <div
              key={`${rule.colId}-${index}`}
              className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2"
            >
              <span
                className={`rounded px-2 py-1 text-[10px] font-black ${
                  TONE_CELL_CLASS[rule.tone] || "bg-zinc-100 text-zinc-600"
                }`}
              >
                {TONE_LABELS[rule.tone]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-700">
                {column?.label || rule.colId} {rule.op} {rule.value}
              </span>
              <button
                type="button"
                onClick={() => setDraft((prev) => prev.filter((_, i) => i !== index))}
                className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600"
                title="ลบกฎนี้"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })
      )}

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <select
            value={form.colId}
            onChange={(e) => setForm((prev) => ({ ...prev, colId: e.target.value }))}
            className={`${inputClass} sm:col-span-2`}
          >
            {columns.map((col) => (
              <option key={col.id} value={col.id}>
                {col.label}
              </option>
            ))}
          </select>
          <select
            value={form.op}
            onChange={(e) => setForm((prev) => ({ ...prev, op: e.target.value }))}
            className={inputClass}
          >
            {RULE_OPS.map((op) => (
              <option key={op} value={op}>
                {op === "contains" ? "มีคำว่า" : op}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={form.value}
            onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))}
            placeholder="ค่า"
            className={inputClass}
          />
          <select
            value={form.tone}
            onChange={(e) => setForm((prev) => ({ ...prev, tone: e.target.value }))}
            className={`${inputClass} sm:col-span-2`}
          >
            {RULE_TONES.map((tone) => (
              <option key={tone} value={tone}>
                {TONE_LABELS[tone]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (!form.colId) return;
              setDraft((prev) => [...prev, { ...form }]);
              setForm((prev) => ({ ...prev, value: "" }));
            }}
            className="flex h-9 items-center justify-center gap-1 rounded-lg border border-zinc-300 text-[11px] font-black text-zinc-600 transition hover:bg-white sm:col-span-2"
          >
            <Plus size={12} /> เพิ่มกฎ
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function ChartModal({ columns, chart, onSave, onClose }) {
  const [type, setType] = useState(chart?.type || "bar");
  const [x, setX] = useState(chart?.x || columns[0]?.id || "");
  const [y, setY] = useState(chart?.y || []);

  const numericColumns = columns.filter(
    (col) => col.type === "number" || col.kind === "computed"
  );

  return (
    <ModalShell
      title="ตั้งค่ากราฟ"
      icon={<ChartColumn size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={() => onSave(x && y.length ? { type, x, y } : null)}
    >
      <div>
        <label className={labelClass}>ชนิดกราฟ</label>
        <div className="flex gap-2">
          {[
            ["bar", "แท่ง"],
            ["line", "เส้น"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              className={`flex-1 rounded-lg border px-3 py-2 text-[11px] font-black transition ${
                type === value
                  ? "border-red-600 bg-red-600 text-white"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={labelClass}>แกน X (ป้ายกำกับ)</label>
        <select value={x} onChange={(e) => setX(e.target.value)} className={inputClass}>
          {columns.map((col) => (
            <option key={col.id} value={col.id}>
              {col.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>แกน Y (เลือกได้หลายคอลัมน์ตัวเลข)</label>
        {numericColumns.length === 0 ? (
          <p className="text-[11px] font-semibold text-zinc-400">
            ผลลัพธ์นี้ไม่มีคอลัมน์ตัวเลข
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {numericColumns.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() =>
                  setY((prev) =>
                    prev.includes(col.id)
                      ? prev.filter((id) => id !== col.id)
                      : [...prev, col.id]
                  )
                }
                className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${
                  y.includes(col.id)
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {col.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
