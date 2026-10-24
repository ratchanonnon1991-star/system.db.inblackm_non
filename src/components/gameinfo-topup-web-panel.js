"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Link2, Lock, Search, Unlink, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { rankTopupWebGames } from "@/lib/gameinfo-topup-match";
import { GameinfoWebBadge } from "./gameinfo-priority-stars";

const FIELD_TYPE_LABELS = {
  text: "ข้อความ",
  email: "อีเมล",
  password: "รหัสผ่าน",
  select: "ตัวเลือก",
  number: "ตัวเลข",
  tel: "เบอร์โทร",
};

// Which website game this is, and the form its customers fill in there.
// Read-only: the website owns both, so changes go through its own admin.
export default function GameinfoTopupWebPanel({ gameId, gameName, region, connected, topupGame, topupGameId, adminUrl, dataMode = "uid" }) {
  return (
    <div className="flex flex-col gap-5">
      <TopupLink
        gameId={gameId}
        gameName={gameName}
        region={region}
        connected={connected}
        topupGame={topupGame}
        topupGameId={topupGameId}
        adminUrl={adminUrl}
      />
      {topupGame ? <CustomerForms forms={topupGame.forms} dataMode={dataMode} adminUrl={adminUrl} /> : null}
    </div>
  );
}

function TopupLink({ gameId, gameName, region, connected, topupGame, topupGameId, adminUrl }) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [games, setGames] = useState(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const suggestions = useMemo(() => (games ? rankTopupWebGames(gameName, region, games) : []), [gameName, games, region]);
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en");
    if (!games || !needle) return suggestions;
    return games.filter((game) => `${game.name} ${game.id}`.toLocaleLowerCase("en").includes(needle)).slice(0, 12);
  }, [games, query, suggestions]);

  async function open() {
    setPicking(true);
    setError("");
    if (games) return;
    try {
      const data = await apiJson("/api/gameinfo/topup-web/games", { fallbackError: "โหลดรายชื่อเกมบนเว็บไม่สำเร็จ" });
      setGames(data.games);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "โหลดรายชื่อเกมบนเว็บไม่สำเร็จ");
    }
  }

  async function link(nextId) {
    setSaving(true);
    setError("");
    try {
      await apiJson(`/api/gameinfo/gamelist/${gameId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topupGameId: nextId }),
        fallbackError: "บันทึกการเชื่อมเว็บไม่สำเร็จ",
      });
      setPicking(false);
      setQuery("");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกการเชื่อมเว็บไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (!connected) {
    return (
      <p className="rounded-xl border border-dashed border-linear-hairline-strong bg-linear-surface-2 px-4 py-3 text-sm text-linear-ink-muted">
        ยังไม่ได้เชื่อมฐานข้อมูลเว็บ TopUp — เพิ่ม connection ชื่อ <code className="rounded bg-linear-surface-3 px-1.5 py-0.5 font-mono text-[13px]">topup_web</code> ในหน้าตั้งค่า Connections ก่อน
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-linear-hairline bg-linear-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-surface-1 text-linear-ink-muted">
          <Link2 size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-linear-ink-muted">เกมบนเว็บ TopUp</p>
          {topupGame ? (
            <p className="flex flex-wrap items-center gap-2 text-[15px] font-black text-linear-ink">
              {topupGame.name}
              <span className="font-mono text-xs font-normal text-linear-ink-tertiary">{topupGame.id}</span>
            </p>
          ) : topupGameId ? (
            <p className="text-sm font-bold text-[#D90005]">ไม่พบเกม “{topupGameId}” บนเว็บแล้ว — เลือกใหม่</p>
          ) : (
            <p className="text-sm text-linear-ink-tertiary">ยังไม่ได้เชื่อม — เชื่อมเพื่อดู Web ON ช่องข้อมูลลูกค้า และราคาเว็บ</p>
          )}
        </div>
        {topupGame ? (
          <div className="flex flex-wrap items-center gap-2">
            <GameinfoWebBadge web={topupGame} />
            <ModePill on={topupGame.uidEnabled} label="UID" />
            <ModePill on={topupGame.idpassEnabled} label="ID-PASS" />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {adminUrl && topupGame ? (
            <a href={adminUrl} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center gap-1.5 rounded-[10px] border border-linear-hairline bg-linear-surface-1 px-3.5 text-[13px] font-bold text-linear-ink hover:bg-linear-surface-3">
              <ExternalLink size={15} aria-hidden="true" /> เปิด/ปิดที่หลังบ้านเว็บ
            </a>
          ) : null}
          <button type="button" onClick={picking ? () => setPicking(false) : open} aria-expanded={picking} className="flex h-10 items-center gap-1.5 rounded-[10px] bg-[#D90005] px-3.5 text-[13px] font-extrabold text-white hover:bg-[#B80004]">
            {picking ? <X size={15} aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}
            {picking ? "ปิด" : topupGame || topupGameId ? "เปลี่ยนเกม" : "เชื่อมกับเกมบนเว็บ"}
          </button>
        </div>
      </div>

      {picking ? (
        <div className="flex flex-col gap-2 rounded-xl border border-linear-hairline bg-linear-surface-1 p-3">
          <label className="relative">
            <span className="sr-only">ค้นหาเกมบนเว็บ</span>
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-linear-ink-tertiary" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาชื่อเกมหรือ id บนเว็บ"
              className="h-11 w-full rounded-xl border border-linear-hairline-strong bg-linear-surface-1 pl-9 pr-3 text-sm text-linear-ink outline-none focus:border-[#D90005] focus:ring-2 focus:ring-[#D90005]/20"
            />
          </label>
          <p className="text-xs font-bold text-linear-ink-tertiary">{query ? "ผลการค้นหา" : "เกมที่ชื่อใกล้เคียง"}</p>
          {!games && !error ? <p className="py-2 text-sm text-linear-ink-tertiary">กำลังโหลด…</p> : null}
          {games && results.length === 0 ? <p className="py-2 text-sm text-linear-ink-tertiary">ไม่พบเกม ลองพิมพ์ค้นหา</p> : null}
          <ul className="flex max-h-72 flex-col overflow-y-auto">
            {results.map((game) => (
              <li key={game.id}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => link(game.id)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left hover:bg-linear-surface-2 disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-linear-ink">{game.name}</span>
                    <span className="block font-mono text-xs text-linear-ink-tertiary">{game.id}</span>
                  </span>
                  <GameinfoWebBadge web={game} size="sm" />
                  {game.id === topupGameId ? <Check size={16} className="text-[#D90005]" aria-label="เชื่อมอยู่" /> : null}
                </button>
              </li>
            ))}
          </ul>
          {topupGameId ? (
            <button type="button" disabled={saving} onClick={() => link(null)} className="flex h-10 items-center justify-center gap-1.5 self-start rounded-[10px] px-3 text-[13px] font-bold text-linear-ink-muted hover:bg-linear-surface-2 disabled:opacity-50">
              <Unlink size={15} aria-hidden="true" /> ยกเลิกการเชื่อม
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs text-linear-danger">{error}</p> : null}
    </div>
  );
}

function ModePill({ on, label }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[12px] font-extrabold ${on ? "bg-[#18181B] text-white dark:bg-white dark:text-[#18181B]" : "bg-linear-surface-3 text-linear-ink-tertiary line-through"}`} title={on ? `เปิดเติมแบบ ${label}` : `ปิดเติมแบบ ${label}`}>
      {label}
    </span>
  );
}

function CustomerForms({ forms, dataMode, adminUrl }) {
  const tabs = [
    ...(forms.uid.length ? [{ id: "uid", label: "UID", fields: forms.uid }] : []),
    ...forms.idpass.map((method) => ({ id: `idpass:${method.id}`, label: `ID-PASS · ${method.label}`, fields: method.fields, isDefault: method.id === forms.defaultIdpassMethodId })),
  ];
  const preferred = dataMode === "idpass"
    ? tabs.find((tab) => tab.isDefault) || tabs.find((tab) => tab.id.startsWith("idpass:"))
    : tabs.find((tab) => tab.id === "uid");
  const [tabId, setTabId] = useState(preferred?.id || tabs[0]?.id);
  const tab = tabs.find((item) => item.id === tabId) || tabs[0];

  if (!tab) {
    return <p className="text-sm text-linear-ink-tertiary">เกมนี้บนเว็บยังไม่มีช่องให้ลูกค้ากรอก</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-linear-ink">ช่องข้อมูลที่ต้องขอจากลูกค้า</h3>
          <p className="text-[13px] text-linear-ink-tertiary">ลูกค้ากรอกตอนสั่งซื้อบนเว็บ แก้ได้ที่หลังบ้านเว็บเท่านั้น</p>
        </div>
        {tabs.length > 1 ? (
          <div role="tablist" aria-label="ฟอร์มลูกค้า" className="flex flex-wrap gap-1 rounded-full bg-linear-surface-3 p-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === tab.id}
                onClick={() => setTabId(item.id)}
                className={`h-9 rounded-full px-4 text-[13px] font-extrabold transition ${item.id === tab.id ? "bg-[#D90005] text-white" : "text-linear-ink-muted hover:bg-linear-surface-1"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="overflow-x-auto rounded-xl border border-linear-hairline">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-linear-surface-2 text-[11px] font-black uppercase tracking-[0.06em] text-linear-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Key</th>
                <th scope="col" className="px-3 py-3">ป้ายที่ลูกค้าเห็น</th>
                <th scope="col" className="px-3 py-3">ชนิด</th>
                <th scope="col" className="px-3 py-3">ตัวเลือก / ตัวอย่าง</th>
                <th scope="col" className="px-3 py-3 text-center">บังคับกรอก</th>
                <th scope="col" className="px-3 py-3 text-center">ซ่อนข้อมูล</th>
              </tr>
            </thead>
            <tbody>
              {tab.fields.map((field) => (
                <tr key={field.key} className="border-t border-linear-hairline">
                  <td className="px-4 py-2.5 font-mono text-xs text-linear-ink-muted">{field.key}</td>
                  <td className="px-3 py-2.5 font-bold text-linear-ink">{field.label}</td>
                  <td className="px-3 py-2.5 text-linear-ink-muted">{FIELD_TYPE_LABELS[field.type] || field.type}</td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-linear-ink-tertiary" title={field.options.join(", ") || field.placeholder}>
                    {field.options.length ? field.options.join(", ") : field.placeholder || "-"}
                  </td>
                  <td className="px-3 py-2.5 text-center"><YesNo on={field.required} /></td>
                  <td className="px-3 py-2.5 text-center"><YesNo on={field.masked} icon={Lock} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside aria-label="ตัวอย่างฟอร์มลูกค้า" className="flex flex-col gap-3 rounded-xl border border-linear-hairline bg-linear-surface-2 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-black text-linear-ink">ตัวอย่างที่ลูกค้าเห็น</span>
            <span className="rounded-md bg-linear-surface-3 px-2 py-0.5 text-[11px] font-bold text-linear-ink-muted">หน้าเว็บ</span>
          </div>
          <div className="flex flex-col gap-3 rounded-xl bg-linear-surface-1 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <span className="text-sm font-black text-linear-ink">กรอกข้อมูลบัญชีเกม</span>
            {tab.fields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1">
                <span className="text-xs font-bold text-linear-ink-muted">
                  {field.label} {field.required ? <span className="text-[#D90005]">*</span> : null}
                </span>
                <span className="flex h-10 items-center rounded-lg border border-linear-hairline px-3 text-[13px] text-linear-ink-tertiary">
                  {field.masked ? "••••••••" : field.options[0] || field.placeholder || " "}
                </span>
              </div>
            ))}
          </div>
          {adminUrl ? (
            <a href={adminUrl} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-linear-hairline bg-linear-surface-1 text-[13px] font-bold text-linear-ink hover:bg-linear-surface-3">
              <ExternalLink size={15} aria-hidden="true" /> แก้ฟอร์มที่หลังบ้านเว็บ
            </a>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function YesNo({ on, icon: Icon = Check }) {
  return on ? (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" aria-label="ใช่">
      <Icon size={13} strokeWidth={2.6} aria-hidden="true" />
    </span>
  ) : (
    <span className="text-linear-ink-tertiary" aria-label="ไม่">–</span>
  );
}
