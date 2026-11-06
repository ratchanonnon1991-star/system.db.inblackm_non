"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { stockInputClass } from "@/components/stock-ui";

const packName = (pack) => pack.amountDisplay && pack.amountDisplay !== pack.label ? `${pack.label} (${pack.amountDisplay})` : pack.label;
const channels = (pack) => [pack.uidActive && "UID", pack.idpassActive && "ID-Pass"].filter(Boolean).join(" · ") || "ปิดขาย";

/**
 * Which of the main site's packages a stock pack fills, picked from the site's own list. Asks for
 * the list only when a dialog opens. The balance and the grey-out follow this choice, not names.
 */
export default function StockWebPackPicker({ value, onChange, defaultGameId = null }) {
  const [packages, setPackages] = useState(null);
  const [problem, setProblem] = useState("");
  const [chosenGame, setChosenGame] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiJson("/api/stock/web-packages", { fallbackError: "โหลดรายการแพ็คจากเว็บหลักไม่สำเร็จ" })
      .then((data) => {
        if (cancelled) return;
        if (data.connected) setPackages(data.packages);
        else setProblem("ยังไม่ได้ตั้งการเชื่อมต่อ topup_web จึงเลือกแพ็คบนเว็บหลักไม่ได้");
      })
      .catch((error) => {
        if (!cancelled) setProblem(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => new Map((packages || []).map((pack) => [pack.id, pack])), [packages]);
  const games = useMemo(() => {
    const names = new Map((packages || []).map((pack) => [pack.gameId, pack.gameName]));
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [packages]);
  // A pack already linked says best which game to open, then the game the account is linked to.
  const firstLinked = value.map((id) => byId.get(id)).find(Boolean);
  const gameId = chosenGame ?? firstLinked?.gameId ?? (defaultGameId != null ? String(defaultGameId) : "");
  const shown = (packages || []).filter((pack) => pack.gameId === gameId);
  const toggle = (id) => onChange(value.includes(id) ? value.filter((other) => other !== id) : [...value, id]);

  if (problem) return <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-xs font-bold text-amber-900">{problem}</p>;
  if (!packages) return <p className="text-xs text-zinc-600">กำลังโหลดรายการแพ็คจากเว็บหลัก…</p>;

  return (
    <div className="flex flex-col gap-2">
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="แพ็คบนเว็บที่ผูกแล้ว">
          {value.map((id) => {
            const pack = byId.get(id);
            return (
              <li key={id} className={`inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-xs font-bold ${pack ? "bg-emerald-50 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
                {pack ? `${pack.gameName}: ${packName(pack)}` : `#${id} ไม่พบบนเว็บแล้ว`}
                <button type="button" onClick={() => toggle(id)} aria-label={`เอา ${pack ? packName(pack) : `#${id}`} ออก`} className="inline-flex size-5 items-center justify-center rounded-full hover:bg-black/10"><X size={12} aria-hidden="true" /></button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <select aria-label="เกมบนเว็บหลัก" value={gameId} onChange={(event) => setChosenGame(event.target.value)} className={stockInputClass}>
        <option value="">เลือกเกมบนเว็บหลัก</option>
        {games.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
      {shown.length ? (
        <div className="max-h-56 overflow-y-auto rounded-xl border border-zinc-200">
          {shown.map((pack) => (
            <label key={pack.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 border-b border-zinc-100 px-3 py-1.5 text-[13px] last:border-b-0 hover:bg-zinc-50">
              <input type="checkbox" checked={value.includes(pack.id)} onChange={() => toggle(pack.id)} className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                {packName(pack)}
                {/* A game can hold twins with the same name, so each row says which one it is. */}
                <span className="block text-[11px] text-zinc-500">#{pack.id}{pack.category ? ` · ${pack.category}` : ""}</span>
              </span>
              <span className="shrink-0 text-[11px] font-bold text-zinc-500">{channels(pack)}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
