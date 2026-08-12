"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2, Plus, Trash2, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import ModalResizeHandle from "@/components/modal-resize-handle";
import { useResizableModalWidth } from "@/lib/use-resizable-modal-width";

/**
 * Who is allowed to skip gamedb's own login by arriving already-verified
 * from hiring, and which gamedb account they land as. hiring only vouches
 * for the email being real (it went through hiring's own OTP) -- it says
 * nothing about gamedb roles, so every entry here is a deliberate choice by
 * a gamedb Admin, not something hiring can hand out on its own.
 */
export default function SsoMapModal({ onClose }) {
  const [mappings, setMappings] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hiringEmail, setHiringEmail] = useState("");
  const [gamedbUsername, setGamedbUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { width, startResize, resizing } = useResizableModalWidth(512);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [mapData, userData] = await Promise.all([
        apiJson("/api/sso-map", { fallbackError: "โหลดรายการเชื่อมบัญชีไม่สำเร็จ" }),
        apiJson("/api/users", { fallbackError: "โหลดรายชื่อผู้ใช้ไม่สำเร็จ" }),
      ]);
      setMappings(mapData.mappings || []);
      setUsers(userData.users || []);
      setGamedbUsername((prev) => prev || userData.users?.[0]?.username || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state changes after the fetch resolves
    load();
  }, [load]);

  const addMapping = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = await apiJson("/api/sso-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiringEmail, gamedbUsername }),
        fallbackError: "เชื่อมบัญชีไม่สำเร็จ",
      });
      setMappings((prev) => [
        ...prev.filter((item) => item.hiringEmail !== data.mapping.hiringEmail),
        data.mapping,
      ]);
      setHiringEmail("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeMapping = async (id) => {
    if (!window.confirm("เลิกเชื่อมบัญชี experience นี้?")) return;
    setError("");
    try {
      await apiJson(`/api/sso-map/${id}`, {
        method: "DELETE",
        fallbackError: "เลิกเชื่อมบัญชีไม่สำเร็จ",
      });
      setMappings((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div
        className="relative flex max-h-[90vh] w-full flex-col rounded-sm bg-white p-5 shadow-xl"
        style={{ maxWidth: width }}
      >
        <ModalResizeHandle onPointerDown={startResize} active={resizing} />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <Link2 size={15} className="text-red-600" />
            เชื่อมบัญชี experience
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

        <p className="mb-3 text-[11px] font-semibold text-zinc-500">
          ผูกอีเมล Admin ของ experience เข้ากับบัญชี gamedb — คนที่ login experience ด้วยอีเมลนี้แล้วกดปุ่ม
          &ldquo;เข้าสู่ระบบด้วยบัญชี experience&rdquo; จะได้เข้า gamedb เป็นบัญชีที่เลือกไว้ ไม่ต้องพิมพ์ username/password ของ gamedb เอง
        </p>

        <form onSubmit={addMapping} className="mb-4 grid gap-2 rounded-sm border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="email"
            required
            value={hiringEmail}
            onChange={(e) => setHiringEmail(e.target.value)}
            placeholder="อีเมล Admin ของ experience"
            className="h-9 rounded-sm border border-zinc-200 bg-white px-2.5 text-xs font-semibold outline-none focus:border-red-600"
          />
          <select
            value={gamedbUsername}
            onChange={(e) => setGamedbUsername(e.target.value)}
            className="h-9 rounded-sm border border-zinc-200 bg-white px-2.5 text-xs font-semibold outline-none focus:border-red-600"
          >
            {users.map((user) => (
              <option key={user.id} value={user.username}>
                {user.username} ({user.role})
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving || !hiringEmail.trim() || !gamedbUsername}
            className="flex h-9 items-center justify-center gap-1 rounded-sm bg-red-600 px-3 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            เชื่อม
          </button>
        </form>

        {error && (
          <div className="mb-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-zinc-200">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-8 text-xs font-bold text-zinc-400">
              <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
            </p>
          ) : mappings.length === 0 ? (
            <p className="px-3 py-8 text-center text-[11px] font-semibold text-zinc-400">
              ยังไม่มีบัญชี experience ที่เชื่อมไว้
            </p>
          ) : (
            mappings.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-black text-zinc-700">{item.hiringEmail}</p>
                  <p className="truncate text-[9px] font-semibold text-zinc-400">
                    → gamedb: {item.gamedbUsername}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeMapping(item.id)}
                  className="shrink-0 rounded-sm border border-zinc-200 bg-white p-1.5 text-zinc-400 transition hover:border-red-200 hover:text-red-600"
                  aria-label={`เลิกเชื่อม ${item.hiringEmail}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
