"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChartColumn,
  ClipboardPaste,
  Combine,
  CornerDownRight,
  Loader2,
  Paintbrush,
  Palette,
  Plus,
  Save,
  SlidersHorizontal,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { extractSqlParams } from "@/lib/gamedb-sql-params";
import {
  CELL_ALIGNS,
  CELL_RENDERS,
  EMPTY_FORMAT,
  INPUT_WIDGETS,
  isEmptyFormat,
  MAX_FREEZE,
  MAX_GROUP_LABEL,
  normalizeFormat,
  PARAM_TYPES,
  resolveInputDefault,
  RULE_OP_LABELS,
  RULE_OPS,
  RULE_TONES,
  TONE_LABELS,
  TONE_NAMES,
  toneStyle,
  VALUELESS_OPS,
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
        existing || {
          name,
          label: name,
          type: "text",
          defaultValue: "",
          options: [],
          required: true,
        }
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
                            : type === "datetime"
                              ? "วันที่และเวลา"
                              : type === "time"
                                ? "เวลา"
                                : type === "boolean"
                                  ? "ใช่ / ไม่ใช่ (switch)"
                                  : "ตัวเลือก (dropdown)"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>ค่าเริ่มต้น</label>
                <input
                  type={
                    param.type === "number"
                      ? "number"
                      : param.type === "date"
                        ? "date"
                        : param.type === "datetime"
                          ? "datetime-local"
                          : param.type === "time"
                            ? "time"
                          : "text"
                  }
                  step={["datetime", "time"].includes(param.type) ? 1 : undefined}
                  value={param.defaultValue}
                  onChange={(e) => setField(param.name, "defaultValue", e.target.value)}
                  placeholder={
                    param.type === "number"
                      ? "เช่น 100"
                      : param.type === "date"
                        ? "เช่น 2026-07-28"
                        : param.type === "datetime"
                          ? "เช่น 2026-07-28T14:30:00"
                          : param.type === "time"
                            ? "เช่น 14:30:00"
                            : param.type === "boolean"
                              ? "true หรือ false"
                          : "เช่น ABC123"
                  }
                  className={inputClass}
                />
                {param.type !== "select" && (
                  <p className="mt-1 text-[9px] font-semibold text-zinc-400">
                    {param.type === "number"
                      ? "ตัวอย่าง: 100 หรือ 99.50"
                      : param.type === "date"
                        ? "รูปแบบ: YYYY-MM-DD"
                        : param.type === "datetime"
                          ? "รูปแบบ: YYYY-MM-DDTHH:mm:ss"
                          : param.type === "time"
                            ? "รูปแบบ: HH:mm:ss"
                            : param.type === "boolean"
                              ? "ค่า true = ใช่, false = ไม่ใช่"
                          : "ตัวอย่าง: ข้อความหรือรหัสที่ Query ต้องการ"}
                  </p>
                )}
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-[10px] font-bold text-zinc-600">
                <input
                  type="checkbox"
                  checked={param.required !== false}
                  onChange={(e) => setField(param.name, "required", e.target.checked)}
                />
                ต้องกรอกก่อนรัน
              </label>
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

const WIDGET_LABELS = {
  text: "ข้อความ",
  number: "ตัวเลข",
  date: "วันที่",
  time: "เวลา",
  datetime: "วันที่ + เวลา",
  select: "เลือกจากรายการ",
  textarea: "ข้อความหลายบรรทัด",
  checkbox: "ใช่ / ไม่ใช่",
};

/** Which table/rows this query is allowed to write back to. */
export function EditableSettingsModal({ columnNames, editable, onSave, onClose }) {
  const [table, setTable] = useState(editable?.table || "");
  const [pk, setPk] = useState(editable?.pk || "");
  const [columns, setColumns] = useState(editable?.columns || []);
  const [allowInsert, setAllowInsert] = useState(editable?.allowInsert || false);
  const [allowDelete, setAllowDelete] = useState(editable?.allowDelete || false);
  const [inputs, setInputs] = useState(() => editable?.inputs || []);

  const toggle = (name) =>
    setColumns((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );

  const inputFor = (name) =>
    inputs.find((input) => input.column === name) || {
      column: name,
      widget: "text",
      options: [],
      defaultValue: "",
      required: false,
    };

  const updateInput = (name, patch) =>
    setInputs((prev) => {
      const next = prev.filter((input) => input.column !== name);
      // Keep the order the columns were picked in, so the form reads the same
      // way the allow-list does.
      const merged = { ...inputFor(name), ...patch };
      return [...next, merged].sort(
        (a, b) => columns.indexOf(a.column) - columns.indexOf(b.column)
      );
    });

  const pkInResult = !pk || columnNames.includes(pk);

  return (
    <ModalShell
      title="ตั้งค่าการแก้ไขข้อมูล"
      icon={<Table2 size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={() =>
        onSave(
          table.trim() && pk.trim()
            ? {
                table: table.trim(),
                pk: pk.trim(),
                columns,
                allowInsert,
                allowDelete,
                inputs: inputs.filter((input) => columns.includes(input.column)),
              }
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

      <div className="rounded-xl border border-zinc-200 p-3">
        <p className="mb-2 text-[10px] font-black text-zinc-500">เพิ่ม / ลบทั้งแถว</p>
        <label className="flex items-center gap-2 text-[11px] font-bold text-zinc-600">
          <input
            type="checkbox"
            checked={allowInsert}
            onChange={(e) => setAllowInsert(e.target.checked)}
            className="h-3.5 w-3.5 accent-red-600"
          />
          ให้เพิ่มแถวใหม่ได้ (ปุ่ม &quot;เพิ่มแถว&quot; เหนือตาราง)
        </label>
        <label className="mt-1.5 flex items-center gap-2 text-[11px] font-bold text-zinc-600">
          <input
            type="checkbox"
            checked={allowDelete}
            onChange={(e) => setAllowDelete(e.target.checked)}
            className="h-3.5 w-3.5 accent-red-600"
          />
          ให้ลบแถวได้ (ปุ่ม 🗑 ท้ายเลขแถว — ถามยืนยันก่อนเสมอ)
        </label>
        {allowDelete && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-red-600">
            การลบไม่มีปุ่มย้อนกลับ ระบบจะเก็บค่าของแถวที่ลบไว้ใน log เท่านั้น
          </p>
        )}
      </div>

      {allowInsert && (
        <div className="rounded-xl border border-zinc-200 p-3">
          <p className="mb-2 text-[10px] font-black text-zinc-500">
            ช่องกรอกของฟอร์มเพิ่มแถว — คอลัมน์ที่ไม่ได้ตั้งจะเป็นช่องข้อความธรรมดา
          </p>
          {columns.length === 0 ? (
            <p className="text-[11px] font-semibold text-zinc-400">
              เลือกคอลัมน์ที่อนุญาตให้แก้ด้านบนก่อน
            </p>
          ) : (
            <div className="space-y-2">
              {columns.map((name) => {
                const input = inputFor(name);
                return (
                  <div key={name} className="rounded-lg border border-zinc-200 px-2.5 py-2">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[11px] font-black text-zinc-700">
                        {name}
                      </span>
                      <label className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-zinc-500">
                        <input
                          type="checkbox"
                          checked={input.required}
                          onChange={(e) => updateInput(name, { required: e.target.checked })}
                          className="h-3 w-3 accent-red-600"
                        />
                        ต้องกรอก
                      </label>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        value={input.widget}
                        onChange={(e) => updateInput(name, { widget: e.target.value })}
                        className="h-8 w-full rounded-md border border-zinc-200 px-1.5 text-[10px] font-bold outline-none focus:border-red-600"
                      >
                        {INPUT_WIDGETS.map((widget) => (
                          <option key={widget} value={widget}>
                            {WIDGET_LABELS[widget]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={input.defaultValue}
                        onChange={(e) => updateInput(name, { defaultValue: e.target.value })}
                        placeholder="ค่าเริ่มต้น (@today, @now, @time ได้)"
                        className="h-8 w-full rounded-md border border-zinc-200 px-1.5 text-[10px] font-semibold outline-none focus:border-red-600"
                      />
                      {input.widget === "select" && (
                        <input
                          type="text"
                          value={input.options.join(", ")}
                          onChange={(e) =>
                            updateInput(name, {
                              options: e.target.value
                                .split(",")
                                .map((option) => option.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="ตัวเลือก คั่นด้วย , เช่น YAYA, Panghou, T002"
                          className="h-8 w-full rounded-md border border-zinc-200 px-1.5 text-[10px] font-semibold outline-none focus:border-red-600 sm:col-span-2"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}

/** The "add a row" form, built from the inputs configured above. */
export function NewRowModal({ editable, onSubmit, onClose }) {
  const fields = useMemo(() => {
    const configured = new Map(editable.inputs.map((input) => [input.column, input]));
    return editable.columns.map(
      (column) =>
        configured.get(column) || {
          column,
          widget: "text",
          options: [],
          defaultValue: "",
          required: false,
        }
    );
  }, [editable]);

  const [values, setValues] = useState(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.column,
        field.widget === "checkbox"
          ? field.defaultValue === "true"
          : resolveInputDefault(field.defaultValue),
      ])
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const missing = fields
    .filter((field) => field.required)
    .filter((field) => {
      const value = values[field.column];
      return value === "" || value === null || value === undefined;
    })
    .map((field) => field.column);

  const submit = async () => {
    if (missing.length > 0) {
      setError(`ยังไม่ได้กรอก: ${missing.join(", ")}`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setValue = (column, value) =>
    setValues((prev) => ({ ...prev, [column]: value }));

  return (
    <ModalShell
      title={`เพิ่มแถวใน ${editable.table}`}
      icon={<Plus size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={submit}
      saveLabel={saving ? "กำลังบันทึก..." : "เพิ่มแถว"}
    >
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
          {error}
        </p>
      )}
      {fields.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-5 text-center text-[11px] font-semibold text-zinc-400">
          ยังไม่ได้เลือกคอลัมน์ที่อนุญาตให้แก้ — ตั้งที่ &quot;ตั้งค่าการแก้ไขข้อมูล&quot; ก่อน
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => {
            const id = `new-row-${field.column}`;
            const value = values[field.column];
            const common = {
              id,
              value: value ?? "",
              onChange: (event) => setValue(field.column, event.target.value),
              className: inputClass,
            };
            return (
              <div
                key={field.column}
                className={field.widget === "textarea" ? "sm:col-span-2" : ""}
              >
                <label htmlFor={id} className={labelClass}>
                  {field.column}
                  {field.required && <span className="ml-1 text-red-600">*</span>}
                </label>
                {field.widget === "select" ? (
                  <select {...common}>
                    <option value="">— ไม่ระบุ —</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : field.widget === "textarea" ? (
                  <textarea
                    {...common}
                    rows={3}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
                  />
                ) : field.widget === "checkbox" ? (
                  <label className="flex h-9 items-center gap-2 text-[11px] font-bold text-zinc-600">
                    <input
                      id={id}
                      type="checkbox"
                      checked={value === true || value === "true"}
                      onChange={(event) => setValue(field.column, event.target.checked)}
                      className="h-4 w-4 accent-red-600"
                    />
                    {value === true || value === "true" ? "ใช่" : "ไม่ใช่"}
                  </label>
                ) : (
                  <input
                    {...common}
                    type={
                      field.widget === "number"
                        ? "number"
                        : field.widget === "date"
                          ? "date"
                          : field.widget === "time"
                            ? "time"
                            : field.widget === "datetime"
                              ? "datetime-local"
                              : "text"
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] font-semibold leading-relaxed text-zinc-500">
        ช่องที่เว้นว่างจะไม่ถูกเขียน — คอลัมน์นั้นจะได้ค่า default ของตารางเอง ·
        เขียนได้เฉพาะคอลัมน์ที่อนุญาตให้แก้ไข ({editable.columns.length} คอลัมน์)
      </p>
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
    scope: "cell",
  });

  const needsValue = !VALUELESS_OPS.includes(form.op);

  return (
    <ModalShell
      title="ระบายสีตามเงื่อนไข"
      icon={<Palette size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={() => onSave(draft)}
    >
      {draft.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-5 text-center text-[11px] font-semibold text-zinc-400">
          ยังไม่มีกฎ — เพิ่มด้านล่าง เช่น &quot;คงเหลือ น้อยกว่า 10 = แดง&quot; หรือ &quot;วันหมดอายุ เลยกำหนดแล้ว = แดงทั้งแถว&quot;
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
                className="rounded px-2 py-1 text-[10px] font-black"
                style={toneStyle(rule.tone) || { backgroundColor: "#f4f4f5", color: "#3f3f46" }}
              >
                {TONE_LABELS[rule.tone]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-700">
                {column?.label || rule.colId} {RULE_OP_LABELS[rule.op] || rule.op}{" "}
                {VALUELESS_OPS.includes(rule.op) ? "" : rule.value}
                {rule.scope === "row" && (
                  <span className="ml-1 rounded bg-zinc-100 px-1 text-[9px] text-zinc-500">
                    ทั้งแถว
                  </span>
                )}
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
            className={`${inputClass} sm:col-span-2`}
          >
            {RULE_OPS.map((op) => (
              <option key={op} value={op}>
                {RULE_OP_LABELS[op] || op}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={form.value}
            disabled={!needsValue}
            onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))}
            placeholder={
              form.op === "dueIn" ? "จำนวนวัน" : needsValue ? "ค่า หรือ [ชื่อคอลัมน์]" : "ไม่ต้องใส่ค่า"
            }
            className={`${inputClass} sm:col-span-2 disabled:bg-zinc-100 disabled:text-zinc-400`}
          />
          <select
            value={form.tone}
            onChange={(e) => setForm((prev) => ({ ...prev, tone: e.target.value }))}
            className={inputClass}
            style={toneStyle(form.tone) || undefined}
          >
            {RULE_TONES.map((tone) => (
              <option key={tone} value={tone}>
                {TONE_LABELS[tone]}
              </option>
            ))}
          </select>
          <select
            value={form.scope}
            onChange={(e) => setForm((prev) => ({ ...prev, scope: e.target.value }))}
            disabled={form.tone === "bar"}
            className={`${inputClass} disabled:bg-zinc-100 disabled:text-zinc-400`}
          >
            <option value="cell">ระบายเฉพาะช่องนี้</option>
            <option value="row">ระบายทั้งแถว</option>
          </select>
          <button
            type="button"
            onClick={() => {
              if (!form.colId) return;
              setDraft((prev) => [
                ...prev,
                {
                  ...form,
                  value: needsValue ? form.value : "",
                  scope: form.tone === "bar" ? "cell" : form.scope,
                },
              ]);
              setForm((prev) => ({ ...prev, value: "" }));
            }}
            className="flex h-9 items-center justify-center gap-1 rounded-lg border border-zinc-300 text-[11px] font-black text-zinc-600 transition hover:bg-white sm:col-span-4"
          >
            <Plus size={12} /> เพิ่มกฎ
          </button>
        </div>
        <p className="mt-2 text-[10px] font-semibold leading-relaxed text-zinc-500">
          ใส่ <code className="rounded bg-white px-1">[ชื่อคอลัมน์]</code> แทนค่าคงที่ได้ เช่น
          &quot;ยอดเข้า น้อยกว่า [ยอดออก]&quot; · เงื่อนไขวันที่อ่าน dd/mm/yyyy และ พ.ศ. ได้ ·
          กฎที่อ้างคอลัมน์ที่ถูกซ่อนไว้จะไม่ทำงาน
        </p>
      </div>
    </ModalShell>
  );
}

const RENDER_LABELS = {
  text: "ข้อความ",
  link: "ลิงก์ (กดเปิดได้)",
  email: "อีเมล (กดส่งเมล)",
  chip: "ป้ายสี",
  copy: "มีปุ่มคัดลอก",
};

const ALIGN_LABELS = { "": "อัตโนมัติ", left: "ซ้าย", center: "กลาง", right: "ขวา" };

function ToneSelect({ value, onChange, label, part }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9px] font-black text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-full rounded-md border border-zinc-200 px-1 text-[10px] font-bold outline-none focus:border-red-600"
        style={toneStyle(value, part) || undefined}
      >
        <option value="">ไม่กำหนด</option>
        {TONE_NAMES.map((tone) => (
          <option key={tone} value={tone}>
            {TONE_LABELS[tone]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Fixed per-column appearance — colour, header band, how the value is drawn —
 * plus how many columns stay pinned while the rest scroll. Unlike RulesModal
 * nothing here depends on the value in the cell.
 */
export function FormatsModal({ columns, formats, freeze, onSave, onClose }) {
  const [draft, setDraft] = useState(() => {
    const initial = {};
    for (const col of columns) initial[col.id] = normalizeFormat(formats?.[col.id]);
    return initial;
  });
  const [pinned, setPinned] = useState(freeze || 0);

  const update = (colId, patch) =>
    setDraft((prev) => ({ ...prev, [colId]: { ...prev[colId], ...patch } }));

  const touched = columns.filter((col) => !isEmptyFormat(draft[col.id])).length;

  return (
    <ModalShell
      title="รูปแบบคอลัมน์"
      icon={<Paintbrush size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={() => {
        // Only the visible columns are listed here, so start from what was
        // saved before — a hidden column keeps the format it already had.
        const formatsOut = { ...(formats || {}) };
        for (const col of columns) {
          if (isEmptyFormat(draft[col.id])) delete formatsOut[col.id];
          else formatsOut[col.id] = draft[col.id];
        }
        onSave({ formats: formatsOut, freeze: pinned });
      }}
    >
      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
        <label htmlFor="freeze-count" className="text-[11px] font-black text-zinc-600">
          ตรึงคอลัมน์ซ้ายไว้
        </label>
        <select
          id="freeze-count"
          value={pinned}
          onChange={(event) => setPinned(Number(event.target.value))}
          className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-bold outline-none focus:border-red-600"
        >
          {Array.from({ length: MAX_FREEZE + 1 }, (_, n) => (
            <option key={n} value={n}>
              {n === 0 ? "ไม่ตรึง" : `${n} คอลัมน์แรก`}
            </option>
          ))}
        </select>
        <span className="text-[10px] font-semibold text-zinc-400">
          {touched > 0 ? `ตั้งรูปแบบไว้ ${touched} คอลัมน์` : "ยังไม่ได้ตั้งรูปแบบคอลัมน์ไหน"}
        </span>
      </div>

      {columns.map((col) => {
        const format = draft[col.id];
        return (
          <div
            key={col.id}
            className={`rounded-xl border px-3 py-2 ${
              isEmptyFormat(format) ? "border-zinc-200" : "border-red-200 bg-red-50/30"
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[11px] font-black text-zinc-700">
                {col.label}
              </span>
              {!isEmptyFormat(format) && (
                <button
                  type="button"
                  onClick={() => update(col.id, EMPTY_FORMAT)}
                  className="shrink-0 rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600"
                  title="ล้างรูปแบบคอลัมน์นี้"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <ToneSelect
                label="สีพื้นทุกแถว"
                value={format.bg}
                onChange={(bg) => update(col.id, { bg })}
              />
              <ToneSelect
                label="สีตัวอักษร"
                value={format.fg}
                onChange={(fg) => update(col.id, { fg })}
              />
              <ToneSelect
                label="สีหัวคอลัมน์"
                part="head"
                value={format.headerBg}
                onChange={(headerBg) => update(col.id, { headerBg })}
              />
              <label className="block">
                <span className="mb-0.5 block text-[9px] font-black text-zinc-400">แสดงเป็น</span>
                <select
                  value={format.render}
                  onChange={(event) => update(col.id, { render: event.target.value })}
                  className="h-7 w-full rounded-md border border-zinc-200 px-1 text-[10px] font-bold outline-none focus:border-red-600"
                >
                  {CELL_RENDERS.map((render) => (
                    <option key={render} value={render}>
                      {RENDER_LABELS[render]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[9px] font-black text-zinc-400">จัดชิด</span>
                <select
                  value={format.align}
                  onChange={(event) => update(col.id, { align: event.target.value })}
                  className="h-7 w-full rounded-md border border-zinc-200 px-1 text-[10px] font-bold outline-none focus:border-red-600"
                >
                  {CELL_ALIGNS.map((align) => (
                    <option key={align || "auto"} value={align}>
                      {ALIGN_LABELS[align]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-end gap-1.5 pb-1 text-[10px] font-bold text-zinc-600">
                <input
                  type="checkbox"
                  checked={format.wrap}
                  onChange={(event) => update(col.id, { wrap: event.target.checked })}
                  className="h-3.5 w-3.5 accent-red-600"
                />
                ตัดบรรทัดข้อความยาว
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[9px] font-black text-zinc-400">
                  หัวกลุ่ม (ชั้นบน)
                </span>
                <input
                  type="text"
                  value={format.group}
                  maxLength={MAX_GROUP_LABEL}
                  onChange={(event) => update(col.id, { group: event.target.value })}
                  placeholder="เช่น ยอด"
                  className="h-7 w-full rounded-md border border-zinc-200 px-1.5 text-[10px] font-semibold outline-none focus:border-red-600"
                />
              </label>
              <ToneSelect
                label="สีหัวกลุ่ม"
                part="head"
                value={format.groupBg}
                onChange={(groupBg) => update(col.id, { groupBg })}
              />
            </div>
          </div>
        );
      })}
      <p className="text-[10px] font-semibold leading-relaxed text-zinc-500">
        สีตามเงื่อนไขจะทับสีพื้นตรงนี้เมื่อเงื่อนไขเป็นจริง · &quot;ตัดบรรทัด&quot;
        ปิดการโหลดแบบหน้าต่างเลื่อน ตารางที่แถวเยอะมากจะช้าลง ·
        คอลัมน์ที่ติดกันและใส่ &quot;หัวกลุ่ม&quot; เหมือนกัน (สีเดียวกันด้วย) จะรวมเป็นหัวเดียวคร่อมกัน
      </p>
    </ModalShell>
  );
}

/**
 * Joins another saved query onto this one. The other query is run once here so
 * its column list can be offered, which also surfaces straight away if it needs
 * parameters or is broken.
 */
export function MergeModal({ query, queries, columnNames, merge, onSave, onClose }) {
  const [queryId, setQueryId] = useState(merge?.queryId ? String(merge.queryId) : "");
  const [on, setOn] = useState(merge?.on || []);
  const [columns, setColumns] = useState(merge?.columns || []);
  const [compare, setCompare] = useState(merge?.compare || []);
  const [otherColumns, setOtherColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const candidates = useMemo(
    () => queries.filter((item) => item.id !== query.id),
    [queries, query.id]
  );

  const loadColumns = useCallback(async (id) => {
    if (!id) {
      setOtherColumns([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiJson(`/api/queries/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params: {} }),
        fallbackError: "ดึงคอลัมน์ของ Query ที่เลือกไม่สำเร็จ",
      });
      setOtherColumns(data.columns.map((col) => col.name));
    } catch (err) {
      setOtherColumns([]);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetch resolves
    loadColumns(queryId);
  }, [queryId, loadColumns]);

  const pairRow = (pair, index, list, setList) => (
    <div key={index} className="flex items-center gap-2">
      <select
        value={pair.left}
        onChange={(e) =>
          setList(list.map((item, i) => (i === index ? { ...item, left: e.target.value } : item)))
        }
        className={inputClass}
      >
        {columnNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <span className="shrink-0 text-[11px] font-black text-zinc-400">=</span>
      <select
        value={pair.right}
        onChange={(e) =>
          setList(list.map((item, i) => (i === index ? { ...item, right: e.target.value } : item)))
        }
        className={inputClass}
      >
        {otherColumns.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setList(list.filter((_, i) => i !== index))}
        className="shrink-0 rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600"
        title="ลบ"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );

  const addPair = (list, setList) =>
    setList([...list, { left: columnNames[0] || "", right: otherColumns[0] || "" }]);

  return (
    <ModalShell
      title="รวมตารางกับอีก Query"
      icon={<Combine size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={() =>
        onSave(
          queryId && on.length > 0
            ? { queryId: Number(queryId), on, columns, compare }
            : null
        )
      }
    >
      <div>
        <label className={labelClass}>Query ที่จะดึงข้อมูลมารวม</label>
        <select
          value={queryId}
          onChange={(e) => {
            setQueryId(e.target.value);
            setOn([]);
            setColumns([]);
            setCompare([]);
          }}
          className={inputClass}
        >
          <option value="">— ไม่รวม —</option>
          {candidates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {loading && (
          <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-zinc-400">
            <Loader2 size={10} className="animate-spin" /> กำลังดึงคอลัมน์...
          </p>
        )}
        {error && <p className="mt-1 text-[10px] font-bold text-red-600">{error}</p>}
      </div>

      {otherColumns.length > 0 && (
        <>
          <div>
            <label className={labelClass}>
              จับคู่แถวโดยเทียบคอลัมน์ (ใส่ได้มากกว่า 1 — ต้องตรงกันทุกข้อ)
            </label>
            <div className="space-y-2">
              {on.map((pair, index) => pairRow(pair, index, on, setOn))}
              <button
                type="button"
                onClick={() => addPair(on, setOn)}
                className="flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 text-[11px] font-black text-zinc-500 transition hover:bg-zinc-50"
              >
                <Plus size={12} /> เพิ่มคู่คอลัมน์
              </button>
            </div>
          </div>

          <div>
            <label className={labelClass}>คอลัมน์ที่จะดึงมาแสดงเพิ่ม</label>
            <div className="flex flex-wrap gap-1">
              {otherColumns.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() =>
                    setColumns((prev) =>
                      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
                    )
                  }
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

          <div>
            <label className={labelClass}>
              เช็คว่าค่าตรงกันไหม (เพิ่มคอลัมน์ ✓ / ✗ ให้ทีละคู่)
            </label>
            <div className="space-y-2">
              {compare.map((pair, index) => pairRow(pair, index, compare, setCompare))}
              <button
                type="button"
                onClick={() => addPair(compare, setCompare)}
                className="flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 text-[11px] font-black text-zinc-500 transition hover:bg-zinc-50"
              >
                <Plus size={12} /> เพิ่มคู่ที่จะเทียบค่า
              </button>
            </div>
          </div>
        </>
      )}
    </ModalShell>
  );
}

/**
 * Click a row here, open another query with values from that row. The target's
 * :parameters are read straight out of its SQL, so the mapping can only point
 * at placeholders that really exist.
 */
export function DrillModal({ query, queries, columnNames, drill, onSave, onClose }) {
  const [queryId, setQueryId] = useState(drill?.queryId ? String(drill.queryId) : "");
  const [map, setMap] = useState(drill?.map || []);

  const candidates = useMemo(
    () => queries.filter((item) => item.id !== query.id),
    [queries, query.id]
  );
  const targetParams = useMemo(() => {
    const target = queries.find((item) => String(item.id) === queryId);
    return target ? extractSqlParams(target.sqlText) : [];
  }, [queries, queryId]);

  return (
    <ModalShell
      title="คลิกแถวเพื่อเปิด Query อื่น (drill-down)"
      icon={<CornerDownRight size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={() =>
        onSave(queryId && map.length > 0 ? { queryId: Number(queryId), map } : null)
      }
    >
      <div>
        <label className={labelClass}>Query ปลายทาง</label>
        <select
          value={queryId}
          onChange={(e) => {
            setQueryId(e.target.value);
            setMap([]);
          }}
          className={inputClass}
        >
          <option value="">— ปิด drill-down —</option>
          {candidates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      {queryId && targetParams.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
          Query ปลายทางยังไม่มีพารามิเตอร์ (`:ชื่อ`) ใน SQL — เพิ่มก่อนถึงจะส่งค่าจากแถวไปได้
        </p>
      )}

      {targetParams.length > 0 && (
        <div>
          <label className={labelClass}>ส่งค่าจากคอลัมน์ไหน ไปเป็นพารามิเตอร์อะไร</label>
          <div className="space-y-2">
            {map.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  value={item.column}
                  onChange={(e) =>
                    setMap(map.map((m, i) => (i === index ? { ...m, column: e.target.value } : m)))
                  }
                  className={inputClass}
                >
                  {columnNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <span className="shrink-0 text-[11px] font-black text-zinc-400">→</span>
                <select
                  value={item.param}
                  onChange={(e) =>
                    setMap(map.map((m, i) => (i === index ? { ...m, param: e.target.value } : m)))
                  }
                  className={inputClass}
                >
                  {targetParams.map((name) => (
                    <option key={name} value={name}>
                      :{name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setMap(map.filter((_, i) => i !== index))}
                  className="shrink-0 rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600"
                  title="ลบ"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setMap([...map, { column: columnNames[0] || "", param: targetParams[0] }])
              }
              className="flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 text-[11px] font-black text-zinc-500 transition hover:bg-zinc-50"
            >
              <Plus size={12} /> เพิ่มการส่งค่า
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/**
 * Paste a block copied out of Excel and write it back row by row. The header
 * line names the columns; one of them has to be the key column so each line
 * can be matched to a row.
 */
export function BulkEditModal({ editable, columnNames, onApply, onClose }) {
  const [text, setText] = useState("");
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);

  const parsed = useMemo(() => {
    const lines = text.trim().split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return null;
    const headers = lines[0].split("\t").map((cell) => cell.trim());
    const rows = lines.slice(1).map((line) => line.split("\t").map((cell) => cell.trim()));
    const keyIndex = headers.indexOf(editable.pk);
    const targets = headers
      .map((name, index) => ({ name, index }))
      .filter((item) => item.index !== keyIndex && editable.columns.includes(item.name));
    return { headers, rows, keyIndex, targets };
  }, [text, editable]);

  const problems = [];
  if (parsed) {
    if (parsed.keyIndex === -1) problems.push(`ไม่พบคอลัมน์ key "${editable.pk}" ในบรรทัดหัวตาราง`);
    if (parsed.targets.length === 0) {
      problems.push(
        `ไม่มีคอลัมน์ที่แก้ได้เลย — อนุญาตไว้: ${editable.columns.join(", ") || "(ยังไม่ได้ตั้ง)"}`
      );
    }
  }

  const apply = async () => {
    setApplying(true);
    setResult(null);
    const edits = [];
    for (const row of parsed.rows) {
      const pkValue = row[parsed.keyIndex];
      if (!pkValue) continue;
      for (const target of parsed.targets) {
        edits.push({ pkValue, column: target.name, value: row[target.index] ?? "" });
      }
    }
    const outcome = await onApply(edits);
    setResult(outcome);
    setApplying(false);
  };

  return (
    <ModalShell
      title="แก้หลายแถวจาก Excel"
      icon={<ClipboardPaste size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={apply}
      saveLabel={applying ? "กำลังบันทึก..." : "เขียนกลับฐานข้อมูล"}
    >
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
        คัดลอกจาก Excel/Sheets มาวางได้เลย บรรทัดแรกต้องเป็นชื่อคอลัมน์ และต้องมีคอลัมน์{" "}
        <code className="font-mono">{editable.pk}</code> เพื่อบอกว่าจะแก้แถวไหน
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder={`${editable.pk}\t${editable.columns[0] || "คอลัมน์"}\n1\t100\n2\t250`}
        className="w-full rounded-lg border border-zinc-200 bg-zinc-900 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-emerald-300 outline-none focus:border-red-600"
      />
      <p className="text-[10px] font-semibold text-zinc-400">
        คอลัมน์ที่มีอยู่ในผลลัพธ์: {columnNames.join(", ")}
      </p>

      {problems.map((problem) => (
        <div
          key={problem}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600"
        >
          {problem}
        </div>
      ))}

      {parsed && problems.length === 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
          จะแก้ {parsed.rows.length} แถว × {parsed.targets.length} คอลัมน์ (
          {parsed.targets.map((target) => target.name).join(", ")}) = {" "}
          {parsed.rows.length * parsed.targets.length} เซลล์
        </div>
      )}

      {result && (
        <div className="space-y-1 rounded-lg border border-zinc-200 px-3 py-2 text-[11px] font-bold">
          <p className="text-emerald-700">สำเร็จ {result.ok} เซลล์</p>
          {result.failed.length > 0 && (
            <div className="text-red-600">
              <p>ไม่สำเร็จ {result.failed.length} เซลล์:</p>
              <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-4 font-semibold">
                {result.failed.slice(0, 20).map((failure, index) => (
                  <li key={index}>
                    {failure.pkValue} · {failure.column}: {failure.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
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
