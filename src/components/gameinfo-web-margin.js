"use client";

import { useMemo, useState } from "react";
import { gameinfoPackMatchKey } from "@/lib/gameinfo-topup-match";

const DEFAULT_TARGET = 8;

function money(value) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Web price against the website's own recorded cost, per package, for the
// mode being edited. The GameInfo pack of the same name sits beside it so a
// price that drifted between the page and the website shows up.
export default function GameinfoWebMargin({ packages, dataMode = "uid", usdThb = null, gameinfoPacks = [] }) {
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const idpass = dataMode === "idpass";

  const rows = useMemo(() => {
    const gameinfoByKey = new Map();
    for (const pack of gameinfoPacks) {
      const key = gameinfoPackMatchKey(pack.name);
      if (key && !gameinfoByKey.has(key)) gameinfoByKey.set(key, pack);
    }
    return packages.map((pkg) => {
      const price = idpass ? pkg.priceIdpass : pkg.price;
      const active = pkg.isActive && (idpass ? pkg.idpassActive : pkg.uidActive) && price != null;
      // THB cost first; a USD-only cost converts at today's rate.
      const cost = pkg.cost ?? (pkg.costUsd != null && usdThb ? pkg.costUsd * usdThb : null);
      const costSource = pkg.cost != null ? "THB" : pkg.costUsd != null && usdThb ? `USD ${money(pkg.costUsd)}` : null;
      const profit = price != null && cost != null ? price - cost : null;
      const margin = profit != null && price > 0 ? (profit / price) * 100 : null;
      const gameinfo = gameinfoByKey.get(gameinfoPackMatchKey(pkg.label)) || gameinfoByKey.get(gameinfoPackMatchKey(pkg.amountDisplay)) || null;
      return { pkg, price, active, cost, costSource, profit, margin, gameinfo };
    });
  }, [gameinfoPacks, idpass, packages, usdThb]);

  const live = rows.filter((row) => row.active);
  const withMargin = live.filter((row) => row.margin != null);
  const average = withMargin.length ? withMargin.reduce((sum, row) => sum + row.margin, 0) / withMargin.length : null;
  const below = withMargin.filter((row) => row.margin < target).length;
  const noCost = live.filter((row) => row.cost == null).length;

  if (!packages.length) {
    return <p className="text-sm text-linear-ink-tertiary">เกมนี้บนเว็บยังไม่มีแพ็กเกจ</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi label={`แพ็กที่เปิดขาย (${idpass ? "ID-PASS" : "UID"})`} value={`${live.length} / ${rows.length}`} />
        <Kpi label="Margin เฉลี่ย" value={average == null ? "—" : `${average.toFixed(1)}%`} tone={average == null ? "" : marginTone(average, target)} />
        <Kpi label="ต่ำกว่าเป้า" value={`${below} แพ็ก`} tone={below ? "warn" : "ok"} />
        <Kpi label="ยังไม่มีต้นทุนบนเว็บ" value={`${noCost} แพ็ก`} tone={noCost ? "warn" : ""} />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[13px] text-linear-ink-muted">
        <label className="flex items-center gap-2 font-bold">
          เป้า Margin ขั้นต่ำ
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={target}
              onChange={(event) => setTarget(Math.max(0, Number(event.target.value) || 0))}
              className="h-9 w-20 rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-2 text-right text-sm text-linear-ink outline-none focus:border-[#D90005]"
            />
            %
          </span>
        </label>
        <span>ต้นทุนและราคาจากเว็บ TopUp{usdThb ? ` · USD→THB ${money(usdThb)}` : ""} · ราคาเพจจาก GameInfo (แพ็คชื่อตรงกัน)</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-linear-hairline">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-linear-surface-2 text-[11px] font-black uppercase tracking-[0.06em] text-linear-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3">แพ็กเกจบนเว็บ</th>
              <th scope="col" className="px-3 py-3 text-right">ราคาขายเว็บ</th>
              <th scope="col" className="px-3 py-3 text-right">ต้นทุน (฿)</th>
              <th scope="col" className="px-3 py-3 text-right">กำไร/ชิ้น</th>
              <th scope="col" className="px-3 py-3">Margin</th>
              <th scope="col" className="px-4 py-3 text-right">ราคาเพจ (GameInfo)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ pkg, price, active, cost, costSource, profit, margin, gameinfo }) => (
              <tr key={pkg.id} className={`border-t border-linear-hairline ${active ? "" : "opacity-55"}`}>
                <td className="px-4 py-2.5">
                  <span className="block font-extrabold text-linear-ink">{pkg.label}</span>
                  {!active ? <span className="text-xs text-linear-ink-tertiary">ปิดบนเว็บ</span> : null}
                </td>
                <td className="px-3 py-2.5 text-right font-black tabular-nums text-linear-ink">{price == null ? "—" : `฿${money(price)}`}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-linear-ink-muted">
                  {cost == null ? <span className="text-xs text-linear-ink-tertiary">ไม่มี</span> : (
                    <>
                      ฿{money(cost)}
                      {costSource && costSource !== "THB" ? <span className="block text-[11px] text-linear-ink-tertiary">จาก {costSource}</span> : null}
                    </>
                  )}
                </td>
                <td className={`px-3 py-2.5 text-right font-extrabold tabular-nums ${profit == null ? "text-linear-ink-tertiary" : profit < 0 ? "text-[#B80004] dark:text-[#FF8A8C]" : "text-linear-ink"}`}>
                  {profit == null ? "—" : `${profit < 0 ? "−" : ""}฿${money(Math.abs(profit))}`}
                </td>
                <td className="px-3 py-2.5"><MarginBar margin={margin} target={target} /></td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {gameinfo ? (
                    <span className={Number(gameinfo.price) === Number(price) || gameinfo.price === "" ? "text-linear-ink-muted" : "font-bold text-amber-700 dark:text-amber-400"} title={Number(gameinfo.price) === Number(price) ? "ตรงกับราคาเว็บ" : "ไม่ตรงกับราคาเว็บ"}>
                      {gameinfo.price === "" ? "—" : `฿${gameinfo.price}`}
                    </span>
                  ) : <span className="text-xs text-linear-ink-tertiary">ไม่พบแพ็คชื่อนี้</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function marginTone(margin, target) {
  if (margin < 0) return "bad";
  return margin < target ? "warn" : "ok";
}

const TONE_TEXT = {
  ok: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-[#B80004] dark:text-[#FF8A8C]",
};

function Kpi({ label, value, tone = "" }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-linear-hairline px-3.5 py-3">
      <span className="text-xs text-linear-ink-tertiary">{label}</span>
      <span className={`text-[22px] font-black ${TONE_TEXT[tone] || "text-linear-ink"}`}>{value}</span>
    </div>
  );
}

function MarginBar({ margin, target }) {
  if (margin == null) return <span className="text-xs text-linear-ink-tertiary">—</span>;
  const tone = marginTone(margin, target);
  const bar = tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-[#D90005]";
  const flag = tone === "ok" ? "ผ่านเป้า" : tone === "warn" ? "ต่ำกว่าเป้า" : "ขาดทุน";
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="block h-1.5 w-14 overflow-hidden rounded-full bg-linear-surface-3">
        <span className={`block h-1.5 rounded-full ${bar}`} style={{ width: `${Math.max(2, Math.min(100, (margin / 30) * 100))}%` }} />
      </span>
      <span className={`font-extrabold tabular-nums ${TONE_TEXT[tone]}`}>{margin.toFixed(1)}%</span>
      <span className={`text-[11px] font-bold ${TONE_TEXT[tone]}`}>{flag}</span>
    </span>
  );
}
