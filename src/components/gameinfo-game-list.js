"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const GRID_COLS =
  "grid-cols-[46px_60px_minmax(200px,1fr)_90px_100px_90px_150px_150px_60px_90px_110px]";

// Public game list: search + region/platform filters + VPN checkbox, then a
// CSS-grid "table". Ported from gameinfo's GameListTable.tsx.
export default function GameinfoGameList({ games, lang, canEdit }) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [platform, setPlatform] = useState("");
  const [vpnOnly, setVpnOnly] = useState(false);

  const regions = useMemo(() => uniq(games.map((g) => g.region).filter(Boolean)), [games]);
  const platforms = useMemo(() => uniq(games.map((g) => g.platform).filter(Boolean)), [games]);

  const filtered = games.filter((g) => {
    if (q && !g.gameName.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (region && g.region !== region) return false;
    if (platform && g.platform !== platform) return false;
    if (vpnOnly && g.vpn !== "YES") return false;
    return true;
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาชื่อเกม..."
          className="min-w-[180px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          <option value="">ทุก Region</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          <option value="">ทุก Platform</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={vpnOnly}
            onChange={(e) => setVpnOnly(e.target.checked)}
          />
          เฉพาะเกมที่ต้อง VPN
        </label>
        {canEdit && (
          <Link
            href={`/gameinfo/${lang}/admin`}
            className="ml-auto rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            จัดการข้อมูล
          </Link>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-slate-400">ไม่พบเกมที่ตรงกับเงื่อนไข</p>
      ) : (
        <div className="scroll-x rounded-lg border border-slate-200 bg-white">
          <div className="min-w-[1300px]">
            <div
              className={`grid ${GRID_COLS} gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500`}
            >
              <span>ID</span>
              <span>ลำดับ</span>
              <span>ชื่อเกม</span>
              <span>Region</span>
              <span>Platform</span>
              <span>Server</span>
              <span>ช่องทางหลัก</span>
              <span>ช่องทางรอง</span>
              <span>VPN</span>
              <span>Web Topup</span>
              <span className="text-right">ดูข้อมูล</span>
            </div>
            {filtered.map((g, i) => {
              const { main, secondary } = channelSummary(g.currencies);
              return (
                <div
                  key={g.id}
                  className={`grid ${GRID_COLS} items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0`}
                >
                  <span className="text-slate-400">{g.id}</span>
                  <span className="text-slate-400">#{i + 1}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-slate-800">{g.gameName}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      ({packCount(g)} แพ็ก)
                    </span>
                  </span>
                  <span className="truncate text-slate-600">{g.region || "-"}</span>
                  <span className="truncate text-slate-600">{g.platform || "-"}</span>
                  <span className="truncate text-slate-600">{g.server || "-"}</span>
                  <ChannelTags values={main} />
                  <ChannelTags values={secondary} />
                  <span>
                    {g.vpn === "YES" ? (
                      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700">
                        VPN
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">-</span>
                    )}
                  </span>
                  <span className="truncate">
                    {g.webTopup ? (
                      <a
                        href={g.webTopup}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        เว็บ ↗
                      </a>
                    ) : (
                      <span className="text-xs text-slate-300">-</span>
                    )}
                  </span>
                  <span className="text-right">
                    <Link
                      href={`/gameinfo/${lang}/${g.id}`}
                      className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100"
                    >
                      ดูแพ็ก →
                    </Link>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelTags({ values }) {
  if (values.length === 0) return <span className="text-xs text-slate-300">-</span>;
  return (
    <div className="flex flex-wrap gap-1" title={values.join(", ")}>
      {values.map((v) => (
        <span
          key={v}
          className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
        >
          {v}
        </span>
      ))}
    </div>
  );
}

function packCount(g) {
  return g.currencies.reduce(
    (sum, c) => sum + c.categories.reduce((s, cat) => s + cat.packs.length, 0),
    0
  );
}

function channelSummary(currencies) {
  const main = new Set();
  const secondary = new Set();
  for (const c of currencies) {
    for (const cat of c.categories) {
      for (const p of cat.packs) {
        (p.channelsMain || []).forEach((ch) => main.add(ch));
        (p.channelsSecondary || []).forEach((ch) => secondary.add(ch));
      }
    }
  }
  return { main: Array.from(main), secondary: Array.from(secondary) };
}

function uniq(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b, "th"));
}
