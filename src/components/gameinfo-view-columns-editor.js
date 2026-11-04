"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { apiJson } from "@/lib/api-json";
import { GAMEINFO_COLUMN_ROLE_ALL_GAMES, hiddenGameinfoColumnKeys } from "@/lib/gameinfo-column-roles";
import { GAMEINFO_LIST_COLUMN_MAX, isGameinfoUserAddedColumnKey } from "@/lib/gameinfo-pack-list";

const VIEW = {
  product: { role: "admin", label: "Product" },
  topup: { role: "topup", label: "Topup" },
};

/**
 * An admin's view settings for one game, from its page: which columns the
 * Product or Topup view shows at all (the same rules as the สิทธิ์คอลัมน์
 * page, for this game), and which of them sit in the pack rows next to the
 * fixed figures. Both save at once, then the page reloads its data.
 */
export default function GameinfoViewColumnsEditor({ gameId, view, rowColumnKeys = null, className = "", onClose }) {
  const router = useRouter();
  const { role, label } = VIEW[view] || VIEW.product;
  const [loaded, setLoaded] = useState(null);
  const [visible, setVisible] = useState(new Set());
  const [inRows, setInRows] = useState(new Set());
  const [useDefault, setUseDefault] = useState(!Array.isArray(rowColumnKeys));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiJson(`/api/gameinfo/column-roles?gameId=${encodeURIComponent(gameId)}`, { fallbackError: "โหลดคอลัมน์ไม่สำเร็จ" })
      .then((data) => {
        if (cancelled) return;
        const columns = Array.isArray(data.columns) ? data.columns : [];
        const rules = Array.isArray(data.rules) ? data.rules : [];
        const hidden = hiddenGameinfoColumnKeys(rules, role, gameId);
        const shown = new Set(columns.map((column) => column.key).filter((key) => !hidden.has(key)));
        const rows = Array.isArray(rowColumnKeys)
          ? new Set(rowColumnKeys)
          : new Set(columns.map((column) => column.key).filter(isGameinfoUserAddedColumnKey));
        setLoaded({ columns, rules, hidden });
        setVisible(shown);
        setInRows(new Set([...rows].filter((key) => shown.has(key))));
      })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "โหลดคอลัมน์ไม่สำเร็จ"); });
    return () => { cancelled = true; };
  }, [gameId, role, rowColumnKeys]);

  const rowCount = inRows.size;
  const columns = useMemo(() => loaded?.columns || [], [loaded]);

  function toggleVisible(key, on) {
    setVisible((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
    if (!on) setInRows((current) => { const next = new Set(current); next.delete(key); return next; });
  }
  function toggleRow(key, on) {
    setUseDefault(false);
    setInRows((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function save() {
    if (!loaded) return;
    setSaving(true);
    setError("");
    try {
      const hidden = columns.map((column) => column.key).filter((key) => !visible.has(key));
      const changedVisibility = hidden.length !== loaded.hidden.size || hidden.some((key) => !loaded.hidden.has(key));
      if (changedVisibility) {
        // For this game: "shown" has to be written to overrule a column hidden in every game.
        const hiddenEverywhere = hiddenGameinfoColumnKeys(loaded.rules, role, GAMEINFO_COLUMN_ROLE_ALL_GAMES);
        await apiJson("/api/gameinfo/column-roles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role,
            gameId: Number(gameId),
            hiddenColumnKeys: hidden,
            shownColumnKeys: [...visible].filter((key) => hiddenEverywhere.has(key)),
          }),
          fallbackError: "บันทึกคอลัมน์ที่แสดงไม่สำเร็จ",
        });
      }
      const keys = useDefault ? null : columns.map((column) => column.key).filter((key) => inRows.has(key));
      await apiJson(`/api/gameinfo/gamelist/${gameId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listColumns: { view, keys } }),
        fallbackError: "บันทึกคอลัมน์ในแถวไม่สำเร็จ",
      });
      router.refresh();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกมุมมองไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent showCloseButton={false} className={`gd gd-modal sm:max-w-[620px] ${className}`}>
        <div className="gd-mhead">
          <div className="min-w-0">
            <DialogTitle className="text-xl leading-tight font-semibold text-white">ปรับมุมมอง {label}</DialogTitle>
            <DialogDescription className="text-[13px] text-white/90">เฉพาะเกมนี้ · คอลัมน์ที่แสดง และคอลัมน์ที่ขึ้นในแถวรายการ</DialogDescription>
          </div>
          <button type="button" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-white" aria-label="ปิด" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="gd-mbody">
          <p className="gd-note">
            “แสดง”: ปิดแล้วคอลัมน์นี้หายจากมุมมอง {label} ทั้งหน้า (ตารางเต็ม ข้อมูลอื่น และแถว) สำหรับทุกคน ·
            “ในแถว”: ขึ้นเป็นคอลัมน์ในแถวรายการ ข้างกำไร % (สูงสุด {GAMEINFO_LIST_COLUMN_MAX})
          </p>
          {!loaded && !error ? <p className="gd-note">กำลังโหลด…</p> : null}
          {loaded ? (
            <div className="overflow-hidden rounded-2xl border border-[var(--gd-line2)]">
              <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-2 bg-[var(--gd-surface2)] px-3.5 py-2 text-xs font-medium text-[var(--gd-muted)]">
                <span>คอลัมน์</span><span className="text-center">แสดง</span><span className="text-center">ในแถว</span>
              </div>
              {columns.map((column) => {
                const shown = visible.has(column.key);
                const row = inRows.has(column.key);
                return (
                  <div key={column.key} className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-2 border-t border-[var(--gd-line)] px-3.5 py-2 text-sm">
                    <span className="min-w-0 truncate" title={column.label}>
                      {column.label}
                      {isGameinfoUserAddedColumnKey(column.key) ? <span className="ml-1.5 rounded-full bg-[var(--gd-fill)] px-1.5 py-0.5 text-[11px] text-[var(--gd-muted)]">เพิ่มเอง</span> : null}
                    </span>
                    <label className="flex justify-center">
                      <span className="sr-only">แสดง {column.label}</span>
                      <input type="checkbox" checked={shown} onChange={(event) => toggleVisible(column.key, event.target.checked)} className="h-5 w-5 accent-[#D90005]" />
                    </label>
                    <label className="flex justify-center">
                      <span className="sr-only">{column.label} ในแถวรายการ</span>
                      <input
                        type="checkbox"
                        checked={row}
                        disabled={!shown || (!row && rowCount >= GAMEINFO_LIST_COLUMN_MAX)}
                        onChange={(event) => toggleRow(column.key, event.target.checked)}
                        className="h-5 w-5 accent-[#D90005] disabled:opacity-30"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          ) : null}
          {loaded && !useDefault ? (
            <button
              type="button"
              className="gd-btn sm self-start"
              onClick={() => {
                setUseDefault(true);
                setInRows(new Set(columns.map((column) => column.key).filter((key) => isGameinfoUserAddedColumnKey(key) && visible.has(key))));
              }}
            >
              ในแถว: กลับเป็นค่าเริ่มต้น (คอลัมน์ที่เพิ่มเอง)
            </button>
          ) : null}
          {error ? <p role="alert" className="text-sm text-[var(--gd-red)]">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--gd-line2)] pt-3">
            <span className="mr-auto text-xs text-[var(--gd-muted)]">ตั้งทุกเกมพร้อมกันได้ที่หน้า สิทธิ์คอลัมน์</span>
            <button type="button" className="gd-btn sm" disabled={saving} onClick={onClose}>ยกเลิก</button>
            <button type="button" className="gd-btn sm red disabled:opacity-40" disabled={saving || !loaded} onClick={save}>{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
