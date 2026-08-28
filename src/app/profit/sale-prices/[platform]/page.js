"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Layers, Loader2, RotateCcw } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { commitBulkOverrideEdit, commitOverrideEdit } from "@/lib/profit-conflict";
import { useProfitCanEdit } from "@/components/profit-capabilities-context";
import ProfitSummaryGrid from "@/components/profit-summary-grid";
import { SourceBadge } from "@/components/profit-badges";
import ProfitModal, { ProfitField, profitInputClass } from "@/components/profit-modal";
import { platformLabel } from "@/components/profit-platform-select";

const SOURCE_LABELS = { gocash: "GoCash", oxide: "Multi Game Card", wavepay: "Wavepay" };

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
  const [priced, setPriced] = useState("all"); // all | priced | unpriced
  const [bulkOpen, setBulkOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  // Read-only here -- the fee itself is a fixed, locked list in
  // profit-repository.js (Kaleoz, ...), not editable from this page. Only
  // fetched so the page can show what the listed price nets to after that
  // platform's cut (see gocashOrderView on the server, which deducts it
  // automatically) and label the price column as the full/gross figure.
  const [feePct, setFeePct] = useState(0);

  const loadPacks = useCallback(() => {
    apiJson(`/api/profit/sale-prices?platform=${encodeURIComponent(platform)}`, { fallbackError: "โหลดราคาขายไม่สำเร็จ" })
      .then((res) => setPacks(res.packs || []))
      .catch((err) => setError(err.message));
  }, [platform]);

  const loadFee = useCallback(() => {
    apiJson(`/api/profit/platform-fees?platform=${encodeURIComponent(platform)}`, { fallbackError: "โหลดค่าธรรมเนียมไม่สำเร็จ" })
      .then((res) => setFeePct(res.feePct))
      .catch(() => {});
  }, [platform]);

  useEffect(() => {
    loadPacks();
    loadFee();
  }, [loadPacks, loadFee]);

  const sources = useMemo(() => [...new Set((packs || []).map((p) => p.source))], [packs]);
  const games = useMemo(
    () => [...new Set((packs || []).filter((p) => !source || p.source === source).map((p) => p.game))],
    [packs, source]
  );

  const filtered = useMemo(() => {
    if (!packs) return [];
    const query = q.trim().toLowerCase();
    return packs.filter(
      (p) =>
        (!source || p.source === source) &&
        (!game || p.game === game) &&
        (priced === "all" || (priced === "priced" ? p.price != null : p.price == null)) &&
        matchesQuery(query, [p.packName])
    );
  }, [packs, q, source, game, priced]);

  const setCount = (packs || []).filter((p) => p.price != null).length;

  // `expected` is the pack's own current price as shown on screen (see
  // platformPackPrices -- it's the raw stored value) -- the server rejects
  // with 409 if someone else already changed it since this row loaded (see
  // assertScalarUnchanged in profit-repository.js).
  const editPrice = (pack, value) => {
    const price = Number(value) || 0;
    return commitOverrideEdit({
      save: (includeExpected) => apiJson("/api/profit/sale-prices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          source: pack.source,
          packName: pack.packName,
          price,
          ...(includeExpected ? { expected: pack.price } : {}),
        }),
        fallbackError: "ตั้งราคาขายไม่สำเร็จ",
      }),
      reload: loadPacks,
    });
  };

  const resetPrices = async () => {
    if (!window.confirm(`ล้างราคาขายทุกแพ็กของ ${platformLabel(platform)} กลับเป็น "ยังไม่ได้ตั้ง" ใช่ไหม?`)) return;
    setResetting(true);
    try {
      await apiJson("/api/profit/sale-prices/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
        fallbackError: "รีเซ็ตราคาขายไม่สำเร็จ",
      });
      loadPacks();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setResetting(false);
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
          <h1 className="text-xl font-semibold text-ll-ink">{platformLabel(platform)}</h1>
          <p className="mt-1 text-[13px] text-ll-ink-subtle">
            ราคาขายอ้างอิงของแพลตฟอร์มนี้ — เปิดดูก่อนพิมพ์ราคาขายจริงในออเดอร์เอง ไม่ได้เติมราคาให้อัตโนมัติ
            {feePct > 0 && ` กรอกราคาเต็ม (ก่อนหักค่าธรรมเนียม) ระบบจะหักค่าธรรมเนียมของแพลตฟอร์มนี้ (${feePct}%) ให้อัตโนมัติตอนคิดกำไร`}
          </p>
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={resetPrices}
              disabled={resetting}
              className="flex items-center gap-1.5 rounded-md border border-ll-hairline-strong px-3 py-2 text-[12px] font-medium text-ll-ink-subtle transition hover:bg-ll-surface-2 disabled:opacity-50"
            >
              {resetting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              รีเซ็ตราคาขาย
            </button>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-ll-primary px-3 py-2 text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover"
            >
              <Layers size={13} /> ตั้งราคาขายแบบกลุ่ม
            </button>
          </div>
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
        <select
          value={priced}
          onChange={(e) => setPriced(e.target.value)}
          className="h-9 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2.5 text-[13px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1"
        >
          <option value="all">สถานะ: ทั้งหมด</option>
          <option value="priced">ตั้งราคาแล้ว</option>
          <option value="unpriced">ยังไม่ได้ตั้ง</option>
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
                {feePct > 0 && (
                  <th className="px-3 py-2 text-right font-medium" title={`ราคาขาย × (1 − ${feePct}%) — หลังหักค่าธรรมเนียมของแพลตฟอร์มนี้อัตโนมัติ`}>
                    หลังหักค่าธรรมเนียม ({feePct}%)
                  </th>
                )}
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
                      <PriceInput value={p.price ?? 0} disabled={!canEdit} onCommit={(v) => editPrice(p, v)} />
                    </td>
                    {feePct > 0 && (
                      <td className="px-3 py-2.5 text-right text-ll-ink-subtle">
                        {p.price != null ? (p.price * (1 - feePct / 100)).toFixed(2) : "-"}
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr><td colSpan={feePct > 0 ? 6 : 5} className="px-4 py-8 text-center text-ll-ink-subtle">
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
    if (!window.confirm(`ตั้งราคาขาย ${n} (${platformLabel(platform)}) ให้ ${targets.length} แพ็ก (${label}) ใช่ไหม?`)) return;
    setSubmitting(true);
    try {
      // Each target's own current price (as loaded on this page) goes along
      // as its baseline -- if someone else already changed that specific
      // pack since then, it's flagged as a conflict instead of silently
      // overwritten, same protection the inline row edit above has.
      await commitBulkOverrideEdit({
        targets,
        save: (p, includeExpected) =>
          apiJson("/api/profit/sale-prices", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              platform,
              source: p.source,
              packName: p.packName,
              price: n,
              ...(includeExpected ? { expected: p.price } : {}),
            }),
            fallbackError: "ตั้งราคาขายไม่สำเร็จ",
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
      title={`ตั้งราคาขายแบบกลุ่ม (${platformLabel(platform)})`}
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
        (เฉพาะแพลตฟอร์ม <b className="text-ll-ink">{platformLabel(platform)}</b>) — เป็นตารางอ้างอิงเท่านั้น ไม่ได้เติมราคาเข้าออเดอร์จริงให้อัตโนมัติ
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
        จะมีผลกับ {targets.length} แพ็ก{mode === "game" ? " ของเกมนี้" : ""} (แพลตฟอร์ม {platformLabel(platform)})
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
