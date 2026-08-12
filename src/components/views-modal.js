"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Eye,
  Layers,
  Link2,
  Loader2,
  Play,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { apiJson } from "@/lib/api-json";
import MissingNotice from "@/components/missing-notice";
import ModalResizeHandle from "@/components/modal-resize-handle";
import { useResizableModalWidth } from "@/lib/use-resizable-modal-width";

const inputClass =
  "h-9 w-full rounded-sm border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold outline-none focus:border-red-600 focus:bg-white";
const labelClass = "mb-1 block text-[10px] font-black text-zinc-500";

const EMPTY_FORM = {
  name: "",
  description: "",
  isPublic: true,
  isDefault: false,
  isReadOnly: false,
  ownerOnly: false,
  // Matches the DB column defaults (see gamedb-views-repository.js): a new
  // template starts letting Staff write if their account is already granted
  // to, same as every other template; "user" starts locked out, same as
  // everywhere else a "user" account can go.
  allowStaffEdit: true,
  allowUserEdit: false,
  sharedWith: [],
};

/**
 * Admin side of screen templates: save the current arrangement of panels under
 * a name and decide who gets it. Staff see the picker in the header; User
 * accounts also use these templates, but cannot customize their arrangement.
 */
export default function ViewsModal({
  me,
  views,
  buildConfig,
  panelCount,
  onClose,
  onChanged,
  onApply,
  onPreview,
}) {
  const [users, setUsers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const { width, startResize, resizing } = useResizableModalWidth(768);

  const copyLink = async (view) => {
    const url = `${window.location.origin}/view/${view.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // A blocked clipboard still leaves the URL visible via window.prompt.
      window.prompt("คัดลอกลิงก์นี้:", url);
      return;
    }
    setCopiedId(view.id);
    setTimeout(() => setCopiedId((prev) => (prev === view.id ? null : prev)), 1500);
  };

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiJson("/api/users", { fallbackError: "โหลดรายชื่อผู้ใช้ไม่สำเร็จ" });
      setUsers(data.users || []);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the fetch resolves
    loadUsers();
  }, [loadUsers]);

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setNotice("");
  };

  const startEdit = (view) => {
    setEditingId(view.id);
    setForm({
      name: view.name,
      description: view.description,
      isPublic: view.isPublic,
      isDefault: view.isDefault,
      isReadOnly: Boolean(view.isReadOnly),
      ownerOnly: Boolean(view.ownerOnly),
      allowStaffEdit: view.allowStaffEdit !== false,
      allowUserEdit: Boolean(view.allowUserEdit),
      sharedWith: view.sharedWith,
    });
    setError("");
    setNotice("");
  };

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleUser = (id) =>
    setForm((prev) => ({
      ...prev,
      sharedWith: prev.sharedWith.includes(id)
        ? prev.sharedWith.filter((item) => item !== id)
        : [...prev.sharedWith, id],
    }));

  // withConfig=false keeps the saved panels and only changes name/sharing, so
  // renaming a template does not silently overwrite it with whatever screen the
  // admin happens to have open.
  const save = async (withConfig) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = { ...form };
      if (withConfig) payload.config = buildConfig();
      if (editingId) {
        await apiJson(`/api/views/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          fallbackError: "บันทึกเทมเพลตไม่สำเร็จ",
        });
        setNotice(withConfig ? "อัปเดตหน้าจอของเทมเพลตนี้แล้ว" : "บันทึกการตั้งค่าแล้ว");
      } else {
        const data = await apiJson("/api/views", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, config: buildConfig() }),
          fallbackError: "สร้างเทมเพลตไม่สำเร็จ",
        });
        setEditingId(data.view.id);
        setNotice("สร้างเทมเพลตแล้ว");
      }
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (view) => {
    if (!window.confirm(`ลบเทมเพลต "${view.name}" ?`)) return;
    setError("");
    try {
      await apiJson(`/api/views/${view.id}`, {
        method: "DELETE",
        fallbackError: "ลบเทมเพลตไม่สำเร็จ",
      });
      await onChanged();
      if (editingId === view.id) startCreate();
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
            <Layers size={15} className="text-red-600" /> เทมเพลตหน้าจอ
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

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[1fr_1.3fr]">
          <div className="space-y-1.5">
            {views.map((view) => (
              <div
                key={view.id}
                className={`group flex items-center gap-2 rounded-sm border px-3 py-2.5 transition ${
                  editingId === view.id
                    ? "border-red-600 bg-red-50"
                    : "border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => startEdit(view)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-xs font-black text-zinc-700">
                    {view.name}
                    {view.isDefault && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700">
                        หน้าเริ่มต้น
                      </span>
                    )}
                    {view.isReadOnly && (
                      <span className="ml-1.5 rounded bg-zinc-200 px-1.5 py-0.5 text-[9px] font-black text-zinc-600">
                        ดูอย่างเดียว
                      </span>
                    )}
                    {view.ownerOnly && (
                      <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-black text-sky-700">
                        เจ้าของแก้ได้เท่านั้น
                      </span>
                    )}
                    {!view.isReadOnly && view.allowUserEdit && (
                      <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">
                        User แก้ข้อมูลได้
                      </span>
                    )}
                    {!view.isReadOnly && !view.allowStaffEdit && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700">
                        ปิดสิทธิ์ Staff แก้ข้อมูล
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[10px] font-semibold text-zinc-400">
                    {view.config?.panels?.length || 0} ตาราง ·{" "}
                    {view.isPublic
                      ? "ทุกคนเห็น"
                      : `${view.sharedWith.length} คนที่เลือกไว้`}
                    {view.createdBy && (
                      <>
                        {" · "}
                        เจ้าของ: {view.createdBy}
                        {me && view.createdBy === me.username && " (คุณ)"}
                      </>
                    )}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onApply(view)}
                  className="shrink-0 rounded-sm p-1 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700"
                  title="เปิดเทมเพลตนี้"
                >
                  <Play size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => copyLink(view)}
                  className={`shrink-0 rounded-sm p-1 transition hover:bg-zinc-200 hover:text-zinc-700 ${
                    copiedId === view.id ? "text-emerald-600" : "text-zinc-400"
                  }`}
                  title="คัดลอกลิงก์ตรงไปเทมเพลตนี้ (/view/id) — เปิดได้เลยไม่ต้องเข้า SystemDB ก่อนแล้วค่อยเลือก"
                >
                  {copiedId === view.id ? <Check size={12} /> : <Link2 size={12} />}
                </button>
                <button
                  type="button"
                  onClick={() => onPreview?.(view)}
                  className="shrink-0 rounded-sm p-1 text-zinc-400 transition hover:bg-amber-100 hover:text-amber-700"
                  title="Preview แบบ User"
                >
                  <Eye size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(view)}
                  className="shrink-0 rounded-sm p-1 text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-red-600 group-hover:opacity-100"
                  title="ลบเทมเพลต"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={startCreate}
              className={`flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed px-3 py-2.5 text-[11px] font-black transition ${
                editingId === null
                  ? "border-red-600 text-red-600"
                  : "border-zinc-300 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
              }`}
            >
              <Plus size={12} /> บันทึกหน้าจอนี้เป็นเทมเพลตใหม่
            </button>
          </div>

          <div className="space-y-2.5">
            <p className="text-[10px] font-black text-zinc-500">
              {editingId ? `แก้ไข: ${form.name}` : `เทมเพลตใหม่จากหน้าจอปัจจุบัน (${panelCount} ตาราง)`}
            </p>

            <div>
              <label className={labelClass}>ชื่อเทมเพลต</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="เช่น หน้าจอทีมสต็อก"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>คำอธิบาย (ไม่บังคับ)</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="สั้น ๆ ว่าหน้านี้ใช้ดูอะไร"
                className={inputClass}
              />
            </div>

            <div className="space-y-2 rounded-sm border border-zinc-200 p-3">
              <label className="flex items-center gap-2 text-[11px] font-bold text-zinc-600">
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(e) => setField("isPublic", e.target.checked)}
                />
                ให้ทุกคนในระบบเห็นเทมเพลตนี้
              </label>
              <label className="flex items-center gap-2 text-[11px] font-bold text-zinc-600">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setField("isDefault", e.target.checked)}
                />
                ใช้เป็นหน้าเริ่มต้น (เปิดให้อัตโนมัติเมื่อยังไม่มีหน้าจอของตัวเอง)
              </label>
              <label className="flex items-center gap-2 text-[11px] font-bold text-zinc-600">
                <input
                  type="checkbox"
                  checked={form.isReadOnly}
                  onChange={(e) => setField("isReadOnly", e.target.checked)}
                />
                ดูอย่างเดียว (ล็อกไม่ให้แก้ layout หรือแก้ข้อมูล ไม่ว่าใครเปิด รวมถึง Admin)
              </label>
              <label className="flex items-center gap-2 text-[11px] font-bold text-zinc-600">
                <input
                  type="checkbox"
                  checked={form.ownerOnly}
                  onChange={(e) => setField("ownerOnly", e.target.checked)}
                />
                จำกัดให้เจ้าของ{editingId ? ` (${views.find((v) => v.id === editingId)?.createdBy || "คุณ"})` : ""}
                {" "}แก้ layout ได้เท่านั้นตอนเปิดใช้งานจริง (Admin คนอื่นยังจัดการเทมเพลตนี้ได้จากที่นี่เสมอ)
              </label>

              <div className="rounded-sm border border-zinc-200 bg-zinc-50 p-2.5">
                <p className="mb-1.5 text-[10px] font-black text-zinc-500">
                  สิทธิ์แก้ไขข้อมูลในตาราง ผ่านเทมเพลตนี้โดยเฉพาะ
                </p>
                <label className="flex items-center gap-2 text-[11px] font-bold text-zinc-600">
                  <input
                    type="checkbox"
                    checked={form.allowStaffEdit}
                    disabled={form.isReadOnly}
                    onChange={(e) => setField("allowStaffEdit", e.target.checked)}
                  />
                  อนุญาตให้ Staff แก้ไข/เพิ่ม/ลบข้อมูลผ่านเทมเพลตนี้ (ต้องได้รับสิทธิ์จาก
                  &quot;จัดการสิทธิ์ผู้ใช้&quot; ของบัญชีนั้นด้วย — ติ๊กนี้ปิดได้เฉพาะเทมเพลตนี้เท่านั้น)
                </label>
                <label className="mt-1.5 flex items-center gap-2 text-[11px] font-bold text-zinc-600">
                  <input
                    type="checkbox"
                    checked={form.allowUserEdit}
                    disabled={form.isReadOnly}
                    onChange={(e) => setField("allowUserEdit", e.target.checked)}
                  />
                  อนุญาตให้ User แก้ไข/เพิ่ม/ลบข้อมูลผ่านเทมเพลตนี้ (ปกติบัญชี User ดูอย่างเดียว —
                  ติ๊กนี้เปิดสิทธิ์เขียนเฉพาะเทมเพลตนี้)
                </label>
                {form.isReadOnly && (
                  <p className="mt-1.5 text-[10px] font-semibold text-zinc-400">
                    ปิดใช้งานอยู่เพราะติ๊ก &quot;ดูอย่างเดียว&quot; ไว้ด้านบน — เทมเพลตนี้ล็อกไม่ให้แก้ข้อมูลทุกคนอยู่แล้ว
                  </p>
                )}
              </div>

              {!form.isPublic && (
                <div>
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-black text-zinc-500">
                    <Users size={11} /> เลือกคนที่จะส่งให้
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {users.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleUser(user.id)}
                        className={`flex items-center gap-1 rounded-sm border px-2.5 py-1 text-[10px] font-bold transition ${
                          form.sharedWith.includes(user.id)
                            ? "border-red-600 bg-red-600 text-white"
                            : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                        }`}
                      >
                        {form.sharedWith.includes(user.id) && <Check size={9} />}
                        {user.displayName || user.username}
                      </button>
                    ))}
                    {users.length === 0 && (
                      <span className="text-[10px] font-semibold text-zinc-400">
                        ยังไม่มีผู้ใช้คนอื่น
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
                {notice}
              </div>
            )}

            <MissingNotice items={[!form.name.trim() && "ชื่อหน้าจอ"].filter(Boolean)} />
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              {editingId && (
                <button
                  type="button"
                  onClick={() => save(true)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-sm border border-zinc-200 px-4 py-2.5 text-xs font-black text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
                  title="เอาหน้าจอที่เปิดอยู่ตอนนี้ไปทับของเดิมในเทมเพลต"
                >
                  <Layers size={13} /> อัปเดตด้วยหน้าจอปัจจุบัน
                </button>
              )}
              <button
                type="button"
                onClick={() => save(!editingId)}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-1.5 rounded-sm bg-red-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {editingId ? "บันทึกการตั้งค่า" : "สร้างเทมเพลต"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
