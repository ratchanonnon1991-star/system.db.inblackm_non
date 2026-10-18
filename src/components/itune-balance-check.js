"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api-json";
import { ItuneBalancePhotos, ItuneSheetOrderList } from "@/components/itune-entry-sheet-panel";

const input = "mt-2 min-h-11 w-full rounded-lg border border-ll-hairline-strong bg-ll-surface-1 px-3 text-sm text-ll-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ll-primary";
const num = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ItuneBalanceCheck() {
  const [entries, setEntries] = useState(null); const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null); const [error, setError] = useState("");
  useEffect(() => {
    apiJson("/api/projectm/itune?all=1", { cache: "no-store" }).then((r) => setEntries(r.entries || [])).catch((e) => setError(e.message));
  }, []);
  const selected = entries?.find((e) => e.id === selectedId) || null;
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (entries || []).filter((e) => !term || String(e.email || "").toLowerCase().includes(term)).slice(0, 50);
  }, [entries, query]);
  return <div className="mx-auto grid w-full min-w-0 max-w-7xl gap-6 px-4 py-6 text-ll-ink sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)]">
    <aside className="min-w-0 space-y-3">
      <h1 className="text-2xl font-semibold">เช็คยอดจริง</h1>
      <p className="text-sm text-ll-ink-subtle">แนบรูปยอดคงเหลือในเมลจริง พร้อมวันเวลา ไว้เทียบกับยอดในเว็บ</p>
      <label className="block text-sm">ค้นหาเมล<input value={query} onChange={(e) => setQuery(e.target.value)} className={input} /></label>
      {!entries && !error && <p role="status" className="text-sm text-ll-ink-subtle">กำลังโหลดรายการเมล…</p>}
      <ul className="max-h-[60vh] space-y-1 overflow-auto">{matches.map((e) => <li key={e.id}>
        <button type="button" aria-pressed={e.id === selectedId} onClick={() => setSelectedId(e.id)}
          className={`w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-ll-surface-2 ${e.id === selectedId ? "border-ll-primary ring-1 ring-ll-primary" : "border-ll-hairline"}`}>
          <span className="block break-all">{e.email || "(ไม่มีอีเมล)"}</span>
          <span className="text-xs text-ll-ink-subtle tabular-nums">{num(e.amount)} {e.currency || ""}</span>
        </button></li>)}</ul>
    </aside>
    <main className="min-w-0 space-y-5">
      {error && <p role="alert" className="rounded-xl border border-ll-hairline p-4 text-sm">{error}</p>}
      {!selected ? <p className="rounded-xl border border-dashed border-ll-hairline-strong p-6 text-sm text-ll-ink-subtle">เลือกเมลทางซ้ายเพื่อดูและเพิ่มรูป</p> : <>
        <section className="rounded-xl border border-ll-hairline bg-ll-surface-1 p-4">
          <p className="break-all text-lg font-semibold">{selected.email}</p>
          <p className="mt-1 text-sm">ยอดในเว็บตอนนี้ <span className="font-semibold tabular-nums">{num(selected.amount)} {selected.currency || ""}</span></p>
        </section>
        <ItuneBalancePhotos key={`p${selected.id}`} entryId={selected.id} />
        <ItuneSheetOrderList key={`o${selected.id}`} entryId={selected.id} />
      </>}
    </main>
  </div>;
}
