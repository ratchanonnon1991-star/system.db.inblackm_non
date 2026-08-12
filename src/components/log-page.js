"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, History, Loader2, LogIn, XCircle } from "lucide-react";
import { apiJson } from "@/lib/api-json";

function SectionCard({ icon, title, children }) {
  return (
    <section className="rounded-sm border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-black text-zinc-700">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

/** Every login attempt, success or not -- read-only, there is nothing to
 * revert about someone having tried to sign in. */
function LoginLogSection() {
  const [logins, setLogins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson("/api/login-log?limit=200", {
          fallbackError: "โหลดประวัติการเข้าสู่ระบบไม่สำเร็จ",
        });
        if (!cancelled) setLogins(data.logins || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SectionCard icon={<LogIn size={15} className="text-red-600" />} title="ประวัติการเข้าสู่ระบบ">
      {error && (
        <div className="mb-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
          {error}
        </div>
      )}
      {loading ? (
        <p className="flex items-center gap-2 py-8 text-xs font-semibold text-zinc-400">
          <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
        </p>
      ) : logins.length === 0 ? (
        <p className="px-8 py-4 text-center text-xs font-semibold text-zinc-400">
          ยังไม่มีการเข้าสู่ระบบ
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-zinc-200">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-zinc-100 text-left font-black text-zinc-500">
                <th className="px-2 py-1.5">เวลา</th>
                <th className="px-2 py-1.5">Username</th>
                <th className="px-2 py-1.5">ผล</th>
                <th className="px-2 py-1.5">IP</th>
              </tr>
            </thead>
            <tbody>
              {logins.map((entry) => (
                <tr key={entry.id} className="border-t border-zinc-100">
                  <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">
                    {new Date(entry.createdAt).toLocaleString("th-TH", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-2 py-1.5 font-bold text-zinc-700">{entry.username}</td>
                  <td className="px-2 py-1.5">
                    {entry.success ? (
                      <span className="inline-flex items-center gap-1 font-black text-emerald-600">
                        <CheckCircle2 size={12} /> สำเร็จ
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 font-black text-red-600"
                        title={entry.reason || ""}
                      >
                        <XCircle size={12} /> ไม่สำเร็จ
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-zinc-600">{entry.ip || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

/** Who changed which cell (or added/removed which row), and a one-click way
 * to put it back. */
function EditLogSection() {
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

  // A restore is itself an insert underneath, so undoing it is the same
  // "delete this row" action as undoing a plain add.
  const isRowInsert = (entry) => entry.column === "(เพิ่มแถว)" || entry.column === "(กู้คืนแถวที่ลบ)";
  const isRowDelete = (entry) => entry.column === "(ลบแถว)";

  // A delete's snapshot is the row's own JSON, cut off past SUMMARY_LIMIT
  // characters (see gamedb-row-writer.js) -- past that point it can't be
  // parsed back into a row, so restoring it can't be offered.
  const deletedRowSnapshot = (entry) => {
    if (!isRowDelete(entry) || !entry.oldValue || entry.oldValue.endsWith("…")) return null;
    try {
      const parsed = JSON.parse(entry.oldValue);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  };

  const canRevert = (entry) => {
    if (!entry.queryId) return false;
    if (isRowInsert(entry)) return entry.pkValue !== null && entry.pkValue !== undefined;
    if (isRowDelete(entry)) return deletedRowSnapshot(entry) !== null;
    return true;
  };

  const revert = async (entry) => {
    if (isRowInsert(entry)) {
      if (!window.confirm(`ลบแถวที่เพิ่งเพิ่ม (${entry.pkColumn}=${entry.pkValue}) ที่เพิ่มพลาดหรือไม่ตั้งใจ?`)) {
        return;
      }
      setReverting(entry.id);
      setError("");
      try {
        await apiJson(`/api/queries/${entry.queryId}/row`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pkValue: entry.pkValue }),
          fallbackError: "ลบแถวที่เพิ่มไปไม่สำเร็จ",
        });
        await load();
      } catch (err) {
        setError(err.message);
      } finally {
        setReverting(null);
      }
      return;
    }

    if (isRowDelete(entry)) {
      const snapshot = deletedRowSnapshot(entry);
      if (!snapshot) return;
      if (!window.confirm(`กู้คืนแถวที่ถูกลบ (${entry.pkColumn}=${entry.pkValue}) กลับเข้าตาราง?`)) {
        return;
      }
      setReverting(entry.id);
      setError("");
      try {
        await apiJson(`/api/queries/${entry.queryId}/row/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: snapshot }),
          fallbackError: "กู้คืนแถวไม่สำเร็จ",
        });
        await load();
      } catch (err) {
        setError(err.message);
      } finally {
        setReverting(null);
      }
      return;
    }

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
    <SectionCard icon={<History size={15} className="text-red-600" />} title="ประวัติการแก้ไขข้อมูล">
      {error && (
        <div className="mb-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
          {error}
        </div>
      )}
      {loading ? (
        <p className="flex items-center gap-2 py-8 text-xs font-semibold text-zinc-400">
          <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
        </p>
      ) : edits.length === 0 ? (
        <p className="px-8 py-4 text-center text-xs font-semibold text-zinc-400">
          ยังไม่มีการแก้ไขข้อมูล
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-zinc-200">
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
                      disabled={reverting === entry.id || !canRevert(entry)}
                      className="rounded-sm border border-zinc-200 px-2 py-1 text-[10px] font-black text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40"
                      title={
                        isRowInsert(entry)
                          ? "ลบแถวที่เพิ่งเพิ่มนี้ทิ้ง"
                          : isRowDelete(entry)
                            ? canRevert(entry)
                              ? "เพิ่มแถวนี้กลับเข้าตาราง"
                              : "ข้อมูลแถวนี้ยาวเกินกว่าจะกู้คืนอัตโนมัติได้"
                            : "เขียนค่าเดิมกลับเข้าไป"
                      }
                    >
                      {reverting === entry.id
                        ? "..."
                        : isRowInsert(entry)
                          ? "ลบแถวนี้"
                          : isRowDelete(entry)
                            ? "กู้คืนแถว"
                            : "ย้อนกลับ"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export default function LogPage() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/systemdb"
            className="flex items-center gap-1 rounded-sm border border-zinc-200 bg-white px-3 py-1.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50"
          >
            <ArrowLeft size={14} /> กลับ
          </Link>
          <h1 className="text-sm font-black text-zinc-800">ประวัติการใช้งานระบบ</h1>
        </div>
        <LoginLogSection />
        <EditLogSection />
      </div>
    </div>
  );
}
