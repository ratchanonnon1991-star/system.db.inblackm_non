"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Layers, Loader2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { useProfitCanEdit } from "@/components/profit-capabilities-context";
import ProfitSummaryGrid from "@/components/profit-summary-grid";
import ProfitModal, { ProfitField, profitInputClass } from "@/components/profit-modal";

const SOURCE_LABELS = { gocash: "GoCash", oxide: "Oxide" };

function matchesQuery(q, parts) {
  if (!q) return true;
  const hay = parts.filter((p) => p != null && p !== "").join(" ").toLowerCase();
  return hay.includes(q);
}

export default function ProfitSalePricePlatformPage() {
  const { platform } = useParams();
  // Keyed so switching platforms (via the back link + a different card)
  // mounts a fresh instance instead of showing the previous platform's
  // prices while the new fetch is in flight.
  return <ProfitSalePricePlatformContent key={platform} platform={platform} />;
}

function ProfitSalePricePlatformContent({ platform }) {
  const canEdit = useProfitCanEdit();
  const [packs, setPacks] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [game, setGame] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);

  const loadPacks = useCallback(() => {
    apiJson(`/api/profit/sale-prices?platform=${encodeURIComponent(platform)}`, { fallbackError: "โหลดราคาขายไม่สำเร็จ" })
      .then((res) => setPacks(res.packs || []))
      .catch((err) => setError(err.message));
  }, [platform]);

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

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

  const setCount = (packs || []).filter((p) => p.price != null).length;

  const editPrice = async (source, packName, value) => {
    try {
      await apiJson("/api/profit/sale-prices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, source, packName, price: Number(value) || 0 }),
        fallbackError: "ตั้งราคาขายไม่สำเร็จ",
      });
      loadPacks();
    } catch (err) {
      window.alert(err.message);
    }
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
      <Link
        href="/profit/sale-prices"
        className="inline-flex w-fit items-center gap-1.5 text-[12px] font-medium text-ll-ink-subtle hover:text-ll-ink"
      >
        <ArrowLeft size={13} /> ตั้งราคาขายตามแพ็ก
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ll-ink">{platform}</h1>
          <p className="mt-1 text-[13px] text-ll-ink-subtle">
            ราคาขายอ้างอิงของแพลตฟอร์มนี้ — เปิดดูก่อนพิมพ์ราคาขายจริงในออเดอร์เอง ไม่ได้เติมราคาให้อัตโนมัติ
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-ll-primary px-3 py-2 text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover"
          >
            <Layers size={13} /> ตั้งราคาขายแบบกลุ่ม
          </button>
        )}
      </div>

      <ProfitSummaryGrid
        items={[
          { k: "แพ็กทั้งหมด", v: packs.length },
          { k: "ตั้งราคาแล้ว", v: setCount },
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
                <th className="px-3 py-2 text-right font-medium">ราคาขาย</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((p) => (
                  <tr key={`${p.source}:${p.packName}`} className="border-b border-ll-hairline last:border-0 hover:bg-ll-surface-2">
                    <td className="px-4 py-2.5 text-ll-ink">{p.game}</td>
                    <td className="px-3 py-2.5 text-ll-ink">{p.packName}</td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-600">
                        {SOURCE_LABELS[p.source] || p.source}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{p.orderCount}</td>
                    <td className="px-3 py-2.5 text-right">
                      <PriceInput value={p.price ?? 0} disabled={!canEdit} onCommit={(v) => editPrice(p.source, p.packName, v)} />
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
        <BulkPriceModal
          platform={platform}
          packs={packs || []}
          onClose={() => setBulkOpen(false)}
          onApplied={() => { setBulkOpen(false); loadPacks(); }}
        />
      )}
    </div>
  );
}

function BulkPriceModal({ platform, packs, onClose, onApplied }) {
  const [mode, setMode] = useState("pack"); // "pack" | "game"
  const [price, setPrice] = useState("");
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

  const [packKey, setPackKey] = useState(packs[0] ? `${packs[0].source}:${packs[0].packName}` : "");
  const [selectedGame, setSelectedGame] = useState(allGames[0] || "");

  const targets = mode === "pack"
    ? packs.filter((p) => `${p.source}:${p.packName}` === packKey)
    : packs.filter((p) => p.game === selectedGame);

  const submit = async () => {
    const n = Number(price);
    if (!Number.isFinite(n)) {
      window.alert("กรุณากรอกตัวเลขที่ถูกต้อง");
      return;
    }
    if (!targets.length) {
      window.alert("ไม่พบแพ็กที่จะตั้งค่า");
      return;
    }
    const label = mode === "pack" ? targets[0].packName : selectedGame;
    if (!window.confirm(`ตั้งราคาขาย ${n} (${platform}) ให้ ${targets.length} แพ็ก (${label}) ใช่ไหม?`)) return;
    setSubmitting(true);
    try {
      await Promise.all(
        targets.map((p) =>
          apiJson("/api/profit/sale-prices", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ platform, source: p.source, packName: p.packName, price: n }),
            fallbackError: "ตั้งราคาขายไม่สำเร็จ",
          })
        )
      );
      onApplied();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProfitModal
      title={`ตั้งราคาขายแบบกลุ่ม (${platform})`}
      onClose={onClose}
      actions={
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !targets.length || price === ""}
          className="rounded-md bg-ll-primary px-3.5 py-2 text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50"
        >
          {submitting ? "กำลังบันทึก..." : `ตั้งราคาให้ ${targets.length} แพ็ก`}
        </button>
      }
    >
      <p className="text-[12px] leading-relaxed text-ll-ink-subtle">
        เลือกได้ว่าจะตั้งราคาขายให้ <b className="text-ll-ink">แพ็กเดียว</b> หรือ <b className="text-ll-ink">ทุกแพ็กของทั้งเกม</b> ในครั้งเดียว
        (เฉพาะแพลตฟอร์ม <b className="text-ll-ink">{platform}</b>) — เป็นตารางอ้างอิงเท่านั้น ไม่ได้เติมราคาเข้าออเดอร์จริงให้อัตโนมัติ
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

      {mode === "pack" ? (
        <ProfitField label="เลือกแพ็ก">
          <select value={packKey} onChange={(e) => setPackKey(e.target.value)} className={profitInputClass}>
            {[...packsByGame.entries()].map(([g, list]) => (
              <optgroup key={g} label={g}>
                {list.map((p) => (
                  <option key={`${p.source}:${p.packName}`} value={`${p.source}:${p.packName}`}>
                    {p.packName} ({SOURCE_LABELS[p.source] || p.source})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </ProfitField>
      ) : (
        <ProfitField label="เลือกเกม">
          <select value={selectedGame} onChange={(e) => setSelectedGame(e.target.value)} className={profitInputClass}>
            {allGames.map((g) => (
              <option key={g} value={g}>{g} ({packsByGame.get(g)?.length || 0} แพ็ก)</option>
            ))}
          </select>
        </ProfitField>
      )}

      <ProfitField label="ราคาขายต่อแพ็ก">
        <input
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="เช่น 55"
          className={profitInputClass}
        />
      </ProfitField>

      <p className="text-[11px] text-ll-ink-tertiary">
        จะมีผลกับ {targets.length} แพ็ก{mode === "game" ? " ของเกมนี้" : ""} (แพลตฟอร์ม {platform})
      </p>
    </ProfitModal>
  );
}

function PriceInput({ value, disabled, onCommit }) {
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
