"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { apiJson } from "@/lib/api-json";
import { GAMEINFO_PRICE_CHANNEL_MAX } from "@/lib/gameinfo-pack-list";

const squash = (label) => String(label ?? "").replace(/\s+/g, "").toLowerCase();
const newKey = () => `ch_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Sets which channels a game's packs are sold on, and the column holding each
// channel's price, for the "ดูกำไรของช่องทาง" bar on the game page. Each game
// and mode keeps its own list; "ใช้ค่าเริ่มต้น" goes back to the built-in four.
// Keys carry over from the list it starts with, so a channel's listing checks
// (gameinfo-pack-listings.js) stay with it when it is renamed.
export default function GameinfoPriceChannelEditor({ gameId, dataMode, configured, initial, columnLabels, onClose }) {
  const router = useRouter();
  const [rows, setRows] = useState(() => initial.map((row) => ({ ...row })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const known = new Set(columnLabels.map(squash));
  const missingName = rows.some((row) => !row.label.trim());

  function update(index, patch) {
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  }
  function move(index, step) {
    setRows((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(index + step, 0, row);
      return next;
    });
  }

  async function save(channels) {
    setSaving(true);
    setError("");
    try {
      await apiJson(`/api/gameinfo/gamelist/${gameId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceChannels: { mode: dataMode, channels } }),
        fallbackError: "บันทึกช่องทางขายไม่สำเร็จ",
      });
      router.refresh();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกช่องทางขายไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent showCloseButton={false} className="gd gd-modal sm:max-w-[620px]">
        <div className="gd-mhead">
          <div className="min-w-0">
            <DialogTitle className="text-xl leading-tight font-semibold text-white">ช่องทางขายของเกมนี้</DialogTitle>
            <DialogDescription className="text-[13px] text-white/90">
              {dataMode === "idpass" ? "โหมด ID-PASS" : "โหมด UID"} · กำไร = ราคาของช่องทาง − ต้นทุน
            </DialogDescription>
          </div>
          <button type="button" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-white" aria-label="ปิด" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="gd-mbody">
          {configured ? null : (
            <p className="gd-note">เกมนี้ยังใช้ช่องทางเริ่มต้นอยู่ แก้แล้วบันทึก เกมนี้จะใช้รายการของตัวเอง</p>
          )}
          {rows.length === 0 ? <p className="gd-note">ยังไม่มีช่องทาง กด “เพิ่มช่องทาง”</p> : null}
          <ul className="flex flex-col gap-2">
            {rows.map((row, index) => {
              const missing = row.column && !known.has(squash(row.column));
              return (
                <li key={row.key} className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--gd-line2)] p-2.5">
                  <input
                    className="gd-input min-w-[140px] flex-1"
                    value={row.label}
                    maxLength={40}
                    onChange={(event) => update(index, { label: event.target.value })}
                    placeholder="ชื่อช่องทาง เช่น G2G"
                    aria-label={`ชื่อช่องทางที่ ${index + 1}`}
                  />
                  <span className="gd-selw min-w-[160px] flex-1" style={{ maxWidth: "none" }}>
                    <select
                      className="gd-sel w-full"
                      value={row.column}
                      onChange={(event) => update(index, { column: event.target.value })}
                      aria-label={`คอลัมน์ราคาของช่องทางที่ ${index + 1}`}
                    >
                      <option value="">ราคา (ช่องราคาของแพ็ค)</option>
                      {missing ? <option value={row.column}>ไม่พบคอลัมน์ “{row.column}”</option> : null}
                      {columnLabels.map((label) => <option key={label} value={label}>{label}</option>)}
                    </select>
                  </span>
                  <span className="flex gap-1">
                    <button type="button" className="gd-btn sm disabled:opacity-40" disabled={index === 0} onClick={() => move(index, -1)} aria-label="เลื่อนขึ้น"><ChevronUp size={16} aria-hidden="true" /></button>
                    <button type="button" className="gd-btn sm disabled:opacity-40" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label="เลื่อนลง"><ChevronDown size={16} aria-hidden="true" /></button>
                    <button type="button" className="gd-btn sm disabled:opacity-40" onClick={() => setRows((current) => current.filter((_, at) => at !== index))} aria-label={`ลบ ${row.label || "ช่องทางนี้"}`}><Trash2 size={16} aria-hidden="true" /></button>
                  </span>
                  {missing ? <span className="w-full text-xs text-[var(--gd-red)]">เกมนี้ไม่มีคอลัมน์ชื่อนี้แล้ว ช่องทางนี้จะไม่ขึ้นจนกว่าจะเลือกคอลัมน์ใหม่</span> : null}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="gd-btn sm disabled:opacity-40 self-start"
            disabled={rows.length >= GAMEINFO_PRICE_CHANNEL_MAX}
            onClick={() => setRows((current) => [...current, { key: newKey(), label: "", column: "" }])}
          >
            <Plus size={15} aria-hidden="true" /> เพิ่มช่องทาง
          </button>
          <span className="gd-note">เลือกคอลัมน์ที่เก็บราคาขายเป็นเงินบาทของช่องทางนั้น ถ้ายังไม่มี ให้เพิ่มคอลัมน์ที่หน้าแก้ไข Pack ก่อน · สูงสุด {GAMEINFO_PRICE_CHANNEL_MAX} ช่องทาง</span>
          {error ? <p role="alert" className="text-sm text-[var(--gd-red)]">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--gd-line2)] pt-3">
            {configured ? (
              <button type="button" className="gd-btn sm disabled:opacity-40" disabled={saving} onClick={() => save(null)}>ใช้ค่าเริ่มต้น</button>
            ) : null}
            <span className="flex-1" />
            <button type="button" className="gd-btn sm disabled:opacity-40" disabled={saving} onClick={onClose}>ยกเลิก</button>
            <button
              type="button"
              className="gd-btn sm disabled:opacity-40 red"
              disabled={saving || missingName}
              title={missingName ? "ใส่ชื่อทุกช่องทางก่อน" : undefined}
              onClick={() => save(rows.map(({ key, label, column }) => ({ key, label: label.trim(), column })))}
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
