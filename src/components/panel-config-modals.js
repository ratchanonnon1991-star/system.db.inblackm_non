"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChartColumn,
  ChevronDown,
  ClipboardPaste,
  Code2,
  Combine,
  CornerDownRight,
  Database,
  Link2,
  Loader2,
  Paintbrush,
  Palette,
  Play,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import MissingNotice from "@/components/missing-notice";
import ModalResizeHandle from "@/components/modal-resize-handle";
import HueSlider from "@/components/hue-slider";
import { useResizableModalWidth } from "@/lib/use-resizable-modal-width";
import { isSafeIdentifier, isSafeIdentifierPart } from "@/lib/gamedb-identifier";
import { extractSqlParams, parseSelectAliases } from "@/lib/gamedb-sql-params";
import { buildVisualInsert } from "@/lib/gamedb-visual-query";
import {
  applyGroupTone,
  CELL_ALIGNS,
  CELL_RENDERS,
  EMPTY_FORMAT,
  INPUT_WIDGETS,
  isEmptyFormat,
  MAX_FREEZE,
  MAX_GROUP_LABEL,
  MAX_LOOKUPS,
  normalizeFormat,
  parseOption,
  PARAM_TYPES,
  resolveInputDefault,
  widgetForColumn,
  RULE_OP_LABELS,
  RULE_OPS,
  TABLE_TONES,
  TONE_NAMES,
  toneLabel,
  toneStyle,
  toneTextColor,
  VALUELESS_OPS,
} from "@/lib/gamedb-layout";

const inputClass =
  "h-9 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white";
const labelClass = "mb-1 block text-[10px] font-black text-zinc-500";

function ModalShell({
  title,
  icon,
  onClose,
  children,
  onSave,
  saveLabel = "บันทึก",
  // A save that refuses to do anything must not look like a save that works:
  // the reason lives in the body, and the button says it is not available.
  saveDisabled = false,
  saveDisabledReason = "",
  // Clearing a setting used to happen by saving an unfinished form, which
  // meant every half-filled form silently deleted whatever was there before.
  // Removing is now something you ask for.
  onRemove = null,
  removeLabel = "ลบการตั้งค่านี้",
}) {
  const { width, startResize, resizing } = useResizableModalWidth(576);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div
        className="relative flex max-h-[90vh] w-full flex-col rounded-sm bg-white p-5 shadow-xl"
        style={{ maxWidth: width }}
      >
        <ModalResizeHandle onPointerDown={startResize} active={resizing} />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-black">
            {icon} {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-50"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">{children}</div>
        <div className="mt-4 flex items-center justify-end gap-2">
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="mr-auto rounded-xl border border-red-200 px-4 py-2.5 text-[11px] font-black text-red-600 transition hover:bg-red-50"
            >
              {removeLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled}
            title={saveDisabled ? saveDisabledReason : undefined}
            className="flex items-center gap-1.5 rounded-sm bg-red-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save size={13} /> {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Turning a table into a link that needs no account is the one action here that
 * changes who can see the data, so the modal says plainly what the link does and
 * keeps revoking one click away.
 */
export function ShareLinkModal({ queryId, onClose }) {
  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiJson(`/api/queries/${queryId}/share`, { fallbackError: "อ่านสถานะการแชร์ไม่สำเร็จ" })
      .then((data) => {
        if (!cancelled) setShare(data.share);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryId]);

  const url = share ? `${window.location.origin}/s/${share.token}` : "";

  const call = async (method) => {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson(`/api/queries/${queryId}/share`, {
        method,
        fallbackError: "ทำรายการไม่สำเร็จ",
      });
      setShare(data.share);
      setCopied(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-sm bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <Link2 size={15} /> แชร์เป็นลิงก์ (ดูอย่างเดียว)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-50"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
            {error}
          </p>
        )}

        {loading ? (
          <p className="flex items-center gap-2 py-6 text-xs font-semibold text-zinc-400">
            <Loader2 size={14} className="animate-spin" /> กำลังตรวจสถานะ...
          </p>
        ) : share ? (
          <>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={url}
                onFocus={(event) => event.target.select()}
                className={`${inputClass} font-mono`}
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(url);
                  setCopied(true);
                }}
                className="shrink-0 rounded-sm bg-red-600 px-4 py-2 text-[11px] font-black text-white transition hover:bg-red-700"
              >
                {copied ? "คัดลอกแล้ว" : "คัดลอก"}
              </button>
            </div>
            <p className="mt-3 text-[11px] font-semibold leading-relaxed text-zinc-500">
              ใครที่มีลิงก์นี้เปิดดูตารางได้โดยไม่ต้องล็อกอิน และเห็นข้อมูลล่าสุดทุกครั้งที่เปิด
              แก้ไขข้อมูล บันทึก layout หรือเปิด Query อื่นไม่ได้ และ SQL ไม่ถูกส่งออกไปกับลิงก์
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => call("DELETE")}
                className="rounded-sm border border-red-200 px-4 py-2 text-[11px] font-black text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                ยกเลิกลิงก์นี้
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold leading-relaxed text-zinc-500">
              สร้างลิงก์เพื่อให้คนที่ไม่มีบัญชีเปิดดูตารางนี้ได้ เห็นข้อมูลอย่างเดียว
              แก้ไขไม่ได้ และยกเลิกลิงก์เมื่อไหร่ก็ได้
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => call("POST")}
                className="flex items-center gap-1.5 rounded-sm bg-red-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                <Link2 size={13} /> สร้างลิงก์
              </button>
            </div>
          </>
        )}
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

  // The dropdown options are edited as one comma-separated line. Parsing every
  // keystroke would eat the comma the moment it is typed, so the raw text is
  // kept as typed and only the parsed list goes into the draft.
  const [optionsText, setOptionsText] = useState(() =>
    Object.fromEntries(draft.map((param) => [param.name, (param.options || []).join(", ")]))
  );

  const setField = (name, key, value) =>
    setDraft((prev) =>
      prev.map((param) => (param.name === name ? { ...param, [key]: value } : param))
    );

  const setOptions = (name, text) => {
    setOptionsText((prev) => ({ ...prev, [name]: text }));
    setField(
      name,
      "options",
      text
        .split(",")
        .map((option) => option.trim())
        .filter(Boolean)
    );
  };

  return (
    <ModalShell
      title="พารามิเตอร์ของ Query"
      icon={<SlidersHorizontal size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={() => onSave(draft)}
    >
      {names.length === 0 ? (
        <p className="rounded-sm border border-dashed border-zinc-300 px-4 py-6 text-center text-[11px] font-semibold text-zinc-400">
          ยังไม่พบพารามิเตอร์ใน SQL — เขียน <code className="font-mono">:ชื่อ</code> ใน
          SQL เช่น <code className="font-mono">WHERE created_at &gt;= :from</code>{" "}
          แล้วกลับมาตั้งค่าที่นี่
        </p>
      ) : (
        draft.map((param) => (
          <div key={param.name} className="rounded-sm border border-zinc-200 p-3">
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
                    value={optionsText[param.name] ?? ""}
                    onChange={(e) => setOptions(param.name, e.target.value)}
                    placeholder="เช่น TRUEMONEY, BANK, CREDIT"
                    className={inputClass}
                  />
                  <p className="mt-1 text-[9px] font-semibold text-zinc-400">
                    {(param.options || []).length > 0
                      ? `${param.options.length} ตัวเลือก: ${param.options.join(" / ")}`
                      : "ยังไม่มีตัวเลือก — พิมพ์แล้วคั่นด้วย ,"}
                  </p>
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
  select: "เลือกจากรายการที่พิมพ์เอง",
  lookup: "เลือกจากอีกตาราง (FK)",
  textarea: "ข้อความหลายบรรทัด",
  checkbox: "ใช่ / ไม่ใช่",
};

/** Which table/rows this query is allowed to write back to. */
// A result column named "ซ้ำ/ไม่ซ้ำ" and a DB column named "is_duplicate" will
// never match by spelling, but "createdAt" and "created_at" should — this is
// the only normalisation worth doing before giving up and asking the user.
const normalizeForMatch = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function guessRealColumn(resultName, table) {
  if (!table) return "";
  const needle = normalizeForMatch(resultName);
  const hit = table.columns.find((column) => normalizeForMatch(column.name) === needle);
  return hit ? hit.name : "";
}

export function EditableSettingsModal({
  queryId,
  connectionId,
  columnNames,
  editable,
  sqlText,
  onSave,
  onClose,
}) {
  const [table, setTable] = useState(editable?.table || "");
  const [pk, setPk] = useState(editable?.pk || "");
  const [pkColumn, setPkColumn] = useState(editable?.pkColumn || "");
  const [columns, setColumns] = useState(editable?.columns || []);
  const [columnMap, setColumnMap] = useState(() => editable?.columnMap || {});
  // No longer settable: adding data goes through the saved INSERT form. Kept so
  // a config saved before that change round-trips unchanged instead of being
  // silently rewritten by opening this modal.
  const allowInsert = editable?.allowInsert || false;
  const [allowDelete, setAllowDelete] = useState(editable?.allowDelete || false);
  const [inputs, setInputs] = useState(() => editable?.inputs || []);

  // A result column can be a display label with no relation to any real
  // column ("ซ้ำ/ไม่ซ้ำ" for is_duplicate) -- defaulting the real-name box to
  // that label just hands back something guaranteed to fail the SQL-quoting
  // check. Default to it only when it could plausibly BE the real name.
  const realColumn = (name) => columnMap[name] ?? (isSafeIdentifierPart(name) ? name : "");
  const setRealColumn = (name, value) =>
    setColumnMap((prev) => ({ ...prev, [name]: value }));

  // Loaded once so the table-name box can be matched against real columns —
  // an admin who already knows every column name pays only the one request.
  const [schemaData, setSchemaData] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSchemaLoading(true);
    (async () => {
      try {
        const suffix = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : "";
        const data = await apiJson(`/api/query-builder/schema${suffix}`, {
          fallbackError: "โหลดรายการตารางและคอลัมน์ไม่สำเร็จ",
        });
        if (!cancelled) setSchemaData(data);
      } catch {
        // Silent: this is a convenience guess, not a required step — the
        // text boxes below still work by hand if the schema can't be read.
      } finally {
        if (!cancelled) setSchemaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  const matchedTable = useMemo(() => {
    const typed = table.trim();
    if (!typed || !schemaData?.tables) return null;
    const [typedSchema, typedName] = typed.includes(".") ? typed.split(".", 2) : [null, typed];
    return (
      schemaData.tables.find((candidate) =>
        typedSchema
          ? candidate.schema.toLowerCase() === typedSchema.toLowerCase() &&
            candidate.name.toLowerCase() === typedName.toLowerCase()
          : candidate.name.toLowerCase() === typedName.toLowerCase()
      ) || null
    );
  }, [table, schemaData]);

  // The query text itself already says which real column an aliased result
  // column came from -- "is_repeatable AS "ซ้ำ/ไม่ซ้ำ"" needs no guessing at
  // all, schema or otherwise. Tried first; the schema-based guess below only
  // covers what the SQL doesn't say (a bare `SELECT *`, say).
  const sqlAliasMap = useMemo(() => parseSelectAliases(sqlText || ""), [sqlText]);

  // Only fill boxes the admin has not touched — someone who typed a real
  // column name by hand should never have it silently swapped back.
  const touchedPkColumn = useRef(Boolean(editable?.pkColumn));
  const touchedColumns = useRef(new Set(Object.keys(editable?.columnMap || {})));

  useEffect(() => {
    if (touchedPkColumn.current || !pk) return;
    const fromSql = sqlAliasMap[pk];
    if (fromSql && fromSql !== pk) {
      setPkColumn(fromSql);
      return;
    }
    if (!matchedTable) return;
    const guess =
      matchedTable.primaryKey.length === 1
        ? matchedTable.primaryKey[0]
        : guessRealColumn(pk, matchedTable);
    if (guess && guess !== pk) setPkColumn(guess);
  }, [matchedTable, pk, sqlAliasMap]);

  useEffect(() => {
    for (const name of columns) {
      if (touchedColumns.current.has(name) || columnMap[name]) continue;
      const fromSql = sqlAliasMap[name];
      if (fromSql && fromSql !== name) {
        setRealColumn(name, fromSql);
        continue;
      }
      if (!matchedTable) continue;
      const guess = guessRealColumn(name, matchedTable);
      if (guess && guess !== name) setRealColumn(name, guess);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedTable, columns, sqlAliasMap]);

  const toggle = (name) =>
    setColumns((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );

  const inputFor = (name) =>
    inputs.find((input) => input.column === name) || {
      column: name,
      widget: "text",
      options: [],
      lookup: null,
      defaultValue: "",
      required: false,
    };

  // The options are one comma-separated line, and the parsed list cannot be the
  // value of the box that produces it: parsing on every keystroke drops the
  // comma the moment it is typed, and eats a trailing space before the next
  // option can be started. Same trap as the parameter modal.
  const [optionsText, setOptionsText] = useState(() =>
    Object.fromEntries(
      (editable?.inputs || []).map((input) => [input.column, (input.options || []).join(", ")])
    )
  );

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
  // The commonest way to get this wrong is the capitalisation of an alias, so
  // say which one was meant rather than only that this one is missing.
  const pkNearMiss = pkInResult
    ? ""
    : columnNames.find((name) => name.toLowerCase() === pk.trim().toLowerCase()) || "";

  const draft =
    table.trim() && pk.trim()
      ? {
          table: table.trim(),
          pk: pk.trim(),
          pkColumn: pkColumn.trim(),
          columns,
          columnMap: Object.fromEntries(
            columns
              .map((name) => [name, (columnMap[name] ?? "").trim()])
              .filter(([name, real]) => real && real !== name)
          ),
          allowInsert,
          allowDelete,
          inputs: inputs.filter((input) => columns.includes(input.column)),
        }
      : null;

  // A result column is a label — "VPN / NO VPN" is a perfectly good one — but
  // the column it maps to is quoted into SQL, so the server drops anything it
  // cannot quote. It used to do that silently: the column looked selected here,
  // and after saving it was simply not editable. Say so before the save instead.
  const unquotableColumns = columns.filter(
    (name) => !isSafeIdentifierPart((columnMap[name] ?? "").trim() || name)
  );
  const pkUnquotable = Boolean(
    draft && !isSafeIdentifierPart(pkColumn.trim() || pk.trim())
  );
  const tableUnquotable = Boolean(draft && !isSafeIdentifier(table.trim()));
  const blocked = unquotableColumns.length > 0 || pkUnquotable || tableUnquotable;
  const missing = [
    !table.trim() && "ชื่อตารางที่จะเขียนกลับ",
    !pk.trim() && "คอลัมน์ที่เป็น key",
    pk.trim() && columns.length === 0 && "คอลัมน์ที่อนุญาตให้แก้ อย่างน้อย 1 คอลัมน์",
  ].filter(Boolean);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState("");
  const [showAllSql, setShowAllSql] = useState(false);

  const runTest = async () => {
    setTesting(true);
    setTestError("");
    setTestResult(null);
    try {
      const data = await apiJson(`/api/queries/${queryId}/editable-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editable: draft }),
        fallbackError: "ทดสอบการตั้งค่าไม่สำเร็จ",
      });
      setTestResult(data);
    } catch (err) {
      setTestError(err.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <ModalShell
      title="ตั้งค่าการแก้ไขข้อมูล"
      icon={<Table2 size={15} className="text-red-600" />}
      onClose={onClose}
      saveDisabled={blocked || missing.length > 0}
      saveDisabledReason={
        missing.length > 0
          ? `ยังไม่ได้กรอก: ${missing.join(", ")}`
          : "ยังมีชื่อคอลัมน์/ตารางที่ใช้กับ SQL ไม่ได้ — ดูข้อความสีแดงด้านบน"
      }
      onRemove={
        editable
          ? () => {
              onSave(null);
              onClose();
            }
          : null
      }
      removeLabel="ปิดการแก้ไขข้อมูลของ Query นี้"
      onSave={() => {
        if (blocked || missing.length > 0) return;
        onSave(draft);
      }}
    >
      <MissingNotice items={missing} />
      {blocked && (
        <div className="rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-red-700">
          บันทึกไม่ได้จนกว่าจะแก้ตรงนี้ — ชื่อคอลัมน์จริงในตารางห้ามมีอักขระอย่าง{" "}
          <code className="font-mono">/</code> <code className="font-mono">.</code>{" "}
          <code className="font-mono">(</code> หรือ <code className="font-mono">&quot;</code>
          {tableUnquotable && <> · ชื่อตาราง &quot;{table.trim()}&quot; ใช้ไม่ได้</>}
          {pkUnquotable && (
            <> · คอลัมน์ key — กรอกช่อง &quot;ชื่อจริงในตาราง&quot; ให้ตรงกับชื่อใน DB</>
          )}
          {unquotableColumns.length > 0 && (
            <>
              {" "}
              · กรอกชื่อจริงให้คอลัมน์: {unquotableColumns.join(", ")}
            </>
          )}
        </div>
      )}
      <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
        เปิดแล้ว Admin จะดับเบิลคลิกแก้ค่าในตารางได้ ระบบจะเขียน UPDATE กลับไปที่ตารางนี้
        ทีละ 1 แถว และบันทึกลง log ทุกครั้ง (staff แก้ไม่ได้)
      </p>

      <div className="rounded-sm border border-zinc-200 bg-zinc-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black text-zinc-500">
            ทดสอบกับฐานข้อมูลจริง — อ่านเท่านั้น ไม่เขียนอะไร
          </span>
          <button
            type="button"
            onClick={runTest}
            disabled={testing || !draft || !queryId}
            className="flex shrink-0 items-center gap-1.5 rounded-sm border border-zinc-300 bg-white px-3 py-1.5 text-[10px] font-black text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-40"
          >
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            ทดสอบการตั้งค่า
          </button>
        </div>

        {!draft && (
          <p className="mt-2 text-[10px] font-bold text-zinc-400">
            กรอกชื่อตารางกับคอลัมน์ key ก่อน แล้วจะกดทดสอบได้
          </p>
        )}

        {testError && (
          <p className="mt-2 rounded-sm border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] font-bold text-red-600">
            {testError}
          </p>
        )}

        {testResult && (
          <div className="mt-2 space-y-2">
            <p
              className={`text-[11px] font-black ${
                testResult.ok ? "text-emerald-700" : "text-red-600"
              }`}
            >
              {testResult.ok
                ? "ผ่านทุกข้อ — แก้ข้อมูลได้"
                : "มีข้อที่ยังไม่ผ่าน — ดูรายการด้านล่าง"}
            </p>

            <ul className="space-y-1">
              {testResult.checks.map((check, index) => (
                <li
                  key={`${check.label}:${index}`}
                  className="flex gap-1.5 text-[10px] font-semibold leading-relaxed"
                >
                  <span className={check.ok ? "text-emerald-600" : "text-red-600"}>
                    {check.ok ? "✓" : "✗"}
                  </span>
                  <span className="min-w-0">
                    <span className={check.ok ? "text-zinc-700" : "font-black text-red-600"}>
                      {check.label}
                    </span>
                    {check.detail ? (
                      <span className="block break-words text-zinc-500">{check.detail}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>

            {(testResult.groups || []).length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowAllSql((value) => !value)}
                  className="flex w-full items-center justify-between gap-2 rounded-sm border border-zinc-300 bg-white px-2 py-1.5 text-[10px] font-black text-zinc-700 transition hover:bg-zinc-100"
                >
                  <span className="flex items-center gap-1.5">
                    <Code2 size={12} />
                    {showAllSql ? "ซ่อนคำสั่งทั้งหมด" : "แสดงคำสั่งทั้งหมดที่ระบบจะยิง"}
                  </span>
                  <ChevronDown
                    size={12}
                    className={showAllSql ? "rotate-180 transition" : "transition"}
                  />
                </button>

                {showAllSql && (
                  <div className="mt-2 space-y-3">
                    {testResult.groups.map((group) => (
                      <div key={group.action}>
                        <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-black text-zinc-600">
                          {group.action}
                          {!group.always && (
                            <span className="rounded bg-zinc-200 px-1 py-0.5 text-[9px] font-black text-zinc-500">
                              ยังไม่ได้เปิด
                            </span>
                          )}
                        </p>
                        <div className="mt-1 space-y-1.5">
                          {group.statements.map((statement) => (
                            <div key={statement.label}>
                              <p className="text-[10px] font-bold text-zinc-400">
                                {statement.label}
                              </p>
                              <pre className="mt-0.5 overflow-x-auto rounded-sm border border-zinc-200 bg-white px-2 py-1.5 font-mono text-[10px] leading-relaxed text-zinc-700">
{statement.sql}
                              </pre>
                            </div>
                          ))}
                        </div>
                        {group.note && (
                          <p className="mt-1 text-[10px] font-semibold leading-relaxed text-zinc-400">
                            {group.note}
                          </p>
                        )}
                      </div>
                    ))}
                    <p className="text-[10px] font-semibold leading-relaxed text-zinc-400">
                      ค่าทุกตัวส่งเป็นพารามิเตอร์ ($1, $2 …) ไม่ต่อเป็นสตริง และทุกคำสั่งที่เขียน
                      รันใน transaction เดียว ถ้าผลไม่ตรงจะ rollback ทั้งชุด
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
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
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>คอลัมน์ที่เป็น key — ชื่อในผลลัพธ์ของ Query</label>
          <select value={pk} onChange={(e) => setPk(e.target.value)} className={inputClass}>
            <option value="">— เลือกคอลัมน์ —</option>
            {columnNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {pk && !pkInResult && <option value={pk}>{pk} (ไม่มีในผลลัพธ์)</option>}
          </select>
          {!pkInResult && (
            <p className="mt-1 text-[10px] font-bold text-red-600">
              ผลลัพธ์ไม่มี &quot;{pk}&quot;
              {pkNearMiss ? ` — มี "${pkNearMiss}" ตัวพิมพ์ไม่ตรงกัน` : " — เพิ่มเข้าไปใน SELECT ก่อน"}
            </p>
          )}
        </div>
        <div>
          <label className={labelClass}>ชื่อจริงในตาราง (เว้นว่าง = ใช้ชื่อเดียวกัน)</label>
          <input
            type="text"
            value={pkColumn}
            onChange={(e) => {
              touchedPkColumn.current = true;
              setPkColumn(e.target.value);
            }}
            placeholder={pk ? `เช่น ${pk.toLowerCase()}` : "เช่น id"}
            className={inputClass}
          />
          {matchedTable && !pkColumn.trim() && (
            <p className="mt-1 text-[10px] font-semibold text-emerald-600">
              พบตาราง &quot;{matchedTable.key}&quot; แล้ว — เดาคอลัมน์ให้อัตโนมัติถ้าชื่อไม่ตรงกัน
            </p>
          )}
          {table.trim() && !schemaLoading && !matchedTable && (
            <p className="mt-1 text-[10px] font-semibold text-zinc-400">
              ไม่พบตาราง &quot;{table.trim()}&quot; ในสคีมา — เดาให้ไม่ได้ กรอกชื่อคอลัมน์เอง
            </p>
          )}
        </div>
      </div>
      {pk && (pkColumn.trim() || pk) && (
        <p className="rounded-sm bg-zinc-50 px-3 py-2 font-mono text-[10px] font-semibold text-zinc-500">
          WHERE &quot;{pkColumn.trim() || pk}&quot; = ค่าจากคอลัมน์ &quot;{pk}&quot; ของแถวนั้น
        </p>
      )}
      <div>
        <label className={labelClass}>คอลัมน์ที่อนุญาตให้แก้</label>
        <div className="flex flex-wrap gap-1">
          {columnNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className={`rounded-sm border px-2.5 py-1 text-[10px] font-bold transition ${
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

      {columns.length > 0 && (
        <div className="rounded-sm border border-zinc-200 p-3">
          <p className="mb-1 text-[10px] font-black text-zinc-500">คอลัมน์ที่เขียนได้</p>
          <p className="mb-2 text-[10px] font-semibold leading-relaxed text-zinc-500">
            ชื่อทางซ้ายคือหัวคอลัมน์ที่ Query ตั้งด้วย <code>AS</code> — คอลัมน์ที่เขียนใน SQL แบบ{" "}
            <code>column AS &quot;ชื่อ&quot;</code> ระบบอ่านชื่อจริงจาก Query ให้อัตโนมัติแล้ว ไม่ต้อง
            กรอกเอง ที่เหลือ{" "}
            {matchedTable
              ? "เลือกคอลัมน์จริงในตารางจากรายการทางขวาได้เลย (พบตารางแล้ว)"
              : "กรอกชื่อคอลัมน์จริงในตารางเอง"}{" "}
            · ช่องนี้ใช้ทั้งตอนดับเบิลคลิกแก้ในตารางและตอนเพิ่มแถว · คอลัมน์ที่มาจากการคำนวณ
            (<code>CASE ...</code>) เขียนกลับไม่ได้ ให้เอาออกจากรายการด้านบน
          </p>
          <div className="space-y-2">
            {columns.map((name) => {
              const input = inputFor(name);
              return (
                <div key={name} className="rounded-sm border border-zinc-200 px-2.5 py-2">
                  <div className="mb-1.5 grid grid-cols-2 items-center gap-2">
                    <span
                      className="min-w-0 truncate text-[11px] font-black text-zinc-700"
                      title={name}
                    >
                      {name}
                    </span>
                    {matchedTable ? (
                      <select
                        value={realColumn(name)}
                        onChange={(e) => {
                          touchedColumns.current.add(name);
                          setRealColumn(name, e.target.value);
                        }}
                        className="h-8 w-full rounded-sm border border-zinc-200 px-1.5 font-mono text-[10px] font-semibold outline-none focus:border-red-600"
                      >
                        <option value="">— เลือกคอลัมน์จริงในตาราง —</option>
                        {matchedTable.columns.map((column) => (
                          <option key={column.name} value={column.name}>
                            {column.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={realColumn(name)}
                        onChange={(e) => {
                          touchedColumns.current.add(name);
                          setRealColumn(name, e.target.value);
                        }}
                        placeholder={`ชื่อจริง (${name})`}
                        className="h-8 w-full rounded-sm border border-zinc-200 px-2 font-mono text-[10px] font-semibold outline-none focus:border-red-600"
                      />
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      value={input.widget}
                      onChange={(e) => updateInput(name, { widget: e.target.value })}
                      className="h-8 w-full rounded-sm border border-zinc-200 px-1.5 text-[10px] font-bold outline-none focus:border-red-600"
                    >
                      {INPUT_WIDGETS.map((widget) => (
                        <option key={widget} value={widget}>
                          {WIDGET_LABELS[widget]}
                        </option>
                      ))}
                    </select>
                    <label className="flex h-8 items-center gap-1.5 text-[10px] font-bold text-zinc-500">
                      <input
                        type="checkbox"
                        checked={input.required}
                        onChange={(e) => updateInput(name, { required: e.target.checked })}
                        className="h-3 w-3 accent-red-600"
                      />
                      ต้องกรอก (ตอนเพิ่มแถว)
                    </label>
                    {input.widget === "select" && (
                      <input
                        type="text"
                        value={optionsText[name] ?? input.options.join(", ")}
                        onChange={(e) => {
                          setOptionsText((prev) => ({ ...prev, [name]: e.target.value }));
                          updateInput(name, {
                            options: e.target.value
                              .split(",")
                              .map((option) => option.trim())
                              .filter(Boolean),
                          });
                        }}
                        placeholder="ตัวเลือก คั่นด้วย , — ใส่ ป้าย = ค่าที่เก็บ ได้"
                        className="h-8 w-full rounded-sm border border-zinc-200 px-1.5 text-[10px] font-semibold outline-none focus:border-red-600 sm:col-span-2"
                      />
                    )}
                    {input.widget === "lookup" && (
                      <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
                        <input
                          type="text"
                          value={input.lookup?.table || ""}
                          onChange={(e) =>
                            updateInput(name, {
                              lookup: { ...(input.lookup || {}), table: e.target.value },
                            })
                          }
                          placeholder="ตารางต้นทาง เช่น topup.game"
                          className="h-8 w-full rounded-sm border border-zinc-200 px-1.5 font-mono text-[10px] font-semibold outline-none focus:border-red-600"
                        />
                        <input
                          type="text"
                          value={input.lookup?.labelColumn || ""}
                          onChange={(e) =>
                            updateInput(name, {
                              lookup: { ...(input.lookup || {}), labelColumn: e.target.value },
                            })
                          }
                          placeholder="คอลัมน์ที่โชว์ เช่น name"
                          className="h-8 w-full rounded-sm border border-zinc-200 px-1.5 font-mono text-[10px] font-semibold outline-none focus:border-red-600"
                        />
                        <input
                          type="text"
                          value={input.lookup?.valueColumn || ""}
                          onChange={(e) =>
                            updateInput(name, {
                              lookup: { ...(input.lookup || {}), valueColumn: e.target.value },
                            })
                          }
                          placeholder="คอลัมน์ที่เก็บ เช่น id"
                          className="h-8 w-full rounded-sm border border-zinc-200 px-1.5 font-mono text-[10px] font-semibold outline-none focus:border-red-600"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] font-semibold leading-relaxed text-zinc-500">
            ตัวเลือกที่แสดงกับค่าที่เก็บลงฐานข้อมูลต่างกันได้ — เขียน{" "}
            <code>Bot Auto = BOT_AUTO, Manual = MANUAL</code> จะโชว์ &quot;Bot Auto&quot; แต่เขียน{" "}
            <code>BOT_AUTO</code> ลงตาราง
          </p>
        </div>
      )}

      <div className="rounded-sm border border-zinc-200 p-3">
        <p className="mb-2 text-[10px] font-black text-zinc-500">ลบทั้งแถว</p>
        <label className="flex items-center gap-2 text-[11px] font-bold text-zinc-600">
          <input
            type="checkbox"
            checked={allowDelete}
            onChange={(e) => setAllowDelete(e.target.checked)}
            className="h-3.5 w-3.5 accent-red-600"
          />
          ให้ลบแถวได้ (ปุ่ม 🗑 ท้ายเลขแถว — ถามยืนยันก่อนเสมอ)
        </label>
        {allowDelete && (
          <p className="mt-2 rounded-sm border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-red-600">
            การลบไม่มีปุ่มย้อนกลับ ระบบจะเก็บค่าของแถวที่ลบไว้ใน log เท่านั้น
          </p>
        )}
      </div>

    </ModalShell>
  );
}

/** The "add a row" form, built from the inputs configured above. */
export function NewRowModal({
  editable,
  lookupOptions = {},
  resultColumns = [],
  onSubmit,
  onClose,
}) {
  const fields = useMemo(() => {
    const configured = new Map(editable.inputs.map((input) => [input.column, input]));
    const byName = new Map(resultColumns.map((column) => [column.name, column]));
    return editable.columns.map(
      (column) =>
        configured.get(column) || {
          column,
          // Same fallback the table's own editor uses, so a boolean column is
          // a true/false box in both places.
          widget: widgetForColumn(byName.get(column)),
          options: [],
          lookup: null,
          defaultValue: "",
          required: false,
          integer: byName.get(column)?.integer === true,
        }
    );
  }, [editable, resultColumns]);

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
        <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
          {error}
        </p>
      )}
      {fields.length === 0 ? (
        <p className="rounded-sm border border-dashed border-zinc-300 px-4 py-5 text-center text-[11px] font-semibold text-zinc-400">
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
                {field.widget === "select" || field.widget === "lookup" ? (
                  <select {...common}>
                    <option value="">— ไม่ระบุ —</option>
                    {(field.widget === "lookup"
                      ? lookupOptions[field.column] || []
                      : field.options.map(parseOption)
                    ).map((option) => (
                      <option key={String(option.value)} value={String(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.widget === "textarea" ? (
                  <textarea
                    {...common}
                    rows={3}
                    className="w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
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
                ) : field.widget === "boolean" ? (
                  // A boolean column may also be null, so it gets three states.
                  <select {...common}>
                    <option value="">— ไม่ระบุ —</option>
                    <option value="true">true (ใช่)</option>
                    <option value="false">false (ไม่ใช่)</option>
                  </select>
                ) : (
                  <input
                    {...common}
                    step={field.widget === "number" && field.integer ? "1" : undefined}
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

export function RulesModal({ columns, rules, initialColId = null, onSave, onClose }) {
  const [draft, setDraft] = useState(rules);
  const [form, setForm] = useState({
    colId: columns.some((col) => col.id === initialColId)
      ? initialColId
      : columns[0]?.id || "",
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
        <p className="rounded-sm border border-dashed border-zinc-300 px-4 py-5 text-center text-[11px] font-semibold text-zinc-400">
          ยังไม่มีกฎ — เพิ่มด้านล่าง เช่น &quot;คงเหลือ น้อยกว่า 10 = แดง&quot; หรือ &quot;วันหมดอายุ เลยกำหนดแล้ว = แดงทั้งแถว&quot;
        </p>
      ) : (
        draft.map((rule, index) => {
          const column = columns.find((col) => col.id === rule.colId);
          return (
            <div
              key={`${rule.colId}-${index}`}
              className="flex items-center gap-2 rounded-sm border border-zinc-200 px-3 py-2"
            >
              <span
                className="rounded px-2 py-1 text-[10px] font-black"
                style={toneStyle(rule.tone) || { backgroundColor: "#f4f4f5", color: "#3f3f46" }}
              >
                {toneLabel(rule.tone)}
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
                className="rounded-sm p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600"
                title="ลบกฎนี้"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })
      )}

      <div className="rounded-sm border border-zinc-200 bg-zinc-50 p-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <select
            value={form.colId}
            onChange={(e) => setForm((prev) => ({ ...prev, colId: e.target.value }))}
            autoFocus={Boolean(initialColId)}
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
          <div
            className="flex h-9 flex-col justify-center gap-0.5 rounded-sm border border-zinc-200 px-1.5"
            style={form.tone !== "bar" ? toneStyle(form.tone) || undefined : undefined}
          >
            <HueSlider
              value={form.tone === "bar" ? "" : form.tone}
              onChange={(next) => setForm((prev) => ({ ...prev, tone: next || "hue:0" }))}
              disabled={form.tone === "bar"}
            />
            <label className="flex items-center gap-1 text-[8px] font-bold text-zinc-400">
              <input
                type="checkbox"
                checked={form.tone === "bar"}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, tone: e.target.checked ? "bar" : "hue:0" }))
                }
              />
              แถบวัดระดับแทนสี
            </label>
          </div>
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
            className="flex h-9 items-center justify-center gap-1 rounded-sm border border-zinc-300 text-[11px] font-black text-zinc-600 transition hover:bg-white sm:col-span-4"
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

// tones only ever arrives as TABLE_TONES (the whole-table theme picker,
// pastel only) or the TONE_NAMES default (everything else, solids included)
// -- kept as the signal for whether the solid toggle makes sense here,
// rather than adding a whole extra prop every call site would have to pass.
function ToneSelect({ value, onChange, label, part, tones = TONE_NAMES, disabled = false }) {
  // The text picker has to preview what it does — ink on the page — or a solid
  // tone shows as a red block and reads as a background.
  const preview =
    part === "text"
      ? toneTextColor(value)
        ? { color: toneTextColor(value) }
        : undefined
      : toneStyle(value, part) || undefined;
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9px] font-black text-zinc-400">{label}</span>
      <div
        className="flex h-7 items-center rounded-sm border border-zinc-200 px-1.5"
        style={part !== "text" ? preview : undefined}
      >
        <span
          className="min-w-0 flex-1 truncate text-[9px] font-bold"
          style={part === "text" ? preview : undefined}
        >
          {value ? toneLabel(value) || value : "ไม่กำหนด"}
        </span>
        <HueSlider
          value={value}
          onChange={onChange}
          allowSolid={tones !== TABLE_TONES}
          disabled={disabled}
        />
      </div>
    </label>
  );
}

/**
 * Fixed per-column appearance — colour, header band, how the value is drawn —
 * plus how many columns stay pinned while the rest scroll. Unlike RulesModal
 * nothing here depends on the value in the cell.
 */
export function FormatsModal({
  columns,
  formats,
  freeze,
  tableTone,
  tableBorderTone,
  initialColId = null,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState(() => {
    const initial = {};
    // Keep hidden columns in the draft too, so recolouring a named group also
    // reaches members that are temporarily hidden from the table.
    for (const [colId, format] of Object.entries(formats || {})) {
      initial[colId] = normalizeFormat(format);
    }
    for (const col of columns) {
      if (!initial[col.id]) initial[col.id] = normalizeFormat(formats?.[col.id]);
    }
    return initial;
  });
  const [pinned, setPinned] = useState(freeze || 0);
  const [theme, setTheme] = useState(tableTone || "");
  const [borderTheme, setBorderTheme] = useState(tableBorderTone || "");
  const orderedColumns = useMemo(() => {
    if (!initialColId || !columns.some((col) => col.id === initialColId)) return columns;
    return [
      columns.find((col) => col.id === initialColId),
      ...columns.filter((col) => col.id !== initialColId),
    ];
  }, [columns, initialColId]);

  const update = (colId, patch) =>
    setDraft((prev) => ({ ...prev, [colId]: { ...prev[colId], ...patch } }));

  const updateGroupTone = (colId, groupBg) =>
    setDraft((prev) => applyGroupTone(prev, colId, groupBg));

  const touched = columns.filter((col) => !isEmptyFormat(draft[col.id])).length;

  return (
    <ModalShell
      title="รูปแบบและสีตาราง"
      icon={<Paintbrush size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={() => {
        // Hidden columns are not listed in the UI, but stay in `draft` so a
        // shared group colour remains consistent when they are shown again.
        const formatsOut = { ...(formats || {}) };
        for (const [colId, format] of Object.entries(draft)) {
          if (isEmptyFormat(format)) delete formatsOut[colId];
          else formatsOut[colId] = format;
        }
        onSave({ formats: formatsOut, freeze: pinned, tableTone: theme, tableBorderTone: borderTheme });
      }}
    >
      <div className="grid gap-3 rounded-sm border border-zinc-200 bg-zinc-50 px-3 py-2 sm:grid-cols-2">
        <ToneSelect
          label="สีประจำตาราง Query นี้"
          part="head"
          tones={TABLE_TONES}
          value={theme}
          onChange={setTheme}
        />
        <ToneSelect
          label="สีเส้นขอบ Panel"
          part="head"
          tones={TABLE_TONES}
          value={borderTheme}
          onChange={setBorderTheme}
        />
        <label className="block">
          <span className="mb-0.5 block text-[9px] font-black text-zinc-400">ตรึงคอลัมน์ซ้ายไว้</span>
          <select
            id="freeze-count"
            value={pinned}
            onChange={(event) => setPinned(Number(event.target.value))}
            className="h-7 w-full rounded-sm border border-zinc-200 bg-white px-2 text-[10px] font-bold outline-none focus:border-red-600"
          >
            {Array.from({ length: MAX_FREEZE + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? "ไม่ตรึง" : `${n} คอลัมน์แรก`}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[10px] font-semibold text-zinc-400">
          {theme ? `ใช้สี ${toneLabel(theme)} กับทั้งตาราง` : "ยังไม่ได้เลือกสีประจำตาราง"}
        </span>
        <span className="text-[10px] font-semibold text-zinc-400">
          {borderTheme
            ? `ขอบใช้สี ${toneLabel(borderTheme)}`
            : "ขอบยังไม่ได้กำหนด — ใช้สีเดียวกับสีประจำตาราง"}
        </span>
        <span className="text-[10px] font-semibold text-zinc-400">
          {touched > 0 ? `ตั้งรูปแบบไว้ ${touched} คอลัมน์` : "ยังไม่ได้ตั้งรูปแบบคอลัมน์ไหน"}
        </span>
      </div>

      {orderedColumns.map((col) => {
        const format = draft[col.id];
        return (
          <div
            key={col.id}
            className={`rounded-sm border px-3 py-2 ${
              isEmptyFormat(format) ? "border-zinc-200" : "border-red-200 bg-red-50/30"
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-black text-zinc-700">
                <span className="truncate">{col.label}</span>
                {col.id === initialColId && (
                  <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[8px] text-red-700">
                    คอลัมน์ที่เลือก
                  </span>
                )}
              </span>
              {!isEmptyFormat(format) && (
                <button
                  type="button"
                  onClick={() => update(col.id, EMPTY_FORMAT)}
                  className="shrink-0 rounded-sm p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600"
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
                label="สีข้อความในเซลล์"
                part="text"
                value={format.fg}
                onChange={(fg) => update(col.id, { fg })}
              />
              <ToneSelect
                label="สีหัวคอลัมน์"
                part="head"
                value={format.headerBg}
                onChange={(headerBg) => update(col.id, { headerBg })}
              />
              <ToneSelect
                label="สีข้อความหัวคอลัมน์"
                part="text"
                value={format.headerFg}
                onChange={(headerFg) => update(col.id, { headerFg })}
              />
              <label className="block">
                <span className="mb-0.5 block text-[9px] font-black text-zinc-400">แสดงเป็น</span>
                <select
                  value={format.render}
                  onChange={(event) => update(col.id, { render: event.target.value })}
                  className="h-7 w-full rounded-sm border border-zinc-200 px-1 text-[10px] font-bold outline-none focus:border-red-600"
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
                  className="h-7 w-full rounded-sm border border-zinc-200 px-1 text-[10px] font-bold outline-none focus:border-red-600"
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
                  className="h-7 w-full rounded-sm border border-zinc-200 px-1.5 text-[10px] font-semibold outline-none focus:border-red-600"
                />
              </label>
              <ToneSelect
                label={format.group.trim() ? "สีหัวกลุ่ม (ใช้ทั้งกลุ่ม)" : "สีหัวกลุ่ม (ใส่ชื่อกลุ่มก่อน)"}
                part="head"
                value={format.groupBg}
                disabled={!format.group.trim()}
                onChange={(groupBg) => updateGroupTone(col.id, groupBg)}
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
export function MergeModal({
  query,
  queries,
  columnNames,
  merge,
  onSave,
  onRemove = null,
  onClose,
}) {
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
        className="shrink-0 rounded-sm p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600"
        title="ลบ"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );

  const addPair = (list, setList) =>
    setList([...list, { left: columnNames[0] || "", right: otherColumns[0] || "" }]);

  const mergeMissing = [
    !queryId && "Query ที่จะรวมเข้ามา",
    queryId && on.length === 0 && "คู่คอลัมน์ที่ใช้จับคู่แถว อย่างน้อย 1 คู่",
  ].filter(Boolean);

  return (
    <ModalShell
      title="ดึงคอลัมน์จาก Query อื่น"
      icon={<Combine size={15} className="text-red-600" />}
      onClose={onClose}
      saveDisabled={mergeMissing.length > 0}
      saveDisabledReason={`ยังไม่ได้เลือก: ${mergeMissing.join(", ")}`}
      onRemove={
        merge && onRemove
          ? () => {
              onRemove();
              onClose();
            }
          : null
      }
      removeLabel="เลิกดึงจาก Query นี้"
      onSave={() => {
        if (mergeMissing.length > 0) return;
        onSave({ queryId: Number(queryId), on, columns, compare });
      }}
    >
      <MissingNotice items={mergeMissing} />
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
                className="flex h-9 w-full items-center justify-center gap-1 rounded-sm border border-dashed border-zinc-300 text-[11px] font-black text-zinc-500 transition hover:bg-zinc-50"
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
                  className={`rounded-sm border px-2.5 py-1 text-[10px] font-bold transition ${
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
                className="flex h-9 w-full items-center justify-center gap-1 rounded-sm border border-dashed border-zinc-300 text-[11px] font-black text-zinc-500 transition hover:bg-zinc-50"
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
 * The entry point for "pull columns from another query": a list of what is
 * already wired up, each editable or removable, plus a way to add one more up
 * to the cap. Editing a single entry still happens in `MergeModal` — this is
 * only the part that makes there be more than one of them.
 */
export function LookupsListModal({ lookups, queries, onEdit, onRemove, onClose }) {
  return (
    <ModalShell
      title="ดึงคอลัมน์จาก Query อื่น"
      icon={<Combine size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={onClose}
      saveLabel="เสร็จแล้ว"
    >
      <p className="text-[10px] font-semibold text-zinc-400">
        แต่ละรายการรัน Query นั้นแยกกันทุกครั้งที่รีเฟรชตารางนี้ จึงจำกัดไว้ที่ {MAX_LOOKUPS} รายการ
      </p>
      {lookups.length === 0 ? (
        <p className="rounded-sm border border-dashed border-zinc-200 px-3 py-6 text-center text-[10px] font-semibold text-zinc-400">
          ยังไม่ได้ดึงคอลัมน์จาก Query ไหน
        </p>
      ) : (
        <div className="space-y-1.5">
          {lookups.map((lookup) => {
            const target = queries.find((item) => item.id === lookup.queryId);
            return (
              <div
                key={lookup.id}
                className="flex items-center justify-between gap-2 rounded-sm border border-zinc-200 bg-zinc-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-black text-zinc-700">
                    {target?.name || `Query #${lookup.queryId} (ถูกลบไปแล้ว)`}
                  </p>
                  <p className="truncate text-[9px] font-semibold text-zinc-400">
                    {lookup.columns.length} คอลัมน์ · จับคู่ {lookup.on.length} คู่
                    {lookup.compare.length > 0 ? ` · เช็คค่า ${lookup.compare.length} คู่` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(lookup.id)}
                    className="rounded-sm border border-zinc-200 bg-white px-2 py-1 text-[10px] font-black text-zinc-600 transition hover:bg-zinc-100"
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(lookup.id)}
                    className="rounded-sm border border-zinc-200 bg-white p-1.5 text-zinc-400 transition hover:border-red-200 hover:text-red-600"
                    aria-label={`เลิกดึงจาก ${target?.name || lookup.queryId}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => onEdit(null)}
        disabled={lookups.length >= MAX_LOOKUPS}
        title={lookups.length >= MAX_LOOKUPS ? `ดึงได้สูงสุด ${MAX_LOOKUPS} Query ต่อตาราง` : undefined}
        className="flex h-9 w-full items-center justify-center gap-1 rounded-sm border border-dashed border-zinc-300 text-[11px] font-black text-zinc-500 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={12} /> เพิ่มจาก Query อื่น
      </button>
    </ModalShell>
  );
}

/**
 * Click a row here, open another query with values from that row. The target's
 * :parameters are read straight out of its SQL, so the mapping can only point
 * at placeholders that really exist.
 */
export function DrillModal({
  query,
  queries,
  columnNames,
  drill,
  onSave,
  onClose,
}) {
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

  const drillMissing = [
    !queryId && "Query ปลายทาง",
    queryId && map.length === 0 && "คู่ค่าที่จะส่งไป อย่างน้อย 1 คู่",
  ].filter(Boolean);

  return (
    <ModalShell
      title="คลิกแถวเพื่อเปิด Query อื่น (drill-down)"
      icon={<CornerDownRight size={15} className="text-red-600" />}
      onClose={onClose}
      saveDisabled={drillMissing.length > 0}
      saveDisabledReason={`ยังไม่ได้เลือก: ${drillMissing.join(", ")}`}
      onRemove={
        drill
          ? () => {
              onSave(null);
              onClose();
            }
          : null
      }
      removeLabel="เลิกเปิด Query อื่นจากแถว"
      onSave={() => {
        if (drillMissing.length > 0) return;
        onSave({ queryId: Number(queryId), map });
      }}
    >
      <MissingNotice items={drillMissing} />
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
        <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
          Query ปลายทางยังไม่มีพารามิเตอร์ใน SQL — ไปแก้ SQL ของมันให้มี{" "}
          <code className="font-mono">:ชื่อ</code> เช่น{" "}
          <code className="font-mono">WHERE user_id = :user_id</code> ก่อน แล้วกลับมาผูกค่าที่นี่
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
                  className="shrink-0 rounded-sm p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600"
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
              className="flex h-9 w-full items-center justify-center gap-1 rounded-sm border border-dashed border-zinc-300 text-[11px] font-black text-zinc-500 transition hover:bg-zinc-50"
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
export function BulkEditModal({
  editable,
  columnNames,
  onApply,
  onClose,
}) {
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
      <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
        คัดลอกจาก Excel/Sheets มาวางได้เลย บรรทัดแรกต้องเป็นชื่อคอลัมน์ และต้องมีคอลัมน์{" "}
        <code className="font-mono">{editable.pk}</code> เพื่อบอกว่าจะแก้แถวไหน
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder={`${editable.pk}\t${editable.columns[0] || "คอลัมน์"}\n1\t100\n2\t250`}
        className="w-full rounded-sm border border-zinc-200 bg-zinc-900 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-emerald-300 outline-none focus:border-red-600"
      />
      <p className="text-[10px] font-semibold text-zinc-400">
        คอลัมน์ที่มีอยู่ในผลลัพธ์: {columnNames.join(", ")}
      </p>

      {problems.map((problem) => (
        <div
          key={problem}
          className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600"
        >
          {problem}
        </div>
      ))}

      {parsed && problems.length === 0 && (
        <div className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
          จะแก้ {parsed.rows.length} แถว × {parsed.targets.length} คอลัมน์ (
          {parsed.targets.map((target) => target.name).join(", ")}) = {" "}
          {parsed.rows.length * parsed.targets.length} เซลล์
        </div>
      )}

      {result && (
        <div className="space-y-1 rounded-sm border border-zinc-200 px-3 py-2 text-[11px] font-bold">
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

// No regex: the search term is whatever the admin typed, and building a
// RegExp out of it would mean escaping every special character first for no
// real benefit — a plain scan-and-splice does the same job.
function replaceAllOccurrences(text, find, replacement, caseSensitive) {
  if (!find) return text;
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? find : find.toLowerCase();
  let out = "";
  let i = 0;
  for (;;) {
    const at = haystack.indexOf(needle, i);
    if (at === -1) {
      out += text.slice(i);
      return out;
    }
    out += text.slice(i, at) + replacement;
    i = at + find.length;
  }
}

const MAX_FIND_REPLACE_MATCHES = 500;

/**
 * Excel's Ctrl+H for the live table: find a substring across every editable
 * column (or one chosen column) and replace it everywhere at once, instead of
 * fixing the same typo cell by cell. Writes through the same one-cell-at-a-
 * time endpoint as BulkEditModal/double-click editing, so every change still
 * lands in the audit log individually.
 */
export function FindReplaceModal({ editable, rows, onApply, onClose }) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [column, setColumn] = useState("__all__");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);

  const targetColumns = useMemo(
    () => (column === "__all__" ? editable.columns : [column]),
    [column, editable.columns]
  );

  const matches = useMemo(() => {
    if (!find.trim()) return [];
    const out = [];
    for (const row of rows) {
      for (const col of targetColumns) {
        const raw = String(row.values[col] ?? "");
        const newValue = replaceAllOccurrences(raw, find, replace, caseSensitive);
        if (newValue !== raw) {
          out.push({ pkValue: row.pkValue, column: col, oldValue: raw, newValue });
        }
      }
    }
    return out;
  }, [rows, find, replace, caseSensitive, targetColumns]);

  const capped = matches.length > MAX_FIND_REPLACE_MATCHES;
  const toApply = capped ? matches.slice(0, MAX_FIND_REPLACE_MATCHES) : matches;

  const apply = async () => {
    setApplying(true);
    setResult(null);
    const outcome = await onApply(
      toApply.map(({ pkValue, column: col, newValue }) => ({ pkValue, column: col, value: newValue }))
    );
    setResult(outcome);
    setApplying(false);
  };

  return (
    <ModalShell
      title="ค้นหา/แทนที่ในตาราง"
      icon={<Search size={15} className="text-red-600" />}
      onClose={onClose}
      onSave={apply}
      saveDisabled={toApply.length === 0 || applying}
      saveLabel={applying ? "กำลังบันทึก..." : `แทนที่ทั้งหมด (${toApply.length} เซลล์)`}
    >
      <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
        ค้นเฉพาะในคอลัมน์ที่แก้ไขได้ ({editable.columns.join(", ") || "ยังไม่ได้ตั้ง"}) และเขียนกลับ
        ทีละเซลล์เหมือนดับเบิลคลิกแก้เอง — ขึ้น log ทุกเซลล์ที่เปลี่ยน
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>ค้นหา</label>
          <input
            type="text"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="ข้อความที่จะหา"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>แทนที่ด้วย</label>
          <input
            type="text"
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            placeholder="ข้อความใหม่ (เว้นว่าง = ลบออก)"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>เฉพาะคอลัมน์</label>
          <select value={column} onChange={(e) => setColumn(e.target.value)} className={inputClass}>
            <option value="__all__">ทุกคอลัมน์ที่แก้ไขได้</option>
            {editable.columns.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex h-9 items-center gap-1.5 text-[11px] font-bold text-zinc-600">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="h-3.5 w-3.5 accent-red-600"
          />
          ตัวพิมพ์เล็ก/ใหญ่ต้องตรงกัน
        </label>
      </div>

      {find.trim() && (
        <div
          className={`rounded-sm border px-3 py-2 text-[11px] font-bold ${
            matches.length > 0
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-zinc-200 bg-zinc-50 text-zinc-400"
          }`}
        >
          {matches.length > 0
            ? `พบ ${matches.length} เซลล์ที่ตรง${capped ? ` — จะแทนที่แค่ ${MAX_FIND_REPLACE_MATCHES} เซลล์แรกก่อน แล้วรันซ้ำเพื่อทำที่เหลือ` : ""}`
            : "ไม่พบข้อความนี้ในคอลัมน์ที่เลือก"}
        </div>
      )}

      {matches.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-sm border border-zinc-200">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-zinc-100 text-left font-black text-zinc-500">
              <tr>
                <th className="px-2 py-1">{editable.pk}</th>
                <th className="px-2 py-1">คอลัมน์</th>
                <th className="px-2 py-1">เดิม</th>
                <th className="px-2 py-1">ใหม่</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {toApply.slice(0, 100).map((match, index) => (
                <tr key={index}>
                  <td className="px-2 py-1 font-mono text-zinc-500">{String(match.pkValue)}</td>
                  <td className="px-2 py-1 font-bold text-zinc-700">{match.column}</td>
                  <td className="px-2 py-1 text-red-600 line-through">{match.oldValue}</td>
                  <td className="px-2 py-1 text-emerald-700">{match.newValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {toApply.length > 100 && (
            <p className="border-t border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-400">
              และอีก {toApply.length - 100} เซลล์
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-1 rounded-sm border border-zinc-200 px-3 py-2 text-[11px] font-bold">
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

  const chartMissing = [!x && "แกน X", y.length === 0 && "แกน Y อย่างน้อย 1 คอลัมน์"].filter(
    Boolean
  );

  return (
    <ModalShell
      title="ตั้งค่ากราฟ"
      icon={<ChartColumn size={15} className="text-red-600" />}
      onClose={onClose}
      saveDisabled={chartMissing.length > 0}
      saveDisabledReason={`ยังไม่ได้เลือก: ${chartMissing.join(", ")}`}
      onRemove={
        chart
          ? () => {
              onSave(null);
              onClose();
            }
          : null
      }
      removeLabel="ลบกราฟ"
      onSave={() => {
        if (chartMissing.length > 0) return;
        onSave({ type, x, y });
      }}
    >
      <MissingNotice items={chartMissing} />
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
              className={`flex-1 rounded-sm border px-3 py-2 text-[11px] font-black transition ${
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
                className={`rounded-sm border px-2.5 py-1 text-[10px] font-bold transition ${
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

const INSERT_TYPE_LABELS = {
  text: "ข้อความ",
  number: "ตัวเลข",
  date: "วันที่",
  datetime: "วันที่และเวลา",
  time: "เวลา",
  boolean: "ใช่ / ไม่ใช่",
  select: "ตัวเลือก (dropdown)",
};

function fieldInputType(type) {
  if (type === "number") return "number";
  if (type === "date") return "date";
  if (type === "datetime") return "datetime-local";
  if (type === "time") return "time";
  return "text";
}

/**
 * Where an admin sets up the INSERT that the add-data form will run.
 *
 * The boxes on the form are not designed by hand — they are read out of the
 * SQL. Every :placeholder in the statement becomes one field, so a script and
 * its form cannot drift apart: adding a column to the INSERT adds the box for
 * it. Most admins never see that SQL though: the default "เลือกตารางและ
 * คอลัมน์" mode picks a table and ticks columns the same way the query
 * builder does, and the INSERT is generated underneath — "เขียน SQL เอง" is
 * there only for someone who already knows SQL and wants a script the picker
 * cannot express (multi-table writes, expressions, etc).
 */
export function InsertFormModal({ insertForm, connectionId, onSave, onClose }) {
  const [builderMode, setBuilderMode] = useState(insertForm?.sql ? "sql" : "visual");
  const [sql, setSql] = useState(insertForm?.sql || "");
  const [label, setLabel] = useState(insertForm?.label || "");
  const [fields, setFields] = useState(() => insertForm?.fields || []);

  const [schemaData, setSchemaData] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [selectedTableKey, setSelectedTableKey] = useState("");
  const [selectedColumns, setSelectedColumns] = useState([]);

  // Loaded once per connection, only once the picker is actually opened — an
  // admin who only ever writes raw SQL should not pay for a schema fetch.
  const schemaLoadedForRef = useRef(false);
  useEffect(() => {
    if (builderMode !== "visual" || schemaLoadedForRef.current === connectionId) return;
    schemaLoadedForRef.current = connectionId;
    (async () => {
      setSchemaLoading(true);
      setSchemaError("");
      try {
        const suffix = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : "";
        const data = await apiJson(`/api/query-builder/schema${suffix}`, {
          fallbackError: "โหลดรายการตารางและคอลัมน์ไม่สำเร็จ",
        });
        setSchemaData(data);
        setSelectedTableKey((prev) => prev || data.tables?.[0]?.key || "");
      } catch (err) {
        schemaLoadedForRef.current = false;
        setSchemaError(err.message);
      } finally {
        setSchemaLoading(false);
      }
    })();
  }, [builderMode, connectionId]);

  const filteredTables = useMemo(() => {
    const needle = tableSearch.trim().toLowerCase();
    if (!needle) return schemaData?.tables || [];
    return (schemaData?.tables || []).filter((table) => table.key.toLowerCase().includes(needle));
  }, [schemaData, tableSearch]);

  const selectedTable = useMemo(
    () => schemaData?.tables?.find((table) => table.key === selectedTableKey) || null,
    [schemaData, selectedTableKey]
  );

  // Identity/generated columns fill themselves in — offering a box for them
  // would just produce an INSERT Postgres rejects.
  const insertableColumns = useMemo(
    () => (selectedTable?.columns || []).filter((column) => !column.identity && !column.generated),
    [selectedTable]
  );

  const visualSql = useMemo(
    () =>
      buildVisualInsert({
        schema: selectedTable?.schema,
        table: selectedTable?.name,
        columns: selectedColumns,
      }),
    [selectedTable, selectedColumns]
  );

  const effectiveSql = builderMode === "visual" ? visualSql : sql;
  const names = useMemo(() => extractSqlParams(effectiveSql), [effectiveSql]);

  const draft = names.map((name) => {
    const existing = fields.find((field) => field.name === name);
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
  });

  // Same trap as the parameter modal: parsing on every keystroke would eat the
  // comma the moment it is typed.
  const [optionsText, setOptionsText] = useState(() =>
    Object.fromEntries(
      (insertForm?.fields || []).map((field) => [field.name, (field.options || []).join(", ")])
    )
  );

  const setField = (name, key, value) =>
    setFields(draft.map((field) => (field.name === name ? { ...field, [key]: value } : field)));

  const looksLikeInsert = /^\s*insert\s+into\b/i.test(sql);
  const insertMissing =
    builderMode === "visual"
      ? [!visualSql && "เลือกตารางและติ๊กอย่างน้อยหนึ่งคอลัมน์"]
      : [
          !sql.trim() && "คำสั่ง INSERT",
          sql.trim() && !looksLikeInsert && "สคริปต์ต้องขึ้นต้นด้วย INSERT INTO",
        ];
  const missing = insertMissing.filter(Boolean);

  return (
    <ModalShell
      title="ตั้งค่าฟอร์มเพิ่มข้อมูล"
      icon={<Plus size={15} />}
      onClose={onClose}
      saveLabel="บันทึกฟอร์ม"
      saveDisabled={missing.length > 0}
      saveDisabledReason={`ยังไม่พร้อมบันทึก: ${missing.join(", ")}`}
      onRemove={
        insertForm
          ? () => {
              onSave(null);
              onClose();
            }
          : null
      }
      removeLabel="ลบฟอร์มนี้"
      onSave={() => {
        if (missing.length > 0) return;
        onSave({ sql: effectiveSql.trim(), label: label.trim(), fields: draft });
        onClose();
      }}
    >
      <MissingNotice items={missing} />
      <div>
        <label className={labelClass}>ชื่อปุ่ม / ฟอร์ม (ไม่ใส่ก็ได้)</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="เช่น เพิ่มเกมใหม่"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-sm bg-zinc-100 p-1">
        <button
          type="button"
          onClick={() => {
            if (builderMode === "sql" && sql.trim() && !visualSql) setSql(sql);
            setBuilderMode("visual");
          }}
          className={`flex items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-[11px] font-black transition ${
            builderMode === "visual" ? "bg-white text-red-600 shadow-sm" : "text-zinc-500"
          }`}
        >
          <Table2 size={13} /> เลือกตารางและคอลัมน์
        </button>
        <button
          type="button"
          onClick={() => {
            if (builderMode === "visual" && visualSql) setSql(visualSql);
            setBuilderMode("sql");
          }}
          className={`flex items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-[11px] font-black transition ${
            builderMode === "sql" ? "bg-white text-red-600 shadow-sm" : "text-zinc-500"
          }`}
        >
          <Code2 size={13} /> เขียน SQL เอง (ขั้นสูง)
        </button>
      </div>

      {builderMode === "visual" ? (
        <div className="space-y-3 rounded-sm border border-zinc-200 p-3">
          <div className="flex items-start gap-2 rounded-sm border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-bold text-blue-700">
            <Database size={14} className="mt-0.5 shrink-0" />
            เลือกตารางและติ๊กคอลัมน์ที่จะให้กรอก ระบบจะสร้างคำสั่ง INSERT ให้อัตโนมัติ โดยไม่ต้องเขียน SQL
          </div>
          {schemaError && (
            <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-bold text-red-600">
              {schemaError}
            </p>
          )}
          {schemaLoading ? (
            <p className="flex items-center gap-2 py-6 text-xs font-bold text-zinc-400">
              <Loader2 size={14} className="animate-spin" /> กำลังโหลดโครงสร้างฐานข้อมูล...
            </p>
          ) : schemaData?.tables?.length ? (
            <>
              <div>
                <label className="mb-1 block text-[10px] font-black text-zinc-500">ค้นหาตาราง</label>
                <input
                  type="search"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="เช่น games, orders"
                  className="mb-1.5 h-9 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-[10px] font-semibold outline-none focus:border-red-600 focus:bg-white"
                />
                <label className="mb-1 block text-[10px] font-black text-zinc-500">ตาราง</label>
                <select
                  value={selectedTableKey}
                  onChange={(e) => {
                    setSelectedTableKey(e.target.value);
                    setSelectedColumns([]);
                  }}
                  className="h-10 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white"
                >
                  {filteredTables.map((table) => (
                    <option key={table.key} value={table.key}>
                      {table.key}
                    </option>
                  ))}
                </select>
                {filteredTables.length === 0 && (
                  <p className="mt-1 text-[9px] font-bold text-amber-600">ไม่พบตารางตามคำค้นหา</p>
                )}
              </div>

              {selectedTable && (
                <div>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-black text-zinc-500">คอลัมน์ที่จะให้กรอก</p>
                    <button
                      type="button"
                      onClick={() => setSelectedColumns(insertableColumns.map((column) => column.name))}
                      className="text-[10px] font-black text-red-600 hover:text-red-700"
                    >
                      เลือกทั้งหมด
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-sm border border-zinc-200">
                    {insertableColumns.map((column) => {
                      const checked = selectedColumns.includes(column.name);
                      const isPrimaryKey = selectedTable.primaryKey.includes(column.name);
                      return (
                        <label
                          key={column.name}
                          className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setSelectedColumns((prev) =>
                                e.target.checked
                                  ? [...prev, column.name]
                                  : prev.filter((name) => name !== column.name)
                              )
                            }
                            className="accent-red-600"
                          />
                          <span className="truncate font-mono text-[11px] font-black text-zinc-700">
                            {column.name}
                          </span>
                          <span className="truncate text-[9px] font-semibold text-zinc-400">{column.type}</span>
                          {isPrimaryKey && (
                            <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[8px] font-black text-violet-600">
                              PK
                            </span>
                          )}
                          {!column.nullable && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[8px] font-black text-amber-600">
                              NOT NULL
                            </span>
                          )}
                        </label>
                      );
                    })}
                    {insertableColumns.length === 0 && (
                      <p className="px-3 py-6 text-center text-[9px] font-semibold text-zinc-400">
                        ตารางนี้ไม่มีคอลัมน์ที่กรอกเองได้ (สร้างค่าอัตโนมัติทั้งหมด)
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            !schemaError && (
              <p className="rounded-sm border border-dashed border-zinc-300 px-4 py-6 text-center text-[11px] font-semibold text-zinc-400">
                ไม่พบตารางในฐานข้อมูลนี้
              </p>
            )
          )}
        </div>
      ) : (
        <div>
          <label className={labelClass}>คำสั่ง INSERT (ใช้ :ชื่อ แทนค่าที่จะให้กรอก)</label>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={"INSERT INTO games (name, region)\nVALUES (:ชื่อเกม, :region)"}
            className="w-full rounded-sm border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] font-semibold outline-none focus:border-red-600 focus:bg-white"
          />
          {sql.trim() && !looksLikeInsert && (
            <p className="mt-1 text-[10px] font-bold text-amber-700">
              สคริปต์ต้องขึ้นต้นด้วย INSERT INTO — เซิร์ฟเวอร์ปฏิเสธคำสั่งอื่นทุกครั้งที่รัน
            </p>
          )}
        </div>
      )}

      {draft.length === 0 ? (
        <p className="rounded-sm border border-dashed border-zinc-300 px-4 py-6 text-center text-[11px] font-semibold text-zinc-400">
          {builderMode === "visual"
            ? "ยังไม่ได้ติ๊กคอลัมน์ — เลือกตารางแล้วติ๊กคอลัมน์ด้านบน ถึงจะมีช่องให้กรอก"
            : (
              <>
                ยังไม่มี <code className="font-mono">:ชื่อ</code> ใน SQL — ใส่ก่อน ถึงจะมีช่องให้กรอก
              </>
            )}
        </p>
      ) : (
        draft.map((field) => (
          <div key={field.name} className="rounded-sm border border-zinc-200 p-3">
            <p className="mb-2 font-mono text-[11px] font-black text-red-600">:{field.name}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className={labelClass}>ป้ายกำกับ</label>
                <input
                  type="text"
                  value={field.label}
                  onChange={(e) => setField(field.name, "label", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>ชนิด</label>
                <select
                  value={field.type}
                  onChange={(e) => setField(field.name, "type", e.target.value)}
                  className={inputClass}
                >
                  {PARAM_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {INSERT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>ค่าเริ่มต้น</label>
                <input
                  type={fieldInputType(field.type)}
                  step={["datetime", "time"].includes(field.type) ? 1 : undefined}
                  value={field.defaultValue}
                  onChange={(e) => setField(field.name, "defaultValue", e.target.value)}
                  className={inputClass}
                />
              </div>
              {field.type === "select" && (
                <div>
                  <label className={labelClass}>ตัวเลือก (คั่นด้วย ,)</label>
                  <input
                    type="text"
                    value={optionsText[field.name] ?? (field.options || []).join(", ")}
                    onChange={(e) => {
                      setOptionsText((prev) => ({ ...prev, [field.name]: e.target.value }));
                      setField(
                        field.name,
                        "options",
                        e.target.value
                          .split(",")
                          .map((option) => option.trim())
                          .filter(Boolean)
                      );
                    }}
                    placeholder="เช่น GL, SEA, TH"
                    className={inputClass}
                  />
                </div>
              )}
            </div>
            <label className="mt-2 flex items-center gap-2 text-[11px] font-bold text-zinc-600">
              <input
                type="checkbox"
                checked={field.required !== false}
                onChange={(e) => setField(field.name, "required", e.target.checked)}
                className="h-3.5 w-3.5 accent-red-600"
              />
              ต้องกรอก (ถ้าไม่ติ๊ก เว้นว่างได้ และจะบันทึกเป็น NULL)
            </label>
          </div>
        ))
      )}

      <p className="text-[10px] font-semibold leading-relaxed text-zinc-400">
        ค่าที่กรอกในฟอร์มถูกส่งเป็นพารามิเตอร์ ไม่ได้ต่อเป็นข้อความ SQL
        และเซิร์ฟเวอร์ตรวจสคริปต์ทุกครั้งที่รัน — ต้องเป็น INSERT คำสั่งเดียวเท่านั้น ·
        อย่าลืมกด &quot;บันทึกให้ทุกคน&quot; หลังปิดหน้านี้ ไม่งั้นคนอื่นยังไม่เห็นฟอร์ม
      </p>
    </ModalShell>
  );
}

/** The form itself: one box per :placeholder, and a button that runs the script. */
export function InsertRunModal({ queryId, insertForm, onDone, onClose }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      (insertForm.fields || []).map((field) => [field.name, field.defaultValue || ""])
    )
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await apiJson(`/api/queries/${queryId}/insert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
        fallbackError: "เพิ่มข้อมูลไม่สำเร็จ",
      });
      onDone?.();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const setValue = (name, value) => setValues((prev) => ({ ...prev, [name]: value }));

  return (
    <ModalShell
      title={insertForm.label || "เพิ่มข้อมูล"}
      icon={<Plus size={15} />}
      onClose={onClose}
      saveLabel={busy ? "กำลังบันทึก..." : "เพิ่มข้อมูล"}
      onSave={busy ? () => {} : submit}
    >
      {error && (
        <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
          {error}
        </p>
      )}
      {(insertForm.fields || []).length === 0 && (
        <p className="text-[11px] font-semibold text-zinc-500">
          ฟอร์มนี้ไม่มีช่องให้กรอก กด &quot;เพิ่มข้อมูล&quot; เพื่อรันสคริปต์ได้เลย
        </p>
      )}
      {(insertForm.fields || []).map((field) => (
        <div key={field.name}>
          <label className={labelClass}>
            {field.label}
            {field.required !== false && <span className="text-red-600"> *</span>}
          </label>
          {field.type === "select" ? (
            <select
              value={values[field.name] ?? ""}
              onChange={(e) => setValue(field.name, e.target.value)}
              className={inputClass}
            >
              <option value="">— เลือกค่า —</option>
              {(field.options || []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : field.type === "boolean" ? (
            <select
              value={values[field.name] ?? ""}
              onChange={(e) => setValue(field.name, e.target.value)}
              className={inputClass}
            >
              <option value="">— เลือก —</option>
              <option value="true">ใช่</option>
              <option value="false">ไม่ใช่</option>
            </select>
          ) : (
            <input
              type={fieldInputType(field.type)}
              step={["datetime", "time"].includes(field.type) ? 1 : undefined}
              value={values[field.name] ?? ""}
              onChange={(e) => setValue(field.name, e.target.value)}
              className={inputClass}
            />
          )}
        </div>
      ))}
    </ModalShell>
  );
}
