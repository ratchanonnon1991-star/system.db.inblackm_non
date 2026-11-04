"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { GAMEINFO_COLUMN_ROLE_ALL_GAMES, hiddenGameinfoColumnKeys } from "@/lib/gameinfo-column-roles";
import { GAMEINFO_LIST_COLUMN_MAX, isGameinfoUserAddedColumnKey } from "@/lib/gameinfo-pack-list";

const VIEWS = [
  { id: "product", role: "admin", label: "Product" },
  { id: "topup", role: "topup", label: "Topup" },
];

/**
 * The edit page's มุมมองหน้าเกม section: for this game and each view of its
 * page (Product, Topup), which columns the view shows at all (the same
 * per-game rules as the สิทธิ์คอลัมน์ page) and which sit in the pack rows
 * next to the fixed figures.
 */
export default function GameinfoViewColumnsSection({ gameId, listColumns = null }) {
  const [view, setView] = useState("product");
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="มุมมอง" className="flex w-fit gap-1 rounded-full bg-linear-surface-3 p-1">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={view === item.id}
            onClick={() => setView(item.id)}
            className={`h-9 rounded-full px-5 text-sm font-bold transition ${view === item.id ? "bg-linear-surface-1 text-linear-ink shadow-sm" : "text-linear-ink-muted hover:text-linear-ink"}`}
          >
            มุมมอง {item.label}
          </button>
        ))}
      </div>
      <ViewColumns key={view} gameId={gameId} view={VIEWS.find((item) => item.id === view)} rowColumnKeys={listColumns?.[view] ?? null} />
    </div>
  );
}

function ViewColumns({ gameId, view, rowColumnKeys }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(null);
  const [visible, setVisible] = useState(new Set());
  const [inRows, setInRows] = useState(new Set());
  const [useDefault, setUseDefault] = useState(!Array.isArray(rowColumnKeys));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiJson(`/api/gameinfo/column-roles?gameId=${encodeURIComponent(gameId)}`, { fallbackError: "โหลดคอลัมน์ไม่สำเร็จ" })
      .then((data) => {
        if (cancelled) return;
        const columns = Array.isArray(data.columns) ? data.columns : [];
        const rules = Array.isArray(data.rules) ? data.rules : [];
        const hidden = hiddenGameinfoColumnKeys(rules, view.role, gameId);
        const shown = new Set(columns.map((column) => column.key).filter((key) => !hidden.has(key)));
        const rows = Array.isArray(rowColumnKeys)
          ? new Set(rowColumnKeys)
          : new Set(columns.map((column) => column.key).filter(isGameinfoUserAddedColumnKey));
        setLoaded({ columns, rules, hidden, shown, rows });
        setVisible(shown);
        setInRows(new Set([...rows].filter((key) => shown.has(key))));
      })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "โหลดคอลัมน์ไม่สำเร็จ"); });
    return () => { cancelled = true; };
  }, [gameId, view.role, rowColumnKeys]);

  const columns = useMemo(() => loaded?.columns || [], [loaded]);
  const sameSet = (a, b) => a.size === b.size && [...a].every((key) => b.has(key));
  const dirty = Boolean(loaded) && (!sameSet(visible, loaded.shown) || !sameSet(inRows, new Set([...loaded.rows].filter((key) => loaded.shown.has(key)))) || useDefault !== !Array.isArray(rowColumnKeys));

  function toggleVisible(key, on) {
    setSaved(false);
    setVisible((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
    if (!on) setInRows((current) => { const next = new Set(current); next.delete(key); return next; });
  }
  function toggleRow(key, on) {
    setSaved(false);
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
      if (!sameSet(new Set(hidden), loaded.hidden)) {
        // For this game: "shown" has to be written to overrule a column hidden in every game.
        const hiddenEverywhere = hiddenGameinfoColumnKeys(loaded.rules, view.role, GAMEINFO_COLUMN_ROLE_ALL_GAMES);
        await apiJson("/api/gameinfo/column-roles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: view.role,
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
        body: JSON.stringify({ listColumns: { view: view.id, keys } }),
        fallbackError: "บันทึกคอลัมน์ในแถวไม่สำเร็จ",
      });
      setSaved(true);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกมุมมองไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-linear-ink-tertiary">
        <b className="text-linear-ink-muted">แสดง</b>: เอาออกแล้วคอลัมน์หายจากมุมมอง {view.label} ของหน้าเกมนี้ทั้งหน้า (ตารางเต็ม ข้อมูลอื่น และแถว) สำหรับทุกคน ·{" "}
        <b className="text-linear-ink-muted">ในแถว</b>: ขึ้นเป็นคอลัมน์ในแถวรายการและบนการ์ด ข้างกำไร % (สูงสุด {GAMEINFO_LIST_COLUMN_MAX})
      </p>
      {!loaded && !error ? <p className="text-sm text-linear-ink-tertiary">กำลังโหลด…</p> : null}
      {loaded ? (
        <div className="overflow-hidden rounded-xl border border-linear-hairline bg-linear-surface-1">
          <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-2 bg-linear-surface-2 px-3.5 py-2 text-xs font-semibold text-linear-ink-tertiary">
            <span>คอลัมน์</span><span className="text-center">แสดง</span><span className="text-center">ในแถว</span>
          </div>
          {columns.map((column) => {
            const shown = visible.has(column.key);
            const row = inRows.has(column.key);
            return (
              <div key={column.key} className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-2 border-t border-linear-hairline px-3.5 py-2 text-sm text-linear-ink">
                <span className="min-w-0 truncate" title={column.label}>
                  {column.label}
                  {isGameinfoUserAddedColumnKey(column.key) ? <span className="ml-1.5 rounded-full bg-linear-surface-3 px-1.5 py-0.5 text-[11px] text-linear-ink-tertiary">เพิ่มเอง</span> : null}
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
                    disabled={!shown || (!row && inRows.size >= GAMEINFO_LIST_COLUMN_MAX)}
                    onChange={(event) => toggleRow(column.key, event.target.checked)}
                    className="h-5 w-5 accent-[#D90005] disabled:opacity-30"
                  />
                </label>
              </div>
            );
          })}
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-linear-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {loaded && !useDefault ? (
          <button
            type="button"
            onClick={() => {
              setSaved(false);
              setUseDefault(true);
              setInRows(new Set(columns.map((column) => column.key).filter((key) => isGameinfoUserAddedColumnKey(key) && visible.has(key))));
            }}
            className="h-10 rounded-[10px] border border-linear-hairline px-3.5 text-[13px] font-bold text-linear-ink-muted hover:bg-linear-surface-2"
          >
            ในแถว: กลับเป็นค่าเริ่มต้น (คอลัมน์ที่เพิ่มเอง)
          </button>
        ) : null}
        <span className="text-xs text-linear-ink-tertiary">ตั้งทุกเกมพร้อมกันได้ที่หน้า สิทธิ์คอลัมน์</span>
        <span className="flex-1" />
        {saved && !dirty ? <span role="status" className="flex items-center gap-1 text-[13px] font-bold text-emerald-700 dark:text-emerald-400"><Check size={15} aria-hidden="true" /> บันทึกแล้ว</span> : null}
        <button
          type="button"
          disabled={saving || !loaded || !dirty}
          onClick={save}
          className="h-10 rounded-[10px] bg-[#D90005] px-5 text-[13px] font-extrabold text-white hover:bg-[#B80004] disabled:opacity-40"
        >
          {saving ? "กำลังบันทึก…" : `บันทึกมุมมอง ${view.label}`}
        </button>
      </div>
    </div>
  );
}
