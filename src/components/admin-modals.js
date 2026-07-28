"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  History,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";

function Shell({ title, icon, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white p-5 shadow-xl">
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
        {footer}
      </div>
    </div>
  );
}

const yesNo = (value) =>
  value === null || value === undefined ? (
    <span className="text-zinc-300">–</span>
  ) : value ? (
    <Check size={12} className="text-emerald-600" />
  ) : (
    <X size={12} className="text-red-600" />
  );

/**
 * The checks that otherwise mean opening psql: who the service connects as,
 * who owns each of its tables, and exactly which GRANT is missing. Written
 * after two separate "permission denied" incidents that each took a hand-rolled
 * script to diagnose.
 */
export function HealthModal({ onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiJson("/api/health", { fallbackError: "ตรวจสุขภาพระบบไม่สำเร็จ" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetch resolves
    load();
  }, [load]);

  const copyFixes = async () => {
    try {
      await navigator.clipboard.writeText(data.fixes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Shell
      title="ตรวจสุขภาพระบบ"
      icon={<Activity size={15} className="text-red-600" />}
      onClose={onClose}
      footer={
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            ตรวจใหม่
          </button>
        </div>
      }
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
          {error}
        </div>
      )}
      {loading && !data ? (
        <p className="flex items-center gap-2 py-8 text-xs font-semibold text-zinc-400">
          <Loader2 size={14} className="animate-spin" /> กำลังตรวจ...
        </p>
      ) : data ? (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["ต่อเป็น user", data.identity.user],
              ["ฐานข้อมูล", data.identity.database],
              ["schema", data.identity.schema],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-zinc-200 px-3 py-2">
                <p className="text-[9px] font-black text-zinc-400">{label}</p>
                <p className="truncate text-xs font-black text-zinc-700">{value}</p>
              </div>
            ))}
          </div>

          {data.fixes.length > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-black text-red-700">
                <AlertTriangle size={13} /> สิทธิ์ไม่ครบ — ให้เจ้าของฐานข้อมูลรัน SQL นี้
              </p>
              <pre className="overflow-x-auto rounded-lg bg-zinc-900 px-3 py-2 font-mono text-[10px] leading-relaxed text-emerald-300">
                {data.fixes.join("\n")}
              </pre>
              <button
                type="button"
                onClick={copyFixes}
                className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-[10px] font-black text-red-700 transition hover:bg-red-100"
              >
                {copied ? "คัดลอกแล้ว" : "คัดลอก SQL"}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
              สิทธิ์ครบทุกตารางและ sequence
            </div>
          )}

          {data.missingTables.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
              ตารางที่ยังไม่ถูกสร้าง (จะถูกสร้างเองเมื่อเริ่มใช้ฟีเจอร์นั้น):{" "}
              {data.missingTables.join(", ")}
            </div>
          )}

          {data.env && !data.env.sessionSecret && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">
              <AlertTriangle size={13} className="mr-1 inline" />
              ยังไม่ได้ตั้ง <span className="font-mono">SESSION_SECRET</span> ใน .env — cookie
              ถูกเซ็นด้วยคีย์ที่อยู่ในโค้ด ใครก็ปลอมเป็น admin ได้ ให้ตั้งค่าแล้ว restart
            </div>
          )}
          {data.env && !data.env.encryptionKey && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
              ยังไม่ได้ตั้ง <span className="font-mono">GAMEDB_ENC_KEY</span> — เพิ่มฐานข้อมูลใหม่ผ่านหน้าเว็บไม่ได้
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-zinc-100 text-left font-black text-zinc-500">
                  <th className="px-2 py-1.5">object</th>
                  <th className="px-2 py-1.5">ชนิด</th>
                  <th className="px-2 py-1.5">เจ้าของ</th>
                  <th className="px-2 py-1.5 text-center">SELECT</th>
                  <th className="px-2 py-1.5 text-center">INSERT</th>
                  <th className="px-2 py-1.5 text-center">UPDATE</th>
                  <th className="px-2 py-1.5 text-center">DELETE</th>
                  <th className="px-2 py-1.5 text-center">USAGE</th>
                </tr>
              </thead>
              <tbody>
                {data.objects.map((object) => (
                  <tr key={object.name} className="border-t border-zinc-100">
                    <td className="px-2 py-1.5 font-mono font-bold text-zinc-700">{object.name}</td>
                    <td className="px-2 py-1.5 text-zinc-500">{object.kind}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                          object.ownedByMe
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {object.owner}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center">{yesNo(object.canSelect)}</td>
                    <td className="px-2 py-1.5 text-center">{yesNo(object.canInsert)}</td>
                    <td className="px-2 py-1.5 text-center">{yesNo(object.canUpdate)}</td>
                    <td className="px-2 py-1.5 text-center">{yesNo(object.canDelete)}</td>
                    <td className="px-2 py-1.5 text-center">{yesNo(object.canUse)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] font-semibold text-zinc-400">
            connection pool: ทั้งหมด {data.pool.total} · ว่าง {data.pool.idle} · รอคิว{" "}
            {data.pool.waiting} · ตรวจเมื่อ{" "}
            {new Date(data.checkedAt).toLocaleString("th-TH")}
          </p>
        </>
      ) : null}
    </Shell>
  );
}

/** Who changed which cell, and a one-click way to put the old value back. */
export function EditLogModal({ onClose }) {
  const [edits, setEdits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reverting, setReverting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson("/api/edit-log?limit=200", {
        fallbackError: "โหลดประวัติการแก้ไขไม่สำเร็จ",
      });
      setEdits(data.edits || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetch resolves
    load();
  }, [load]);

  const revert = async (entry) => {
    if (
      !window.confirm(
        `ย้อนค่า ${entry.column} ของแถว ${entry.pkValue} กลับเป็น "${entry.oldValue ?? "(ว่าง)"}" ?`
      )
    ) {
      return;
    }
    setReverting(entry.id);
    setError("");
    try {
      await apiJson(`/api/queries/${entry.queryId}/cell`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pkValue: entry.pkValue,
          column: entry.column,
          value: entry.oldValue ?? "",
        }),
        fallbackError: "ย้อนค่ากลับไม่สำเร็จ",
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setReverting(null);
    }
  };

  return (
    <Shell
      title="ประวัติการแก้ไขข้อมูล"
      icon={<History size={15} className="text-red-600" />}
      onClose={onClose}
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
          {error}
        </div>
      )}
      {loading ? (
        <p className="flex items-center gap-2 py-8 text-xs font-semibold text-zinc-400">
          <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
        </p>
      ) : edits.length === 0 ? (
        <p className="py-10 text-center text-xs font-semibold text-zinc-400">
          ยังไม่มีการแก้ไขข้อมูล
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-zinc-100 text-left font-black text-zinc-500">
                <th className="px-2 py-1.5">เวลา</th>
                <th className="px-2 py-1.5">ใคร</th>
                <th className="px-2 py-1.5">ตาราง</th>
                <th className="px-2 py-1.5">แถว</th>
                <th className="px-2 py-1.5">คอลัมน์</th>
                <th className="px-2 py-1.5">เดิม → ใหม่</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {edits.map((entry) => (
                <tr key={entry.id} className="border-t border-zinc-100">
                  <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">
                    {new Date(entry.createdAt).toLocaleString("th-TH", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-2 py-1.5 font-bold text-zinc-700">{entry.actor}</td>
                  <td className="px-2 py-1.5 font-mono text-zinc-600">{entry.table}</td>
                  <td className="px-2 py-1.5 font-mono text-zinc-600">
                    {entry.pkColumn}={entry.pkValue}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-zinc-600">{entry.column}</td>
                  <td className="px-2 py-1.5">
                    <span className="text-zinc-400 line-through">{entry.oldValue ?? "(ว่าง)"}</span>
                    {" → "}
                    <span className="font-black text-zinc-800">{entry.newValue ?? "(ว่าง)"}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => revert(entry)}
                      disabled={reverting === entry.id || !entry.queryId}
                      className="rounded-md border border-zinc-200 px-2 py-1 text-[10px] font-black text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40"
                      title="เขียนค่าเดิมกลับเข้าไป"
                    >
                      {reverting === entry.id ? "..." : "ย้อนกลับ"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
