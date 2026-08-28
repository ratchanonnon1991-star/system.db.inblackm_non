"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Layers, Loader2, RotateCcw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { commitBulkOverrideEdit, commitOverrideEdit } from "@/lib/profit-conflict";
import { useProfitCanEdit } from "@/components/profit-capabilities-context";
import ProfitSummaryGrid from "@/components/profit-summary-grid";
import { SourceBadge } from "@/components/profit-badges";
import ProfitModal, { ProfitField, profitInputClass } from "@/components/profit-modal";

const SOURCE_LABELS = { gocash: "GoCash", oxide: "Multi Game Card", wavepay: "Wavepay" };

function matchesQuery(q, parts) {
  if (!q) return true;
  const hay = parts.filter((p) => p != null && p !== "").join(" ").toLowerCase();
  return hay.includes(q);
}

export default function ProfitPackCostsPage() {
  const canEdit = useProfitCanEdit();
  const [packs, setPacks] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [game, setGame] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(() => {
    apiJson("/api/profit/pack-costs", { fallbackError: "โหลดต้นทุนตามแพ็กไม่สำเร็จ" })
      .then((res) => setPacks(res.packs || []))
      .catch((err) => setError(err.message));
  }, []);

  const resetCosts = async () => {
    if (!window.confirm("ล้างค่าต้นทุนทั้งหมดทุกบัตรทุกออเดอร์เป็น 0 ใช่ไหม?")) return;
    setResetting(true);
    try {
      await apiJson("/api/profit/costs/reset", { method: "POST", fallbackError: "ล้างค่าต้นทุนไม่สำเร็จ" });
      load();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const sources = useMemo(() => [...new Set((packs || []).map((p) => p.source))], [packs]);
  const games = useMemo(
    () => [...new Set((packs || []).filter((p) => !source || p.source === source).map((p) => p.game))],
    [packs, source]
  );

  const filtered = useMemo(() => {
    if (!packs) return [];
    const query = q.trim().toLowerCase();
    return packs.filter(
      (p) => (!source || p.source === source) && (!game || p.game === game) && matchesQuery(query, [p.packName])
    );
  }, [packs, q, source, game]);

  const setCount = (packs || []).filter((p) => p.cost != null).length;

  // `expected` is the pack's own current cost as shown on screen (see
  // packCostSummary -- it's the raw stored value, not a blended one) -- the
  // server rejects with 409 if someone else already changed it since this
  // row loaded (see assertScalarUnchanged in profit-repository.js).
  const editCost = (pack, value) => {
    const cost = Number(value) || 0;
    return commitOverrideEdit({
      save: (includeExpected) => apiJson("/api/profit/pack-costs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: pack.source,
          packName: pack.packName,
          cost,
          ...(includeExpected ? { expected: pack.cost } : {}),
        }),
        fallbackError: "ตั้งต้นทุนไม่สำเร็จ",
      }),
      reload: load,
    });
  };

  if (error) {
    return <div className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-6 text-sm text-ll-primary-subtle-text">เกิดข้อผิดพลาด: {error}</div>;
  }
  if (!packs) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-ll-ink-subtle">
        <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
        <Link href="/profit" className="hover:underline">ภาพรวม</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">ตั้งค่าต้นทุนตามแพ็ก</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ll-ink">ตั้งค่าต้นทุนตามแพ็ก</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ll-ink-subtle">
            รวมแพ็กจากทุกระบบ (GoCash, Multi Game Card ฯลฯ) ไว้ที่เดียว — ตั้งต้นทุนต่อแพ็กครั้งเดียว มีผลกับทุกออเดอร์ที่ใช้แพ็กนี้ทันที
            (ทั้งเก่าและใหม่) · ออเดอร์ไหนเคยแก้ต้นทุนเองในตารางไว้แล้ว จะยึดค่าที่แก้เองก่อนเสมอ
          </p>
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={resetCosts}
              disabled={resetting}
              className="flex items-center gap-1.5 rounded-md border border-ll-hairline-strong px-3 py-2 text-[12px] font-medium text-ll-ink-subtle transition hover:bg-ll-surface-2 disabled:opacity-50"
            >
              {resetting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              รีเซ็ตต้นทุนทั้งหมด
            </button>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-ll-primary px-3 py-2 text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover"
            >
              <Layers size={13} /> ตั้งต้นทุนแบบกลุ่ม
            </button>
          </div>
        )}
      </div>

      <ProfitSummaryGrid
        items={[
          { k: "แพ็กทั้งหมด", v: packs.length },
          { k: "ตั้งต้นทุนแล้ว", v: setCount },
          { k: "ยังไม่ได้ตั้ง", v: packs.length - setCount, tone: packs.length - setCount > 0 ? "neg" : undefined },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={source}
          onChange={(e) => { setSource(e.target.value); setGame(""); }}
          className="h-9 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2.5 text-[13px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1"
        >
          <option value="">บัตร: ทั้งหมด</option>
          {sources.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>)}
        </select>
        <select
          value={game}
          onChange={(e) => setGame(e.target.value)}
          className="h-9 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2.5 text-[13px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1"
        >
          <option value="">เกม: ทั้งหมด</option>
          {games.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาชื่อแพ็ก..."
          className="h-9 w-64 max-w-full rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-3 text-[13px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1"
        />
        <span className="text-[12px] text-ll-ink-subtle">{filtered.length} แพ็ก</span>
      </div>

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px] text-ll-ink">
            <thead>
              <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
                <th className="px-4 py-2 font-medium">เกม</th>
                <th className="px-3 py-2 font-medium">แพ็ก</th>
                <th className="px-3 py-2 font-medium">ใช้บัตร</th>
                <th className="px-3 py-2 text-right font-medium">จำนวนออเดอร์</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน/แพ็ก</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((p) => (
                  <tr key={`${p.source}:${p.packName}`} className="border-b border-ll-hairline last:border-0 hover:bg-ll-surface-2">
                    <td className="px-4 py-2.5 text-ll-ink">{p.game}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{p.packName}</td>
                    <td className="px-3 py-2.5">
                      <SourceBadge source={p.source} label={SOURCE_LABELS[p.source] || p.source} />
                    </td>
                    <td className="px-3 py-2.5 text-right">{p.orderCount}</td>
                    <td className="px-3 py-2.5 text-right">
                      <PackCostInput value={p.cost ?? 0} disabled={!canEdit} onCommit={(v) => editCost(p, v)} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-ll-ink-subtle">
                  {q || source || game ? "ไม่พบแพ็กที่ค้นหา" : "ยังไม่มีข้อมูล"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {bulkOpen && (
        <BulkCostModal packs={packs} onClose={() => setBulkOpen(false)} onApplied={() => { setBulkOpen(false); load(); }} />
      )}
    </div>
  );
}

// Popup instead of the inline row this replaced -- picking "แพ็กเดียว" vs
// "ทั้งเกม" as an explicit choice here (rather than implicitly scoping to
// whatever the page's source/game filters happen to be set to) is less
// likely to be misread as "this only touches what I can currently see".
function BulkCostModal({ packs, onClose, onApplied }) {
  const [mode, setMode] = useState("pack"); // "pack" | "game"
  const [cost, setCost] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const packsByGame = useMemo(() => {
    const map = new Map();
    for (const p of packs) {
      if (!map.has(p.game)) map.set(p.game, []);
      map.get(p.game).push(p);
    }
    return map;
  }, [packs]);
  const allGames = useMemo(() => [...packsByGame.keys()].sort(), [packsByGame]);

  const [selectedGame, setSelectedGame] = useState(allGames[0] || "");
  const gamePacks = packsByGame.get(selectedGame) || [];
  // Tracks only an explicit pick -- when it doesn't belong to the currently
  // selected game (most commonly right after switching games), falls back
  // to that game's first pack instead, with no effect needed to keep it synced.
  const [manualPackKey, setManualPackKey] = useState(null);
  const packKey = manualPackKey && gamePacks.some((p) => `${p.source}:${p.packName}` === manualPackKey)
    ? manualPackKey
    : gamePacks[0] ? `${gamePacks[0].source}:${gamePacks[0].packName}` : "";

  const targets = mode === "pack"
    ? packs.filter((p) => `${p.source}:${p.packName}` === packKey)
    : packs.filter((p) => p.game === selectedGame);

  const submit = async () => {
    const n = Number(cost);
    if (!Number.isFinite(n)) {
      window.alert("กรุณากรอกตัวเลขที่ถูกต้อง");
      return;
    }
    if (!targets.length) {
      window.alert("ไม่พบแพ็กที่จะตั้งค่า");
      return;
    }
    const label = mode === "pack" ? targets[0].packName : selectedGame;
    if (!window.confirm(`ตั้งต้นทุน ${n} ให้ ${targets.length} แพ็ก (${label}) ใช่ไหม?`)) return;
    setSubmitting(true);
    try {
      // Each target's own current cost (as loaded on this page) goes along
      // as its baseline -- if someone else already changed that specific
      // pack since then, it's flagged as a conflict instead of silently
      // overwritten, same protection the inline row edit above has.
      await commitBulkOverrideEdit({
        targets,
        save: (p, includeExpected) =>
          apiJson("/api/profit/pack-costs", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: p.source,
              packName: p.packName,
              cost: n,
              ...(includeExpected ? { expected: p.cost } : {}),
            }),
            fallbackError: "ตั้งต้นทุนไม่สำเร็จ",
          }),
        describe: (p) => p.packName,
      });
      onApplied();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProfitModal
      title="ตั้งต้นทุนแบบกลุ่ม"
      onClose={onClose}
      actions={
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !targets.length || cost === ""}
          className="rounded-md bg-ll-primary px-3.5 py-2 text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50"
        >
          {submitting ? "กำลังบันทึก..." : `ตั้งต้นทุนให้ ${targets.length} แพ็ก`}
        </button>
      }
    >
      <p className="text-[12px] leading-relaxed text-ll-ink-subtle">
        เลือกได้ว่าจะตั้งต้นทุนให้ <b className="text-ll-ink">แพ็กเดียว</b> หรือ <b className="text-ll-ink">ทุกแพ็กของทั้งเกม</b> ในครั้งเดียว
        — ค่านี้จะมีผลกับทุกออเดอร์ที่ใช้แพ็ก/เกมนี้ทันทีทั้งเก่าและใหม่ ส่วนออเดอร์ไหนที่เคยแก้ต้นทุนเองไว้ในตารางแล้ว จะยึดค่าที่แก้เองก่อนเสมอ ไม่ถูกค่านี้ทับ
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("pack")}
          className={`flex-1 rounded-md border px-3 py-2 text-[12px] font-medium transition ${
            mode === "pack"
              ? "border-ll-primary bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
              : "border-ll-hairline-strong text-ll-ink hover:bg-ll-surface-2"
          }`}
        >
          แพ็กเดียว
        </button>
        <button
          type="button"
          onClick={() => setMode("game")}
          className={`flex-1 rounded-md border px-3 py-2 text-[12px] font-medium transition ${
            mode === "game"
              ? "border-ll-primary bg-ll-primary-subtle-bg text-ll-primary-subtle-text"
              : "border-ll-hairline-strong text-ll-ink hover:bg-ll-surface-2"
          }`}
        >
          ทั้งเกม
        </button>
      </div>

      <ProfitField label="เลือกเกม">
        <select value={selectedGame} onChange={(e) => setSelectedGame(e.target.value)} className={profitInputClass}>
          {allGames.map((g) => (
            <option key={g} value={g}>{g} ({packsByGame.get(g)?.length || 0} แพ็ก)</option>
          ))}
        </select>
      </ProfitField>

      {mode === "pack" && (
        <ProfitField label="เลือกแพ็ก">
          <select value={packKey} onChange={(e) => setManualPackKey(e.target.value)} className={profitInputClass}>
            {gamePacks.map((p) => (
              <option key={`${p.source}:${p.packName}`} value={`${p.source}:${p.packName}`}>
                {p.packName} ({SOURCE_LABELS[p.source] || p.source})
              </option>
            ))}
          </select>
        </ProfitField>
      )}

      <ProfitField label="ต้นทุนต่อแพ็ก">
        <input
          type="number"
          step="0.01"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="เช่น 50"
          className={profitInputClass}
        />
      </ProfitField>

      <p className="text-[11px] text-ll-ink-tertiary">
        จะมีผลกับ {targets.length} แพ็ก{mode === "game" ? " ของเกมนี้" : ""}
      </p>
    </ProfitModal>
  );
}

function PackCostInput({ value, disabled, onCommit }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing the input's draft value when the server-loaded value changes underneath it
    setLocal(String(value));
  }, [value]);
  return (
    <input
      type="number"
      step="0.01"
      disabled={disabled}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (Number(local) !== Number(value)) onCommit(local);
      }}
      className="h-8 w-24 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2 text-right text-[12px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1 disabled:opacity-60"
    />
  );
}
