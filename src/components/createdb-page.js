"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Table2, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { buildAddColumnSql, buildCreateTableSql, DDL_COLUMN_TYPES } from "@/lib/gamedb-schema-ddl";

const labelClass = "mb-1 block text-[10px] font-black text-zinc-500";
const inputClass =
  "h-9 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white";

function emptyColumn() {
  return { key: Math.random().toString(36).slice(2), name: "", type: "text", notNull: false };
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

        <div className="rounded-sm border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex gap-1.5">
            <button
              type="button"
              onClick={() => setMode("createTable")}
              className={`h-8 flex-1 rounded-sm text-xs font-black transition ${
                mode === "createTable"
                  ? "bg-red-600 text-white"
                  : "border border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              สร้างตารางใหม่
            </button>
            <button
              type="button"
              onClick={() => setMode("addColumn")}
              className={`h-8 flex-1 rounded-sm text-xs font-black transition ${
                mode === "addColumn"
                  ? "bg-red-600 text-white"
                  : "border border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              เพิ่มคอลัมน์ในตารางเดิม
            </button>
          </div>

          <div className="mb-3">
            <label className={labelClass}>ฐานข้อมูล</label>
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className={inputClass}
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
            <div className="space-y-3">
              <div>
                <label className={labelClass}>ชื่อตารางใหม่ (เช่น packages หรือ public.packages)</label>
                <input
                  type="text"
                  value={newTable}
                  onChange={(e) => setNewTable(e.target.value)}
                  placeholder="ชื่อตาราง"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>คอลัมน์</label>
                <div className="space-y-2">
                  {columns.map((col) => (
                    <div key={col.key} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) => updateColumn(col.key, { name: e.target.value })}
                        placeholder="ชื่อคอลัมน์"
                        className={`${inputClass} flex-1`}
                      />
                      <select
                        value={col.type}
                        onChange={(e) => updateColumn(col.key, { type: e.target.value })}
                        className="h-9 rounded-sm border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-bold outline-none focus:border-red-600"
                      >
                        {DDL_COLUMN_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                      <label className="flex h-9 shrink-0 items-center gap-1 text-[10px] font-bold text-zinc-500">
                        <input
                          type="checkbox"
                          checked={col.notNull}
                          onChange={(e) => updateColumn(col.key, { notNull: e.target.checked })}
                          className="h-3.5 w-3.5 accent-red-600"
                        />
                        ต้องมีค่า
                      </label>
                      <button
                        type="button"
                        onClick={() => removeColumnRow(col.key)}
                        disabled={columns.length === 1}
                        className="shrink-0 rounded-sm p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600 disabled:opacity-30"
                        title="ลบคอลัมน์นี้ออกจากรายการ"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addColumnRow}
                  className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-sm border border-dashed border-zinc-300 text-[11px] font-black text-zinc-500 transition hover:bg-zinc-50"
                >
                  <Plus size={12} /> เพิ่มคอลัมน์
                </button>
              </div>

              <div>
                <label className={labelClass}>คอลัมน์ key หลัก (ไม่บังคับ)</label>
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
            <div className="space-y-3">
              <div>
                <label className={labelClass}>ตารางที่จะเพิ่มคอลัมน์</label>
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
              <p className="text-[10px] font-semibold text-zinc-400">
                คอลัมน์ใหม่จะเว้นว่างได้เสมอ (nullable) — เผื่อตารางมีข้อมูลอยู่แล้ว ถ้าอยากบังคับต้องมีค่า
                ให้ไปตั้งเองทีหลังเมื่อกรอกข้อมูลครบทุกแถวแล้ว
              </p>
            </div>
          )}

          <div className="mt-3">
            <label className={labelClass}>คำสั่งที่จะรัน</label>
            {preview.error ? (
              <p className="rounded-sm border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-400">
                {preview.error}
              </p>
            ) : (
              <pre className="overflow-x-auto rounded-sm border border-zinc-200 bg-zinc-900 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-emerald-300">
                {preview.sql}
              </pre>
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
              "สร้างตาราง"
            ) : (
              "เพิ่มคอลัมน์"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
