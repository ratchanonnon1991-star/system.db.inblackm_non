"use client";

import PaginatedTable from "@/components/table-pagination";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, DownloadCloud, Link2, Search } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { confidentNameMatch } from "@/lib/gameinfo-topup-match";
import { gameinfoGameHref } from "@/lib/gameinfo-data-mode";
import { GameinfoWebBadge } from "./gameinfo-priority-stars";

const OPTION_SEPARATOR = " — ";

function optionLabel(game) {
  return `${game.name}${OPTION_SEPARATOR}${game.id}`;
}

// The datalist shows "name — id"; the id after the last separator is what
// gets saved (website names repeat across regions).
function idFromOption(value, webById) {
  const text = String(value || "");
  const index = text.lastIndexOf(OPTION_SEPARATOR);
  const id = index >= 0 ? text.slice(index + OPTION_SEPARATOR.length).trim() : text.trim();
  return webById.has(id) ? id : null;
}

export default function GameinfoTopupWebLinker({ lang, games, webGames }) {
  const [tab, setTab] = useState("link");
  const webById = useMemo(() => new Map(webGames.map((game) => [game.id, game])), [webGames]);
  const linkedWebIds = useMemo(() => new Set(games.map((game) => game.topupGameId).filter(Boolean)), [games]);
  const unlinkedCount = games.filter((game) => !game.topupGameId).length;
  const newWebGames = webGames.filter((game) => !linkedWebIds.has(game.id));

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="งานกับเว็บ TopUp" className="flex flex-wrap gap-1 self-start rounded-full bg-linear-surface-3 p-1">
        {[
          { id: "link", label: `จับคู่เกม (ยังไม่เชื่อม ${unlinkedCount})`, icon: Link2 },
          { id: "import", label: `เกมบนเว็บที่ยังไม่มีใน GameInfo (${newWebGames.length})`, icon: Download },
          { id: "fill", label: `ดึงรูปและแพ็คให้เกมที่เชื่อมแล้ว (${games.length - unlinkedCount})`, icon: DownloadCloud },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-extrabold transition ${tab === item.id ? "bg-[#D90005] text-white" : "text-linear-ink-muted hover:bg-linear-surface-1"}`}
            >
              <Icon size={15} aria-hidden="true" /> {item.label}
            </button>
          );
        })}
      </div>
      {tab === "link" ? <LinkGames lang={lang} games={games} webGames={webGames} webById={webById} /> : null}
      {tab === "import" ? <ImportGames lang={lang} games={games} webGames={newWebGames} /> : null}
      {tab === "fill" ? <FillLinkedGames games={games.filter((game) => game.topupGameId)} /> : null}
    </div>
  );
}

function LinkGames({ lang, games, webGames, webById }) {
  const router = useRouter();
  const [filter, setFilter] = useState("unlinked");
  const [query, setQuery] = useState("");
  // gameId → chosen website id (absent = keep as is).
  const [choices, setChoices] = useState(() => {
    const initial = {};
    for (const game of games) {
      if (game.topupGameId) continue;
      const match = confidentNameMatch(game.game, webGames);
      if (match) initial[game.id] = match.id;
    }
    return initial;
  });
  const [texts, setTexts] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const usage = useMemo(() => {
    const byWebId = new Map();
    for (const game of games) {
      const id = selected.has(game.id) ? choices[game.id] : game.topupGameId;
      if (id) byWebId.set(id, [...(byWebId.get(id) || []), game.game]);
    }
    return byWebId;
  }, [choices, games, selected]);

  const rows = games.filter((game) => {
    if (filter === "unlinked" && game.topupGameId) return false;
    if (filter === "linked" && !game.topupGameId) return false;
    const needle = query.trim().toLocaleLowerCase("th");
    return !needle || game.game.toLocaleLowerCase("th").includes(needle) || String(game.id) === needle;
  });
  const suggestedIds = rows.filter((game) => !game.topupGameId && choices[game.id]).map((game) => game.id);

  function toggle(gameId, on) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(gameId);
      else next.delete(gameId);
      return next;
    });
  }

  async function save() {
    const links = [...selected].filter((gameId) => choices[gameId]).map((gameId) => ({ gameId, topupGameId: choices[gameId] }));
    if (!links.length) return;
    setBusy(true);
    setError("");
    try {
      const data = await apiJson("/api/gameinfo/topup-web/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links }),
        fallbackError: "เชื่อมเกมกับเว็บไม่สำเร็จ",
      });
      setResult(data);
      setSelected(new Set());
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "เชื่อมเกมกับเว็บไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="จับคู่เกม" className="flex flex-col gap-3 rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="ตัวกรอง" className="flex gap-1 rounded-full bg-linear-surface-3 p-1">
          {[["unlinked", "ยังไม่เชื่อม"], ["linked", "เชื่อมแล้ว"], ["all", "ทั้งหมด"]].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`h-8 rounded-full px-3.5 text-xs font-extrabold ${filter === id ? "bg-linear-surface-1 text-linear-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-linear-ink-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">ค้นหาเกมใน GameInfo</span>
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-linear-ink-tertiary" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเกมใน GameInfo" className="h-10 w-full rounded-xl border border-linear-hairline-strong bg-linear-surface-1 pl-9 pr-3 text-sm text-linear-ink outline-none focus:border-[#D90005]" />
        </label>
        <button
          type="button"
          disabled={!suggestedIds.length}
          onClick={() => setSelected((current) => new Set([...current, ...suggestedIds]))}
          className="h-10 rounded-xl border border-linear-hairline bg-linear-surface-1 px-3.5 text-[13px] font-bold text-linear-ink hover:bg-linear-surface-2 disabled:opacity-40"
        >
          เลือกทุกคู่ที่ระบบแนะนำ ({suggestedIds.length})
        </button>
      </div>
      <p className="text-xs text-linear-ink-tertiary">ระบบเดาคู่จากชื่อเกม ตรวจทุกแถวก่อนติ๊ก — เกมเดียวกันบนเว็บมักมีหลายภูมิภาค</p>

      <datalist id="gameinfo-topup-web-options">
        {webGames.map((game) => <option key={game.id} value={optionLabel(game)} />)}
      </datalist>

      <div className="overflow-x-auto rounded-xl border border-linear-hairline">
        <PaginatedTable items={rows} resetKey={JSON.stringify([filter, query])}>{(tablePageItems, tablePageStart, tableAllItems) => (<table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-linear-surface-2 text-[11px] font-black uppercase tracking-[0.06em] text-linear-ink-muted">
            <tr>
              <th scope="col" className="w-12 px-4 py-3"><span className="sr-only">เลือก</span></th>
              <th scope="col" className="px-3 py-3">เกมใน GameInfo</th>
              <th scope="col" className="px-3 py-3">เกมบนเว็บ TopUp</th>
              <th scope="col" className="px-4 py-3">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {tablePageItems.map((tableItem, tableIndex) => ((game) => {
              const chosenId = choices[game.id] || game.topupGameId || "";
              const chosen = webById.get(chosenId);
              const sharedWith = (usage.get(chosenId) || []).filter((name) => name !== game.game);
              const changed = Boolean(choices[game.id]) && choices[game.id] !== game.topupGameId;
              return (
                <tr key={game.id} className="border-t border-linear-hairline">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      aria-label={`เชื่อม ${game.game}`}
                      checked={selected.has(game.id)}
                      disabled={!changed}
                      onChange={(event) => toggle(game.id, event.target.checked)}
                      className="h-5 w-5 accent-[#D90005] disabled:opacity-30"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="block font-extrabold text-linear-ink">{game.game}</span>
                    <span className="font-mono text-xs text-linear-ink-tertiary">ID: {game.id}{game.region ? ` · ${game.region}` : ""}</span>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      list="gameinfo-topup-web-options"
                      aria-label={`เกมบนเว็บของ ${game.game}`}
                      value={texts[game.id] ?? (chosen ? optionLabel(chosen) : "")}
                      placeholder="พิมพ์ค้นหาเกมบนเว็บ"
                      onChange={(event) => {
                        const value = event.target.value;
                        setTexts((current) => ({ ...current, [game.id]: value }));
                        const id = idFromOption(value, webById);
                        if (id) {
                          setChoices((current) => ({ ...current, [game.id]: id }));
                          toggle(game.id, id !== game.topupGameId);
                        }
                      }}
                      className="h-10 w-full min-w-[280px] rounded-xl border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none focus:border-[#D90005]"
                    />
                    {sharedWith.length ? (
                      <span className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400">
                        <AlertTriangle size={12} aria-hidden="true" /> ใช้กับ {sharedWith.join(", ")} ด้วย
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    {game.topupGameId && !changed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400"><CheckCircle2 size={14} aria-hidden="true" /> เชื่อมแล้ว</span>
                    ) : changed ? (
                      <span className="text-xs font-bold text-[#B80004] dark:text-[#FF8A8C]">{game.topupGameId ? "จะเปลี่ยน" : "แนะนำ"}</span>
                    ) : (
                      <span className="text-xs text-linear-ink-tertiary">ไม่พบชื่อใกล้เคียง</span>
                    )}
                    {chosen ? <span className="ml-2"><GameinfoWebBadge web={chosen} size="sm" /></span> : null}
                    {game.topupGameId && !changed ? (
                      <Link href={gameinfoGameHref(lang, game.id, "uid", true)} className="ml-2 text-xs font-bold text-[#D90005] hover:underline">แก้ไขเกม</Link>
                    ) : null}
                  </td>
                </tr>
              );
            })(tableItem, tablePageStart + tableIndex, tableAllItems))}
          </tbody>
        </table>)}</PaginatedTable>
      </div>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-linear-hairline bg-linear-surface-1 p-3 shadow-[0_16px_32px_-16px_rgba(0,0,0,0.45)]">
        {error ? <span role="alert" className="mr-auto text-xs text-linear-danger">{error}</span> : null}
        {result ? (
          <span role="status" className="mr-auto text-[13px] font-bold text-emerald-700 dark:text-emerald-400">
            เชื่อมแล้ว {result.saved.length} เกม{result.failed.length ? ` · ไม่สำเร็จ ${result.failed.length}` : ""}
          </span>
        ) : null}
        <button type="button" disabled={busy || !selected.size} onClick={save} className="flex h-11 items-center gap-2 rounded-xl bg-[#D90005] px-5 text-sm font-extrabold text-white hover:bg-[#B80004] disabled:opacity-40">
          <Link2 size={16} aria-hidden="true" /> {busy ? "กำลังบันทึก…" : `ยืนยันเชื่อม ${selected.size} เกม`}
        </button>
      </div>
    </section>
  );
}

function ImportGames({ lang, games, webGames }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  // A website game whose name closely fits an unlinked GameInfo game is
  // probably that game: link it rather than create a second copy.
  const unlinked = useMemo(() => games.filter((game) => !game.topupGameId), [games]);
  const rows = webGames
    .filter((game) => {
      const needle = query.trim().toLocaleLowerCase("en");
      return !needle || `${game.name} ${game.id}`.toLocaleLowerCase("en").includes(needle);
    })
    .map((game) => ({ game, likely: confidentNameMatch(game.name, unlinked, (item) => item.game) }))
    // Games with no likely GameInfo twin are the ones that are really new.
    .sort((a, b) => Number(Boolean(a.likely)) - Number(Boolean(b.likely)));

  async function create() {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson("/api/gameinfo/topup-web/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topupGameIds: [...selected] }),
        fallbackError: "นำเข้าเกมจากเว็บไม่สำเร็จ",
      });
      setResult(data);
      setSelected(new Set());
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "นำเข้าเกมจากเว็บไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="นำเข้าเกมจากเว็บ" className="flex flex-col gap-3 rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <p className="text-sm text-linear-ink-muted">
        สร้างเกมใน GameInfo พร้อมชื่อ รูป หมวดหมู่ แพ็ค (ชื่อ ราคา รูป UID / ID-PASS) และการเชื่อมกับเว็บ — ที่เหลือ (Platform, Server, ช่องทางเติม, ยอดที่กด) แอดมินเติมต่อในหน้าแก้ไข
        <span className="block text-xs text-amber-700 dark:text-amber-400">จับคู่เกมที่มีอยู่แล้วก่อน ไม่อย่างนั้นจะได้เกมซ้ำ</span>
      </p>
      <label className="relative max-w-md">
        <span className="sr-only">ค้นหาเกมบนเว็บ</span>
        <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-linear-ink-tertiary" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเกมบนเว็บ" className="h-10 w-full rounded-xl border border-linear-hairline-strong bg-linear-surface-1 pl-9 pr-3 text-sm text-linear-ink outline-none focus:border-[#D90005]" />
      </label>
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-linear-ink-tertiary">เกมบนเว็บเชื่อมกับ GameInfo ครบแล้ว</p> : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ game, likely }) => (
            <li key={game.id}>
              <label className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 ${selected.has(game.id) ? "border-[#D90005] bg-[#D90005]/5" : "border-linear-hairline hover:bg-linear-surface-2"}`}>
                <input
                  type="checkbox"
                  checked={selected.has(game.id)}
                  onChange={(event) => setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(game.id);
                    else next.delete(game.id);
                    return next;
                  })}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#D90005]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-linear-ink">{game.name}</span>
                  <span className="block truncate font-mono text-xs text-linear-ink-tertiary">{game.id}</span>
                  {likely ? <span className="mt-1 block text-xs font-bold text-amber-700 dark:text-amber-400">อาจเป็นเกม “{likely.game}” ใน GameInfo</span> : null}
                </span>
                <GameinfoWebBadge web={game} size="sm" />
              </label>
            </li>
          ))}
        </ul>
      )}
      {result?.created?.length ? (
        <div role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
          <p className="font-extrabold">สร้างแล้ว {result.created.length} เกม — เปิดหน้าแก้ไขเพื่อเติมข้อมูลที่เหลือ</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {result.created.map((item) => (
              <li key={item.gameId}><Link href={gameinfoGameHref(lang, item.gameId, "uid", true)} className="font-bold underline">{item.game}</Link></li>
            ))}
          </ul>
        </div>
      ) : null}
      {result?.failed?.length ? <p role="alert" className="text-xs text-linear-danger">ไม่สำเร็จ {result.failed.length} เกม: {result.failed.map((item) => `${item.topupGameId} (${item.error})`).join(", ")}</p> : null}
      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-linear-hairline bg-linear-surface-1 p-3 shadow-[0_16px_32px_-16px_rgba(0,0,0,0.45)]">
        {error ? <span role="alert" className="mr-auto text-xs text-linear-danger">{error}</span> : null}
        <button type="button" disabled={busy || !selected.size} onClick={create} className="flex h-11 items-center gap-2 rounded-xl bg-[#D90005] px-5 text-sm font-extrabold text-white hover:bg-[#B80004] disabled:opacity-40">
          <Download size={16} aria-hidden="true" /> {busy ? "กำลังสร้าง…" : `สร้าง ${selected.size} เกมใน GameInfo`}
        </button>
      </div>
    </section>
  );
}

const FILL_PARTS = [
  { id: "image", label: "รูปเกม", detail: "เฉพาะเกมที่ยังไม่มีรูป" },
  { id: "tags", label: "หมวดหมู่", detail: "เฉพาะเกมที่ยังไม่มีหมวดหมู่" },
  { id: "packs", label: "แพ็ค + รูปแพ็ค (UID / ID-PASS)", detail: "เฉพาะโหมดที่เกมยังไม่มีแพ็คเลย — เกมที่มีแพ็คแล้วให้ใช้ “เติมจากเว็บ” ในหน้าแก้ไข" },
];

function FillLinkedGames({ games }) {
  const router = useRouter();
  const [parts, setParts] = useState(() => new Set(FILL_PARTS.map((part) => part.id)));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await apiJson("/api/gameinfo/topup-web/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameIds: games.map((game) => game.id), image: parts.has("image"), tags: parts.has("tags"), packs: parts.has("packs") }),
        fallbackError: "ดึงข้อมูลจากเว็บไม่สำเร็จ",
      });
      setResult(data);
      router.refresh();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "ดึงข้อมูลจากเว็บไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="ดึงรูปและแพ็คจากเว็บ" className="flex flex-col gap-4 rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <p className="text-sm text-linear-ink-muted">
        ดึงจากเว็บให้ทุกเกมที่เชื่อมแล้ว ({games.length} เกม) ทีเดียว เติมเฉพาะส่วนที่ GameInfo ยังว่าง ไม่เขียนทับข้อมูลที่แอดมินกรอกไว้
      </p>
      <ul className="flex flex-col gap-2">
        {FILL_PARTS.map((part) => (
          <li key={part.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-linear-hairline px-4 py-3 hover:bg-linear-surface-2">
              <input
                type="checkbox"
                checked={parts.has(part.id)}
                onChange={(event) => setParts((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(part.id);
                  else next.delete(part.id);
                  return next;
                })}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#D90005]"
              />
              <span>
                <span className="block text-sm font-extrabold text-linear-ink">{part.label}</span>
                <span className="block text-xs text-linear-ink-tertiary">{part.detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {result ? (
        <div role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
          <p className="font-extrabold">เติมแล้ว {result.summary.games} เกม</p>
          <p>รูปเกม {result.summary.image} · หมวดหมู่ {result.summary.tags} · แพ็ค {result.summary.packs} เกม{result.summary.failed ? ` · ไม่สำเร็จ ${result.summary.failed}` : ""}</p>
          {result.summary.failed ? (
            <ul className="mt-1 text-xs text-linear-danger">
              {result.results.filter((item) => item.error && item.error !== "ยังไม่ได้เชื่อมกับเว็บ").map((item) => (
                <li key={item.gameId}>เกม #{item.gameId}: {item.error}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {error ? <span role="alert" className="mr-auto text-xs text-linear-danger">{error}</span> : null}
        <button type="button" disabled={busy || !parts.size || !games.length} onClick={run} className="flex h-11 items-center gap-2 rounded-xl bg-[#D90005] px-5 text-sm font-extrabold text-white hover:bg-[#B80004] disabled:opacity-40">
          <DownloadCloud size={16} aria-hidden="true" /> {busy ? "กำลังดึงข้อมูล…" : `ดึงข้อมูลให้ ${games.length} เกม`}
        </button>
      </div>
    </section>
  );
}
