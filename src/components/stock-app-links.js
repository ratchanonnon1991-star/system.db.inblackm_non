"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Link2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { STOCK_LINK_WARN_DAYS, stockAppLinkDaysText } from "@/lib/stock-app-links";
import { StockDialog, StockField, stockInputClass } from "@/components/stock-ui";

// Install links for the top-up apps and when each runs out (src/lib/stock-app-links.js).

const TONE = {
  expired: "bg-red-100 text-red-700",
  soon: "bg-amber-100 text-amber-800",
  ok: "bg-emerald-50 text-emerald-700",
};

export default function StockAppLinks({ links, canEdit }) {
  const [editing, setEditing] = useState(null);
  return (
    <section aria-labelledby="app-links" id="app-links-section" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="app-links" className="text-lg font-black">ลิงก์แอปเติม</h2>
        {canEdit ? (
          <button type="button" onClick={() => setEditing({})} className="flex items-center gap-1 text-sm font-extrabold text-[#B00004] hover:underline">
            <Plus size={14} /> เพิ่มลิงก์
          </button>
        ) : null}
      </div>
      {links.length ? (
        <div className="flex flex-col divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
          {links.map((link) => (
            <div key={link.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[18px] py-3 text-sm">
              <span className={`inline-block min-w-24 rounded-full px-2.5 py-1 text-center text-[13px] font-black ${TONE[link.tone]}`}>{stockAppLinkDaysText(link.daysLeft)}</span>
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-extrabold hover:underline">{link.name} <ExternalLink size={12} /></a>
              <span className="text-xs text-zinc-600">หมดอายุ {link.expiresOn}{link.note ? ` · ${link.note}` : ""}</span>
              {canEdit ? (
                <button type="button" onClick={() => setEditing(link)} aria-label={`แก้ ${link.name}`} className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100">
                  <Pencil size={14} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-8 text-center text-sm text-zinc-600">
          ยังไม่มีลิงก์ · ใส่ลิงก์ Cydia / BG / Sileo พร้อมวันหมดอายุ ระบบจะเตือนก่อนหมด {STOCK_LINK_WARN_DAYS} วัน
        </p>
      )}
      {editing ? <AppLinkDialog link={editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

function AppLinkDialog({ link, onClose }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: link.name || "", url: link.url || "", expiresOn: link.expiresOn || "", note: link.note || "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  async function send(method) {
    if (method === "DELETE" && !window.confirm(`ลบลิงก์ ${link.name}?`)) return;
    setSaving(true);
    setError("");
    try {
      await apiJson(link.id ? `/api/stock/links/${link.id}` : "/api/stock/links", {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(form),
        fallbackError: "บันทึกลิงก์ไม่สำเร็จ",
      });
      onClose();
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <StockDialog title={link.id ? `แก้ลิงก์ ${link.name}` : "เพิ่มลิงก์แอปเติม"} subtitle="ใส่แค่ชื่อ ลิงก์ และวันหมดอายุ · ห้ามใส่ ID หรือรหัสผ่าน" icon={<Link2 size={18} strokeWidth={2.4} />} onClose={onClose}
      footer={(
        <>
          {link.id ? (
            <button type="button" disabled={saving} onClick={() => send("DELETE")} className="mr-auto flex h-10 items-center gap-1.5 rounded-full border border-red-300 px-4 text-sm font-extrabold text-red-700 hover:bg-red-50 disabled:opacity-50">
              <Trash2 size={14} /> ลบ
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="h-10 rounded-full border border-zinc-300 px-4 text-sm font-extrabold text-zinc-700 hover:bg-zinc-50">ยกเลิก</button>
          <button type="button" disabled={saving} onClick={() => send(link.id ? "PATCH" : "POST")} className="flex h-10 items-center gap-1.5 rounded-full bg-zinc-900 px-4 text-sm font-extrabold text-white hover:bg-zinc-700 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : null} บันทึก
          </button>
        </>
      )}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <StockField label="ชื่อ" htmlFor="link-name">
            <input id="link-name" value={form.name} onChange={(event) => set({ name: event.target.value })} className={stockInputClass} placeholder="เช่น Cydia, BG, LAST WAR Sileo" />
          </StockField>
          <StockField label="วันหมดอายุลิงก์" htmlFor="link-expires">
            <input id="link-expires" type="date" value={form.expiresOn} onChange={(event) => set({ expiresOn: event.target.value })} className={stockInputClass} />
          </StockField>
        </div>
        <StockField label="ลิงก์" htmlFor="link-url">
          <input id="link-url" value={form.url} onChange={(event) => set({ url: event.target.value })} className={stockInputClass} placeholder="https://" />
        </StockField>
        <StockField label="หมายเหตุ" htmlFor="link-note">
          <input id="link-note" value={form.note} onChange={(event) => set({ note: event.target.value })} className={stockInputClass} placeholder="ไม่บังคับ เช่น ใช้กับเกมไหน" />
        </StockField>
        {error ? <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-[13px] font-bold text-red-700">{error}</p> : null}
      </div>
    </StockDialog>
  );
}
