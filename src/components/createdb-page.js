"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  Columns3,
  Database,
  ListPlus,
  Loader2,
  Plus,
  Table2,
  Trash2,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { buildAddColumnSql, buildCreateTableSql, DDL_COLUMN_TYPES } from "@/lib/gamedb-schema-ddl";

const labelClass = "mb-1 block text-[10px] font-black text-zinc-500";
const inputClass =
  "h-9 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white";

function emptyColumn() {
  return { key: Math.random().toString(36).slice(2), name: "", type: "text", notNull: false };
}

function typeLabel(value) {
  return DDL_COLUMN_TYPES.find((type) => type.value === value)?.label || value;
}

// A step's numbered circle -- purely visual, so the same eye-catching marker
// walks a first-time admin through "database -> name -> columns -> preview"
// in order instead of dropping every field on the page at once.
function StepHeading({ n, title, hint }) {
  return (
    <div className="mb-2 flex items-start gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white">
        {n}
      </span>
      <div>
        <p className="text-xs font-black text-zinc-700">{title}</p>
        {hint && <p className="text-[10px] font-semibold text-zinc-400">{hint}</p>}
      </div>
    </div>
  );
}

export default function CreateDbPage() {
  const [mode, setMode] = useState("createTable");
  const [connections, setConnections] = useState([]);
  const [connectionId, setConnectionId] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiJson("/api/connections", { fallbackError: "โหลดรายการฐานข้อมูลไม่สำเร็จ" });
        setConnections(data.connections || []);
      } catch {
        setConnections([]);
      }
    })();
  }, []);

  // --- create table ------------------------------------------------------
  const [newTable, setNewTable] = useState("");
  const [columns, setColumns] = useState([emptyColumn()]);
  const [primaryKeyColumn, setPrimaryKeyColumn] = useState("");

  const updateColumn = (key, patch) =>
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, ...patch } : col)));
  const addColumnRow = () => setColumns((prev) => [...prev, emptyColumn()]);
  const removeColumnRow = (key) =>
    setColumns((prev) => (prev.length > 1 ? prev.filter((col) => col.key !== key) : prev));

  const createTablePreview = useMemo(() => {
    try {
      return {
        sql: buildCreateTableSql({
          table: newTable.trim(),
          columns: columns
            .filter((col) => col.name.trim())
            .map((col) => ({ name: col.name.trim(), type: col.type, notNull: col.notNull })),
          primaryKeyColumn: primaryKeyColumn.trim(),
        }),
        error: "",
      };
    } catch (err) {
      return { sql: "", error: err.message };
    }
  }, [newTable, columns, primaryKeyColumn]);

  const submitCreateTable = async () => {
    if (createTablePreview.error) return;
    if (!window.confirm(`สร้างตารางนี้จริงไหม?\n\n${createTablePreview.sql}`)) return;
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const data = await apiJson("/api/schema-ddl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createTable",
          connectionId: connectionId || null,
          table: newTable.trim(),
          columns: columns
            .filter((col) => col.name.trim())
            .map((col) => ({ name: col.name.trim(), type: col.type, notNull: col.notNull })),
          primaryKeyColumn: primaryKeyColumn.trim(),
        }),
        fallbackError: "สร้างตารางไม่สำเร็จ",
      });
      setResult(data.sql);
      setNewTable("");
      setColumns([emptyColumn()]);
      setPrimaryKeyColumn("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // --- add column ----------------------------------------------------------
  const [schemaTables, setSchemaTables] = useState([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [targetTable, setTargetTable] = useState("");
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState("text");

  useEffect(() => {
    if (mode !== "addColumn") return;
    let cancelled = false;
    setSchemaLoading(true);
    (async () => {
      try {
        const suffix = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : "";
        const data = await apiJson(`/api/query-builder/schema${suffix}`, {
          fallbackError: "โหลดรายการตารางไม่สำเร็จ",
        });
        if (!cancelled) setSchemaTables(data.tables || []);
      } catch {
        if (!cancelled) setSchemaTables([]);
      } finally {
        if (!cancelled) setSchemaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, connectionId]);

  const addColumnPreview = useMemo(() => {
    try {
      return {
        sql: buildAddColumnSql({ table: targetTable, column: newColumnName.trim(), type: newColumnType }),
        error: "",
      };
    } catch (err) {
      return { sql: "", error: err.message };
    }
  }, [targetTable, newColumnName, newColumnType]);

  const submitAddColumn = async () => {
    if (addColumnPreview.error) return;
    if (!window.confirm(`เพิ่มคอลัมน์นี้จริงไหม?\n\n${addColumnPreview.sql}`)) return;
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const data = await apiJson("/api/schema-ddl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addColumn",
          connectionId: connectionId || null,
          table: targetTable,
          column: newColumnName.trim(),
          type: newColumnType,
        }),
        fallbackError: "เพิ่มคอลัมน์ไม่สำเร็จ",
      });
      setResult(data.sql);
      setNewColumnName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const preview = mode === "createTable" ? createTablePreview : addColumnPreview;

  // A one-sentence plain-language readout above the raw SQL -- most of this
  // page's audience is here to add a column, not to read DDL, so the
  // sentence is what confirms "yes, this is what I meant" and the SQL itself
  // becomes optional reading for anyone who wants to double-check it.
  const summarySentence = useMemo(() => {
    if (mode === "createTable") {
      const named = columns.filter((col) => col.name.trim());
      if (!newTable.trim() || named.length === 0) return "";
      const list = named.map((col) => `${col.name.trim()} (${typeLabel(col.type)})`).join(", ");
      const pk = primaryKeyColumn.trim() ? ` โดยใช้ "${primaryKeyColumn.trim()}" เป็นคอลัมน์ key หลัก` : "";
      return `จะสร้างตารางใหม่ชื่อ "${newTable.trim()}" มี ${named.length} คอลัมน์: ${list}${pk}`;
    }
    if (!targetTable || !newColumnName.trim()) return "";
    return `จะเพิ่มคอลัมน์ "${newColumnName.trim()}" ชนิด ${typeLabel(newColumnType)} เข้าไปในตาราง "${targetTable}"`;
  }, [mode, newTable, columns, primaryKeyColumn, targetTable, newColumnName, newColumnType]);

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1 rounded-sm border border-zinc-200 bg-white px-3 py-1.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50"
          >
            <ArrowLeft size={14} /> กลับ
          </Link>
          <h1 className="flex items-center gap-1.5 text-sm font-black text-zinc-800">
            <Table2 size={15} className="text-red-600" /> สร้างตาราง / เพิ่มคอลัมน์
          </h1>
        </div>

        <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-700">
          จำกัดไว้แค่ &quot;สร้างตารางใหม่&quot; และ &quot;เพิ่มคอลัมน์&quot; เท่านั้น — ไม่มีลบตาราง/ลบคอลัมน์/
          เปลี่ยนชนิดข้อมูล เพราะย้อนกลับไม่ได้เหมือนแก้ข้อมูลปกติ ทุกคำสั่งที่รันจะถูกบันทึกลง
          ประวัติการใช้งาน
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("createTable")}
            className={`flex items-start gap-2.5 rounded-sm border p-3 text-left transition ${
              mode === "createTable"
                ? "border-red-600 bg-red-50"
                : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm ${
                mode === "createTable" ? "bg-red-600 text-white" : "bg-zinc-100 text-zinc-500"
              }`}
            >
              <Table2 size={16} />
            </span>
            <span>
              <span className="block text-xs font-black text-zinc-800">สร้างตารางใหม่</span>
              <span className="block text-[10px] font-semibold leading-relaxed text-zinc-400">
                เริ่มตารางเปล่าใหม่ทั้งหมด พร้อมตั้งคอลัมน์ของมันเอง
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("addColumn")}
            className={`flex items-start gap-2.5 rounded-sm border p-3 text-left transition ${
              mode === "addColumn"
                ? "border-red-600 bg-red-50"
                : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm ${
                mode === "addColumn" ? "bg-red-600 text-white" : "bg-zinc-100 text-zinc-500"
              }`}
            >
              <ListPlus size={16} />
            </span>
            <span>
              <span className="block text-xs font-black text-zinc-800">เพิ่มคอลัมน์ในตารางเดิม</span>
              <span className="block text-[10px] font-semibold leading-relaxed text-zinc-400">
                เติมคอลัมน์ใหม่ 1 ช่องเข้าไปในตารางที่มีอยู่แล้ว
              </span>
            </span>
          </button>
        </div>

        <div className="rounded-sm border border-zinc-200 bg-white p-4 shadow-sm">
          <StepHeading n={1} title="เลือกฐานข้อมูล" />
          <div className="relative mb-5">
            <Database size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className={`${inputClass} pl-8`}
            >
              <option value="">หลัก (inblackm)</option>
              {connections.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.name}
                </option>
              ))}
            </select>
          </div>

          {mode === "createTable" ? (
            <div className="space-y-5">
              <div>
                <StepHeading n={2} title="ตั้งชื่อตาราง" hint="เช่น packages หรือ public.packages" />
                <input
                  type="text"
                  value={newTable}
                  onChange={(e) => setNewTable(e.target.value)}
                  placeholder="ชื่อตาราง"
                  className={inputClass}
                />
              </div>

              <div>
                <StepHeading
                  n={3}
                  title="เพิ่มคอลัมน์"
                  hint="แต่ละคอลัมน์ต้องมีชื่อและชนิดข้อมูล ทำได้หลายคอลัมน์ในตารางเดียว"
                />
                <div className="space-y-2">
                  {columns.map((col, index) => (
                    <div key={col.key} className="rounded-sm border border-zinc-200 bg-zinc-50 p-2.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
                          คอลัมน์ที่ {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeColumnRow(col.key)}
                          disabled={columns.length === 1}
                          className="shrink-0 rounded-sm p-1 text-zinc-400 transition hover:bg-zinc-200 hover:text-red-600 disabled:opacity-30"
                          title="ลบคอลัมน์นี้ออกจากรายการ"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-[1.3fr_1fr_auto]">
                        <div>
                          <label className="mb-0.5 block text-[9px] font-bold text-zinc-400">ชื่อคอลัมน์</label>
                          <input
                            type="text"
                            value={col.name}
                            onChange={(e) => updateColumn(col.key, { name: e.target.value })}
                            placeholder="เช่น price"
                            className="h-8 w-full rounded-sm border border-zinc-200 bg-white px-2 text-xs font-semibold outline-none focus:border-red-600"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[9px] font-bold text-zinc-400">ชนิดข้อมูล</label>
                          <select
                            value={col.type}
                            onChange={(e) => updateColumn(col.key, { type: e.target.value })}
                            className="h-8 w-full rounded-sm border border-zinc-200 bg-white px-2 text-[11px] font-bold outline-none focus:border-red-600"
                          >
                            {DDL_COLUMN_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <label className="flex h-8 shrink-0 items-end gap-1 pb-1.5 text-[10px] font-bold text-zinc-500 sm:items-center sm:pb-0">
                          <input
                            type="checkbox"
                            checked={col.notNull}
                            onChange={(e) => updateColumn(col.key, { notNull: e.target.checked })}
                            className="h-3.5 w-3.5 accent-red-600"
                          />
                          ต้องมีค่า
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addColumnRow}
                  className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-sm border border-dashed border-zinc-300 text-[11px] font-black text-zinc-500 transition hover:bg-zinc-50"
                >
                  <Plus size={12} /> เพิ่มคอลัมน์อีก 1 ช่อง
                </button>
              </div>

              <div>
                <StepHeading
                  n={4}
                  title="คอลัมน์ key หลัก"
                  hint="ไม่บังคับ — ใช้ระบุแถวแต่ละแถวไม่ให้ซ้ำกัน เช่น id"
                />
                <select
                  value={primaryKeyColumn}
                  onChange={(e) => setPrimaryKeyColumn(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— ไม่ตั้ง —</option>
                  {columns
                    .filter((col) => col.name.trim())
                    .map((col) => (
                      <option key={col.key} value={col.name.trim()}>
                        {col.name.trim()}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <StepHeading n={2} title="เลือกตารางที่จะเพิ่มคอลัมน์" />
                {schemaTables.length > 0 ? (
                  <select
                    value={targetTable}
                    onChange={(e) => setTargetTable(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">— เลือกตาราง —</option>
                    {schemaTables.map((table) => (
                      <option key={table.key} value={table.key}>
                        {table.key}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="flex items-center gap-1.5 py-2 text-[11px] font-semibold text-zinc-400">
                    {schemaLoading ? (
                      <>
                        <Loader2 size={12} className="animate-spin" /> กำลังโหลดรายชื่อตาราง...
                      </>
                    ) : (
                      "ไม่พบตารางในฐานข้อมูลนี้"
                    )}
                  </p>
                )}
              </div>
              <div>
                <StepHeading n={3} title="ตั้งค่าคอลัมน์ใหม่" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>ชื่อคอลัมน์ใหม่</label>
                    <input
                      type="text"
                      value={newColumnName}
                      onChange={(e) => setNewColumnName(e.target.value)}
                      placeholder="ชื่อคอลัมน์"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ชนิดข้อมูล</label>
                    <select
                      value={newColumnType}
                      onChange={(e) => setNewColumnType(e.target.value)}
                      className={inputClass}
                    >
                      {DDL_COLUMN_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="mt-1.5 text-[10px] font-semibold text-zinc-400">
                  คอลัมน์ใหม่จะเว้นว่างได้เสมอ (nullable) — เผื่อตารางมีข้อมูลอยู่แล้ว ถ้าอยากบังคับต้องมีค่า
                  ให้ไปตั้งเองทีหลังเมื่อกรอกข้อมูลครบทุกแถวแล้ว
                </p>
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-zinc-100 pt-4">
            <StepHeading n={mode === "createTable" ? 5 : 4} title="ตรวจสอบก่อนสร้าง" />
            {summarySentence && !preview.error && (
              <p className="rounded-sm border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-sky-700">
                {summarySentence}
              </p>
            )}
            {preview.error ? (
              <p className="mt-2 rounded-sm border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-400">
                {preview.error}
              </p>
            ) : (
              <details className="group mt-2">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-black text-zinc-400 hover:text-zinc-600">
                  <ChevronDown size={12} className="transition group-open:rotate-180" />
                  ดูคำสั่ง SQL ที่จะรันจริง
                </summary>
                <pre className="mt-1.5 overflow-x-auto rounded-sm border border-zinc-200 bg-zinc-900 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-emerald-300">
                  {preview.sql}
                </pre>
              </details>
            )}
          </div>

          {error && (
            <div className="mt-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
              {error}
            </div>
          )}
          {result && (
            <div className="mt-3 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
              รันสำเร็จแล้ว
            </div>
          )}

          <button
            type="button"
            onClick={mode === "createTable" ? submitCreateTable : submitAddColumn}
            disabled={submitting || Boolean(preview.error)}
            className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-sm bg-red-600 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-40"
          >
            {submitting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : mode === "createTable" ? (
              <>
                <Table2 size={13} /> สร้างตาราง
              </>
            ) : (
              <>
                <Columns3 size={13} /> เพิ่มคอลัมน์
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
