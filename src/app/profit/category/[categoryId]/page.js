"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, History, Layers, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { fmtDate, fmtMoney, fmtPct, fmtPoints, fmtUsd } from "@/lib/profit-format";
import ProfitSummaryGrid from "@/components/profit-summary-grid";
import { ClearedByCell, DupBadge, DustBadge, StatusBadge } from "@/components/profit-badges";
import ProfitModal, { ProfitField, profitInputClass } from "@/components/profit-modal";
import { useProfitCanEdit } from "@/components/profit-capabilities-context";

function matchesQuery(q, parts) {
  if (!q) return true;
  const hay = parts.filter((p) => p != null && p !== "").join(" ").toLowerCase();
  return hay.includes(q);
}

export default function ProfitCategoryPage() {
  const { categoryId } = useParams();
  // Keyed by categoryId so switching categories mounts a fresh instance
  // (fresh useState(null)) instead of briefly showing the previous
  // category's cards while the new fetch is in flight.
  return <ProfitCategoryPageContent key={categoryId} categoryId={categoryId} />;
}

function ProfitCategoryPageContent({ categoryId }) {
  const canEdit = useProfitCanEdit();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", openingBalance: "0", note: "", gameId: "" });
  const [saving, setSaving] = useState(false);
  const [sortDir, setSortDir] = useState("desc");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all"); // all | needs | cleared -- dust page only
  const [dupFilter, setDupFilter] = useState("all"); // all | needs | reviewed -- gocash cards' duplicate-review state
  const [games, setGames] = useState([]);
  // null = "haven't picked a game yet" (shows the game-picker grid for
  // manual channels with games defined); "__all__" = explicitly browsing
  // every card unsplit; otherwise a specific game's id.
  const [gameFilter, setGameFilter] = useState(null);
  const [addGameOpen, setAddGameOpen] = useState(false);
  // Cost (THB) = deducted(USD) * usdThbInfo.rate * gocashRate -- the first
  // factor is a plain fiat rate, auto-synced from exchangerate-api.com; the
  // second is GoCash's own deal rate (what support actually paid), which has
  // no live source yet so it's always typed in by hand.
  const [usdThbInfo, setUsdThbInfo] = useState(null);
  const [syncingUsdThb, setSyncingUsdThb] = useState(false);
  const [gocashRate, setGocashRate] = useState(null);

  const load = useCallback(() => {
    apiJson(`/api/profit/categories/${categoryId}/cards`, { fallbackError: "โหลดรายการบัตรไม่สำเร็จ" })
      .then((res) => setData(res))
      .catch((err) => setError(err.message));
  }, [categoryId]);

  const loadGames = useCallback(() => {
    apiJson(`/api/profit/channels/${categoryId}/games`, { fallbackError: "โหลดรายชื่อเกมไม่สำเร็จ" })
      .then((res) => setGames(res.games || []))
      .catch(() => {}); // non-critical -- the game filter/list just stays empty
  }, [categoryId]);

  const loadRates = useCallback(() => {
    if (categoryId !== "gocash") return;
    apiJson("/api/profit/gocash/usd-thb-rate", { fallbackError: "โหลดอัตราแลกเปลี่ยนไม่สำเร็จ" })
      .then((res) => setUsdThbInfo(res))
      .catch(() => {});
    apiJson("/api/profit/gocash/rate", { fallbackError: "โหลดเรท GoCash ไม่สำเร็จ" })
      .then((res) => setGocashRate(res.rate))
      .catch(() => {});
  }, [categoryId]);

  useEffect(() => {
    load();
    loadGames();
    loadRates();
  }, [load, loadGames, loadRates]);

  const saveGocashRate = async (value) => {
    try {
      const res = await apiJson("/api/profit/gocash/rate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: value }),
        fallbackError: "ตั้งเรท GoCash ไม่สำเร็จ",
      });
      setGocashRate(res.rate);
      load();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const syncUsdThbRate = async () => {
    setSyncingUsdThb(true);
    try {
      const res = await apiJson("/api/profit/gocash/usd-thb-rate/sync", {
        method: "POST",
        fallbackError: "ซิงค์อัตราแลกเปลี่ยนไม่สำเร็จ",
      });
      setUsdThbInfo(res);
      load();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSyncingUsdThb(false);
    }
  };

  const addGame = async (name) => {
    try {
      await apiJson(`/api/profit/channels/${categoryId}/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        fallbackError: "เพิ่มเกมไม่สำเร็จ",
      });
      setAddGameOpen(false);
      loadGames();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const removeGame = async (game) => {
    if (!window.confirm(`ลบเกม "${game.name}" ออกจากช่องทางนี้ใช่ไหม? (บัตรที่เคยผูกกับเกมนี้จะไม่ถูกลบ แค่ไม่ระบุเกมแล้ว)`)) return;
    try {
      await apiJson(`/api/profit/channels/${categoryId}/games?gameId=${encodeURIComponent(game.id)}`, {
        method: "DELETE",
        fallbackError: "ลบเกมไม่สำเร็จ",
      });
      if (gameFilter === game.id) setGameFilter(null);
      loadGames();
      load();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const toggleDustCleared = async (cardId, cleared) => {
    try {
      await apiJson(`/api/profit/gocash/cards/${encodeURIComponent(cardId)}/dust-clear`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cleared }),
        fallbackError: "อัปเดตสถานะเคลียเศษไม่สำเร็จ",
      });
      load();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const setCardGame = async (cardId, gameId) => {
    try {
      await apiJson(`/api/profit/gocash/cards/${encodeURIComponent(cardId)}/game`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
        fallbackError: "อัปเดตเกมของบัตรไม่สำเร็จ",
      });
      load();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const submitAddCard = async () => {
    setSaving(true);
    try {
      await apiJson(`/api/profit/categories/${categoryId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, openingBalance: Number(form.openingBalance) || 0, gameId: form.gameId || null }),
        fallbackError: "เพิ่มบัตรไม่สำเร็จ",
      });
      setAddOpen(false);
      setForm({ name: "", openingBalance: "0", note: "", gameId: "" });
      load();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredCards = useMemo(() => {
    if (!data) return [];
    let list = data.cards;

    const query = q.trim().toLowerCase();
    if (query) {
      if (data.category.source === "gocash" || data.category.source === "gocash-dust") {
        list = list.filter((c) => matchesQuery(query, [c.name, c.gameName, c.cardSerial, c.slotIndex, ...(c.orderIds || [])]));
      } else if (data.category.source === "oxide") {
        list = list.filter((c) => matchesQuery(query, [c.name, c.cardSerial]));
      } else if (data.category.source === "manual") {
        list = list.filter((c) => matchesQuery(query, [c.name, c.gameName]));
      }
    }

    if (data.category.id === "gocash-dust" && statusFilter !== "all") {
      list = list.filter((c) => (statusFilter === "cleared" ? c.dustCleared : c.needsDustClear));
    }

    if (dupFilter === "needs") {
      list = list.filter((c) => c.needsDuplicateReview ?? (c.duplicateCount || 0) > 0);
    } else if (dupFilter === "reviewed") {
      list = list.filter((c) => c.duplicateReviewed && (c.duplicateCount || 0) > 0);
    }

    // GoCash cards carry a real gameId now (auto-defaulted when the channel
    // has exactly one game, tagged explicitly otherwise -- see
    // resolveGocashGame server-side), so it filters the same way manual
    // channels' cards do.
    if ((data.category.source === "manual" || data.category.source === "gocash") && gameFilter && gameFilter !== "__all__") {
      list = list.filter((c) => c.gameId === gameFilter);
    }

    return list;
  }, [data, q, statusFilter, dupFilter, gameFilter]);

  const cardCountByGame = useMemo(() => {
    const map = new Map();
    if (!data) return map;
    for (const c of data.cards) {
      if (c.gameId) map.set(c.gameId, (map.get(c.gameId) || 0) + 1);
    }
    return map;
  }, [data]);

  // GoCash lists can run to 200+ cards, which is too long to eyeball in one
  // scroll -- sorted (dust page keeps "ต้องเคลียร์" cards first, same as
  // before) and paginated the same way the GoCash history feed already is.
  const sortedCards = useMemo(() => {
    if (!data) return [];
    const isDust = data.category.id === "gocash-dust";
    return [...filteredCards].sort((a, b) => {
      if (isDust) {
        const aNeeds = a.needsDustClear ? 0 : 1;
        const bNeeds = b.needsDustClear ? 0 : 1;
        if (aNeeds !== bNeeds) return aNeeds - bNeeds;
      }
      const d = new Date(a.lastOrderAt || 0) - new Date(b.lastOrderAt || 0);
      return sortDir === "asc" ? d : -d;
    });
  }, [data, filteredCards, sortDir]);

  if (error) {
    return <div className="rounded-lg border border-ll-hairline bg-ll-surface-1 p-6 text-sm text-ll-primary-subtle-text">เกิดข้อผิดพลาด: {error}</div>;
  }
  if (!data) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-ll-ink-subtle">
        <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
      </p>
    );
  }

  const { category, cards } = data;
  const isDustPage = category.id === "gocash-dust";
  const isGocash = category.source === "gocash" || category.source === "gocash-dust";
  const isOxide = category.source === "oxide";
  const isManual = category.source === "manual";

  const totalPages = Math.max(1, Math.ceil(sortedCards.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedCards = sortedCards.slice(pageStart, pageStart + pageSize);

  // Channels with at least one game defined land on a "pick a game" grid
  // first (like Wavepay → lovedeep/harry magic/the division) instead of
  // dumping every card from every game into one table -- picking a game (or
  // "ทั้งหมด") drills into the familiar card table, same as before. GoCash
  // gets this too -- its cards resolve a real gameId server-side (auto to the
  // channel's one game today, tagged manually once a second game exists), so
  // each tile's count and filter are real, not a decorative full-list link.
  const canBrowseGames = isManual || (isGocash && !isDustPage);
  const showGameBrowser = canBrowseGames && games.length > 0 && gameFilter === null;

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[12px] text-ll-ink-subtle">
        <Link href="/profit" className="hover:underline">ภาพรวม</Link>
        <ChevronRight size={12} />
        <span className="text-ll-ink">{category.name}{isDustPage ? " · เคลียเศษ" : ""}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ll-ink">{category.name}{isDustPage ? " · เคลียเศษ" : ""}</h1>
          <p className="mt-0.5 text-[13px] text-ll-ink-subtle">
            {isDustPage
              ? "บัตรที่เหลือเศษต่ำกว่า $1.00 ตัดแพ็กต่อไม่ได้แล้ว ต้องเคลียร์"
              : isGocash
                ? "บัตรใบละ $100 · ยอดตัด = 100 − คงเหลือล่าสุด (ไม่บวกประวัติเก่าทั้งก้อน)"
                : isOxide
                  ? "บัตร MOL MultiGameCard ของบอท Oxide (หน่วย points, ~1000 pts = $1)"
                  : "บัตรในหมวดนี้ คลิกแถวเพื่อดูออเดอร์"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {category.id === "gocash" && (
            <UsdThbRateInput info={usdThbInfo} disabled={!canEdit} syncing={syncingUsdThb} onSync={syncUsdThbRate} />
          )}
          {category.id === "gocash" && (
            <GocashRateInput rate={gocashRate} disabled={!canEdit} onCommit={saveGocashRate} />
          )}
          {category.id === "gocash" && usdThbInfo?.rate > 0 && gocashRate > 0 && (
            <span className="text-[11px] text-ll-ink-tertiary" title="เรทที่ใช้คำนวณต้นทุนจริง = USD:THB × เรท GoCash">
              = {(usdThbInfo.rate * gocashRate).toFixed(4)} ฿/USD
            </span>
          )}
          {category.id === "gocash" && (
            <Link
              href="/profit/category/gocash-dust"
              className="rounded-md border border-ll-hairline-strong px-3 py-2 text-[12px] font-medium text-ll-ink hover:bg-ll-surface-2"
            >
              เคลียเศษ
            </Link>
          )}
          {isGocash && (
            <Link
              href="/profit/gocash-history"
              className="flex items-center gap-1.5 rounded-md border border-ll-hairline-strong px-3 py-2 text-[12px] font-medium text-ll-ink hover:bg-ll-surface-2"
            >
              <History size={13} /> ดูประวัติทั้งหมด
            </Link>
          )}
          {isManual && canEdit && (
            <button
              type="button"
              onClick={() => {
                // Pre-select whichever game's list is currently open, if any.
                setForm((f) => ({ ...f, gameId: gameFilter && gameFilter !== "__all__" ? gameFilter : "" }));
                setAddOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-md bg-ll-primary px-3 py-2 text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover"
            >
              <Plus size={13} /> เพิ่มบัตร
            </button>
          )}
        </div>
      </div>

      <CategorySummary
        category={category}
        cards={cards}
        dupFilter={dupFilter}
        onToggleDupOnly={() => {
          setDupFilter((v) => (v === "needs" ? "all" : "needs"));
          // Clicking this from the game-picker landing screen should jump
          // straight into the unified "ทั้งหมด (ไม่แยกเกม)" list instead of
          // leaving the picker grid showing with nothing visibly filtered --
          // duplicates need to be seen across every game at once here.
          setGameFilter((v) => (v === null ? "__all__" : v));
          setPage(1);
        }}
      />

      {!isDustPage && isOxide && (
        <GamesBar games={games} canEdit={canEdit} onAddGame={() => setAddGameOpen(true)} onRemoveGame={removeGame} />
      )}

      {canBrowseGames && games.length === 0 && canEdit && (
        <button
          type="button"
          onClick={() => setAddGameOpen(true)}
          className="flex w-fit items-center gap-1 rounded-full border border-dashed border-ll-hairline-strong px-2.5 py-1 text-[11px] font-medium text-ll-ink-subtle hover:border-ll-primary hover:text-ll-primary-subtle-text"
        >
          <Plus size={11} /> เพิ่มเกม (ถ้าช่องทางนี้เติมได้หลายเกม)
        </button>
      )}

      {canBrowseGames && !showGameBrowser && games.length > 0 && (
        <button
          type="button"
          onClick={() => { setGameFilter(null); setPage(1); }}
          className="inline-flex w-fit items-center gap-1.5 text-[12px] font-medium text-ll-ink-subtle hover:text-ll-ink"
        >
          ← กลับไปเลือกเกม
          {gameFilter && gameFilter !== "__all__" && (
            <span className="text-ll-ink"> · {games.find((g) => g.id === gameFilter)?.name}</span>
          )}
        </button>
      )}

      {showGameBrowser && (
        <GameBrowseGrid
          games={games}
          cardCountByGame={cardCountByGame}
          totalCardCount={cards.length}
          canEdit={canEdit}
          onSelectGame={(id) => { setGameFilter(id); setPage(1); }}
          onAddGame={() => setAddGameOpen(true)}
          onRemoveGame={removeGame}
        />
      )}

      {(isGocash || isOxide || isManual) && !showGameBrowser && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2.5">
            <input
              type="search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder={isOxide ? "ค้นหาเลขบัตร, serial..." : isManual ? "ค้นหาชื่อบัตร..." : "ค้นหาเลขบัตร, serial, ออเดอร์..."}
              className="h-9 w-72 max-w-full rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-3 text-[13px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1"
            />
            {isGocash && (
              <label className="flex flex-col gap-1 text-[11px] text-ll-ink-subtle">
                กรอง
                <select
                  value={dupFilter}
                  onChange={(e) => { setDupFilter(e.target.value); setPage(1); }}
                  className="h-9 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2.5 text-[13px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="needs">พบยอดซ้ำ (ยังไม่ตรวจ)</option>
                  <option value="reviewed">ตรวจสอบแล้ว</option>
                </select>
              </label>
            )}
            {isDustPage && (
              <label className="flex flex-col gap-1 text-[11px] text-ll-ink-subtle">
                สถานะ
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="h-9 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2.5 text-[13px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="needs">ต้องเคลียร์</option>
                  <option value="cleared">เคลียร์แล้ว</option>
                </select>
              </label>
            )}
            {(isGocash || isManual) && (
              <>
                <label className="flex flex-col gap-1 text-[11px] text-ll-ink-subtle">
                  เรียง
                  <select
                    value={sortDir}
                    onChange={(e) => { setSortDir(e.target.value); setPage(1); }}
                    className="h-9 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2.5 text-[13px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1"
                  >
                    <option value="desc">ใหม่สุดก่อน</option>
                    <option value="asc">เก่าสุดก่อน</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-ll-ink-subtle">
                  แถว
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="h-9 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2.5 text-[13px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1"
                  >
                    {[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </>
            )}
          </div>
          <span className="text-[12px] text-ll-ink-subtle">
            {q || statusFilter !== "all" || dupFilter !== "all" ? `เจอ ${filteredCards.length} บัตร` : `${cards.length} บัตร`}
            {isGocash || isManual ? ` · หน้า ${safePage}/${totalPages}` : ""}
          </span>
        </div>
      )}

      {!showGameBrowser && (
      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        {isManual && <ManualCardsTable categoryId={categoryId} cards={pagedCards} />}
        {isGocash && (
          <GocashCardsTable
            cards={pagedCards}
            games={games}
            isDustPage={isDustPage}
            canEdit={canEdit}
            onToggleDustCleared={toggleDustCleared}
            onSetCardGame={setCardGame}
          />
        )}
        {isOxide && <OxideCardsTable categoryId={categoryId} cards={filteredCards} q={q} />}
        {(isGocash || isManual) && sortedCards.length > 0 && (
          <div className="flex items-center justify-between border-t border-ll-hairline px-4 py-3 text-[12px] text-ll-ink-subtle">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-ll-hairline-strong px-3 py-1.5 font-medium text-ll-ink hover:bg-ll-surface-2 disabled:opacity-50"
            >
              ก่อนหน้า
            </button>
            <span>{pageStart + 1}–{Math.min(pageStart + pageSize, sortedCards.length)} จาก {sortedCards.length}</span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-ll-hairline-strong px-3 py-1.5 font-medium text-ll-ink hover:bg-ll-surface-2 disabled:opacity-50"
            >
              ถัดไป
            </button>
          </div>
        )}
      </section>
      )}

      {addOpen && (
        <ProfitModal
          title="เพิ่มบัตร"
          onClose={() => setAddOpen(false)}
          actions={
            <button
              type="button"
              onClick={submitAddCard}
              disabled={saving}
              className="rounded-md bg-ll-primary px-3.5 py-2 text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          }
        >
          <ProfitField label="ชื่อ/เลขบัตร">
            <input className={profitInputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </ProfitField>
          {games.length > 0 && (
            <ProfitField label="เกม (ถ้ามี)">
              <select
                className={profitInputClass}
                value={form.gameId}
                onChange={(e) => setForm((f) => ({ ...f, gameId: e.target.value }))}
              >
                <option value="">ไม่ระบุเกม</option>
                {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </ProfitField>
          )}
          <ProfitField label="ยอดเงินตั้งต้นในบัตร">
            <input
              className={profitInputClass}
              type="number"
              step="0.01"
              value={form.openingBalance}
              onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
            />
          </ProfitField>
          <ProfitField label="โน้ต">
            <input className={profitInputClass} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </ProfitField>
        </ProfitModal>
      )}

      {addGameOpen && <AddGameModal onClose={() => setAddGameOpen(false)} onSubmit={addGame} />}
    </div>
  );
}

// Plain fiat USD->THB spot rate, always sourced from exchangerate-api.com --
// auto-refreshed server-side once the cached value is more than 12h stale
// (see ensureUsdThbRate), or on demand via the sync button. Read-only here on
// purpose: unlike GocashRateInput, this number isn't something staff decide,
// so there's nothing to type in -- if the API key ever stops working, fix
// the key rather than overriding this value.
function UsdThbRateInput({ info, disabled, syncing, onSync }) {
  const title = [
    info?.updatedAt ? `อัปเดตล่าสุด ${fmtDate(info.updatedAt)}` : "",
    info?.error ? `ซิงค์ล่าสุดล้มเหลว: ${info.error}` : "",
  ]
    .filter(Boolean)
    .join(" — ");
  return (
    <div
      className="flex items-center gap-1.5 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2.5 py-1.5 text-[12px] text-ll-ink-subtle"
      title={title || undefined}
    >
      <span>USD:THB</span>
      <span className="font-medium text-ll-ink">{info?.rate > 0 ? info.rate : "-"}</span>
      {info?.error && <span className="text-[10px] text-red-600">ซิงค์ล้มเหลว</span>}
      {disabled ? null : (
        <button
          type="button"
          title="ซิงค์จาก API"
          disabled={syncing}
          onClick={onSync}
          className="rounded-md p-1 text-ll-ink-tertiary hover:bg-ll-surface-1 hover:text-ll-ink disabled:opacity-50"
        >
          <RefreshCw size={12} className={syncing ? "animate-spin" : undefined} />
        </button>
      )}
    </div>
  );
}

// GoCash's own deal rate -- what support actually paid to buy the credit
// (their cost sheet breaks this into "Discount" x "Fee", this project just
// tracks the combined number). No live source yet, so it's always typed in
// by hand until it can be pulled from gameinfo instead.
function GocashRateInput({ rate, disabled, onCommit }) {
  const [local, setLocal] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing the input's draft value when the server-loaded value changes underneath it
    setLocal(rate == null ? "" : String(rate));
  }, [rate]);
  return (
    <label className="flex items-center gap-1.5 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2.5 py-1.5 text-[12px] text-ll-ink-subtle">
      เรท GoCash
      <input
        type="number"
        step="0.0001"
        min="0"
        disabled={disabled || rate == null}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== "" && Number(local) !== Number(rate)) onCommit(local);
        }}
        placeholder="เช่น 0.899"
        className="h-7 w-20 rounded-md border border-ll-hairline-strong bg-ll-surface-1 px-2 text-right text-[12px] text-ll-ink outline-none focus:border-ll-primary disabled:opacity-60"
      />
    </label>
  );
}

// Reference-only chip row for Oxide -- lets staff note which games a bot
// channel currently handles and add more as it grows, but the chips aren't
// clickable filters since that live data has no per-order game field to
// actually filter on yet (see GameBrowseGrid for the manual-channel and
// GoCash version, which does land on a proper picker).
function GamesBar({ games, canEdit, onAddGame, onRemoveGame }) {
  if (!games.length && !canEdit) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-ll-ink-subtle">เกม (อ้างอิง):</span>
      {games.map((g) => (
        <span
          key={g.id}
          className="flex items-center gap-1 rounded-full border border-ll-hairline-strong py-1 pl-2.5 pr-1.5 text-[11px] font-medium text-ll-ink-subtle"
        >
          {g.name}
          {canEdit && (
            <button
              type="button"
              title="ลบเกมนี้"
              onClick={() => onRemoveGame(g)}
              className="rounded-full p-0.5 text-ll-ink-tertiary hover:bg-ll-surface-2 hover:text-red-600"
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {canEdit && (
        <button
          type="button"
          onClick={onAddGame}
          className="flex items-center gap-1 rounded-full border border-dashed border-ll-hairline-strong px-2.5 py-1 text-[11px] font-medium text-ll-ink-subtle hover:border-ll-primary hover:text-ll-primary-subtle-text"
        >
          <Plus size={11} /> เพิ่มเกม
        </button>
      )}
    </div>
  );
}

// Landing view for a channel that has games defined -- e.g. a "Wavepay"
// channel topping up lovedeep / harry magic / the division shows each as its
// own tile here; clicking one drills into that game's card list (same table
// as before, just scoped). "ทั้งหมด" opts out of the split and shows every
// card unsplit, same as a channel with no games defined at all. GoCash uses
// this same picker once it has a game added (e.g. "Sky") -- its tiles all
// lead to the same full list since its cards don't carry a per-order game
// field yet (see cardCountByGame in the parent).
function GameBrowseGrid({ games, cardCountByGame, totalCardCount, canEdit, onSelectGame, onAddGame, onRemoveGame }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ll-ink-subtle">เลือกเกมเพื่อดูยอด/บัตรของเกมนั้น</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((g) => (
          <div key={g.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelectGame(g.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-ll-hairline bg-ll-surface-1 p-4 text-left shadow-[var(--ll-shadow-card)] transition hover:border-ll-hairline-strong hover:bg-ll-surface-2"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <Layers size={19} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-ll-ink">{g.name}</span>
                <span className="mt-0.5 block text-[12px] text-ll-ink-subtle">{cardCountByGame.get(g.id) || 0} บัตร</span>
              </span>
            </button>
            {canEdit && (
              <button
                type="button"
                title="ลบเกมนี้"
                onClick={() => onRemoveGame(g)}
                className="absolute right-2 top-2 rounded-full p-1 text-ll-ink-tertiary opacity-0 hover:bg-ll-surface-2 hover:text-red-600 group-hover:opacity-100"
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => onSelectGame("__all__")}
          className="flex items-center gap-3 rounded-lg border border-ll-hairline bg-ll-surface-1 p-4 text-left shadow-[var(--ll-shadow-card)] transition hover:border-ll-hairline-strong hover:bg-ll-surface-2"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ll-surface-2 text-ll-ink-subtle">
            <Layers size={19} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-medium text-ll-ink">ทั้งหมด (ไม่แยกเกม)</span>
            <span className="mt-0.5 block text-[12px] text-ll-ink-subtle">{totalCardCount} บัตร</span>
          </span>
        </button>

        {canEdit && (
          <button
            type="button"
            onClick={onAddGame}
            className="flex min-h-[76px] items-center justify-center gap-2 rounded-lg border border-dashed border-ll-hairline-strong p-4 text-[13px] font-medium text-ll-ink-subtle transition hover:border-ll-primary hover:text-ll-primary-subtle-text"
          >
            <Plus size={16} /> เพิ่มเกม
          </button>
        )}
      </div>
    </div>
  );
}

function AddGameModal({ onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit(name.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfitModal
      title="เพิ่มเกม"
      onClose={onClose}
      actions={
        <button
          type="button"
          onClick={submit}
          disabled={saving || !name.trim()}
          className="rounded-md bg-ll-primary px-3.5 py-2 text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "เพิ่มเกม"}
        </button>
      }
    >
      <ProfitField label="ชื่อเกม">
        <input
          autoFocus
          className={profitInputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="เช่น Lovedeep"
        />
      </ProfitField>
    </ProfitModal>
  );
}

function CategorySummary({ category, cards, dupFilter, onToggleDupOnly }) {
  if (category.source === "gocash" || category.source === "gocash-dust") {
    const t = cards.reduce(
      (a, c) => ({
        sale: a.sale + c.saleTotal,
        cost: a.cost + c.costTotal,
        profit: a.profit + c.profitTotal,
        deducted: a.deducted + c.deductedTotal,
        remaining: a.remaining + (c.remaining || 0),
        orders: a.orders + c.orderCount,
        dup: a.dup + (c.needsDuplicateReview ? 1 : 0),
      }),
      { sale: 0, cost: 0, profit: 0, deducted: 0, remaining: 0, orders: 0, dup: 0 }
    );
    return (
      <ProfitSummaryGrid
        items={[
          { k: "จำนวนบัตร", v: cards.length },
          { k: "ออเดอร์", v: t.orders },
          { k: "ยอดขายรวม", v: fmtMoney(t.sale) },
          { k: "ต้นทุนรวม", v: fmtMoney(t.cost) },
          { k: "กำไรรวม", v: fmtMoney(t.profit), tone: t.profit >= 0 ? "pos" : "neg" },
          { k: "ยอดตัดรวมทุกบัตร (USD)", v: fmtUsd(t.deducted) },
          { k: "คงเหลือรวมทุกบัตร (USD)", v: fmtUsd(t.remaining) },
          {
            k: "บัตรที่พบยอดซ้ำ",
            v: t.dup,
            tone: t.dup > 0 ? "neg" : undefined,
            onClick: t.dup > 0 ? onToggleDupOnly : undefined,
            active: dupFilter === "needs",
          },
        ]}
      />
    );
  }

  if (category.source === "oxide") {
    const t = cards.reduce(
      (a, c) => ({ balance: a.balance + (c.balancePoints || 0), enabled: a.enabled + (c.status === "active" ? 1 : 0) }),
      { balance: 0, enabled: 0 }
    );
    return (
      <ProfitSummaryGrid
        items={[
          { k: "จำนวนบัตร", v: cards.length },
          { k: "เปิดใช้งาน", v: t.enabled },
          { k: "ปิดใช้งาน", v: cards.length - t.enabled, tone: cards.length - t.enabled > 0 ? "neg" : undefined },
          { k: "คงเหลือรวม", v: fmtPoints(t.balance) },
        ]}
      />
    );
  }

  const t = cards.reduce(
    (a, c) => ({
      sale: a.sale + c.saleTotal,
      cost: a.cost + c.costTotal,
      profit: a.profit + c.profitTotal,
      deducted: a.deducted + c.deductedTotal,
      orders: a.orders + c.orderCount,
      dup: a.dup + (c.duplicateCount > 0 ? 1 : 0),
    }),
    { sale: 0, cost: 0, profit: 0, deducted: 0, orders: 0, dup: 0 }
  );
  const pct = t.sale > 0 ? (t.profit / t.sale) * 100 : 0;
  return (
    <ProfitSummaryGrid
      items={[
        { k: "จำนวนบัตร", v: cards.length },
        { k: "ออเดอร์", v: t.orders },
        { k: "ยอดขายรวม", v: fmtMoney(t.sale) },
        { k: "ต้นทุนรวม", v: fmtMoney(t.cost) },
        { k: "กำไรรวม", v: fmtMoney(t.profit), tone: t.profit >= 0 ? "pos" : "neg" },
        { k: "%กำไร", v: fmtPct(pct) },
        { k: "ยอดตัด", v: fmtMoney(t.deducted) },
        {
          k: "บัตรที่พบยอดซ้ำ",
          v: t.dup,
          tone: t.dup > 0 ? "neg" : undefined,
          onClick: t.dup > 0 ? onToggleDupOnly : undefined,
          active: dupFilter === "needs",
        },
      ]}
    />
  );
}

function ManualCardsTable({ categoryId, cards }) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px] text-ll-ink">
        <thead>
          <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
            <th className="px-4 py-2 font-medium">บัตร</th>
            <th className="px-3 py-2 font-medium">เกม</th>
            <th className="px-3 py-2 text-right font-medium">ออเดอร์</th>
            <th className="px-3 py-2 text-right font-medium">ยอดขาย</th>
            <th className="px-3 py-2 text-right font-medium">ต้นทุน</th>
            <th className="px-3 py-2 text-right font-medium">กำไร</th>
            <th className="px-3 py-2 text-right font-medium">%กำไร</th>
            <th className="px-3 py-2 text-right font-medium">ยอดตัด</th>
            <th className="px-3 py-2 font-medium">ตัดซ้ำ</th>
            <th className="px-3 py-2 font-medium">ตัดล่าสุด</th>
          </tr>
        </thead>
        <tbody>
          {cards.length ? (
            cards.map((c) => (
              <tr
                key={c.id}
                onClick={() => router.push(`/profit/category/${categoryId}/card/${encodeURIComponent(c.id)}`)}
                className="cursor-pointer border-b border-ll-hairline last:border-0 hover:bg-ll-surface-2"
              >
                <td className="px-4 py-2.5 font-medium text-ll-ink">{c.name}</td>
                <td className="px-3 py-2.5 text-ll-ink-subtle">{c.gameName || "-"}</td>
                <td className="px-3 py-2.5 text-right">{c.orderCount}</td>
                <td className="px-3 py-2.5 text-right">{fmtMoney(c.saleTotal)}</td>
                <td className="px-3 py-2.5 text-right">{fmtMoney(c.costTotal)}</td>
                <td className={`px-3 py-2.5 text-right ${c.profitTotal >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtMoney(c.profitTotal)}</td>
                <td className="px-3 py-2.5 text-right">{fmtPct(c.profitPct)}</td>
                <td className="px-3 py-2.5 text-right">{fmtMoney(c.deductedTotal)}</td>
                <td className="px-3 py-2.5"><DupBadge n={c.duplicateCount} /></td>
                <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(c.lastOrderAt)}</td>
              </tr>
            ))
          ) : (
            <tr><td colSpan={10} className="px-4 py-8 text-center text-ll-ink-subtle">ยังไม่มีบัตรในหมวดนี้</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GocashCardsTable({ cards, games, isDustPage, canEdit, onToggleDustCleared, onSetCardGame }) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px] text-ll-ink">
        <thead>
          <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
            <th className="px-4 py-2 font-medium">บัตร</th>
            <th className="px-3 py-2 font-medium">เกม</th>
            <th className="px-3 py-2 text-right font-medium">ออเดอร์</th>
            <th className="px-3 py-2 text-right font-medium">ยอดขาย</th>
            <th className="px-3 py-2 text-right font-medium">ยอดตัด (USD)</th>
            <th className="px-3 py-2 text-right font-medium">คงเหลือ (USD)</th>
            <th className="px-3 py-2 font-medium">ตัดซ้ำ</th>
            <th className="px-3 py-2 font-medium">ตัดล่าสุด</th>
            {isDustPage && <th className="px-3 py-2 font-medium">เคลียเศษ</th>}
            {isDustPage && <th className="px-3 py-2 font-medium">เคลียร์โดย</th>}
          </tr>
        </thead>
        <tbody>
          {cards.length ? (
            cards.map((c) => (
              <tr
                key={c.id}
                onClick={() => router.push(`/profit/category/${c.categoryId}/card/${encodeURIComponent(c.id)}`)}
                className="cursor-pointer border-b border-ll-hairline last:border-0 hover:bg-ll-surface-2"
              >
                <td className="px-4 py-2.5 font-medium text-ll-ink">{c.name}</td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  {games.length > 1 ? (
                    <select
                      value={c.gameId || ""}
                      disabled={!canEdit}
                      onChange={(e) => onSetCardGame(c.id, e.target.value || null)}
                      className="h-8 rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-2 text-[12px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1 disabled:opacity-60"
                    >
                      <option value="">ยังไม่ระบุเกม</option>
                      {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  ) : (
                    <span className="text-ll-ink-subtle">{c.gameName || "-"}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">{c.orderCount}</td>
                <td className="px-3 py-2.5 text-right">{fmtMoney(c.saleTotal)}</td>
                <td className="px-3 py-2.5 text-right">{fmtUsd(c.deductedTotal)}</td>
                <td className="px-3 py-2.5 text-right">{fmtUsd(c.remaining)}</td>
                <td className="px-3 py-2.5">
                  <DupBadge n={c.duplicateCount} />
                </td>
                <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(c.lastOrderAt)}</td>
                {isDustPage && (
                  <td className="px-3 py-2.5">
                    <DustBadge card={c} disabled={!canEdit} onToggle={onToggleDustCleared} />
                  </td>
                )}
                {isDustPage && (
                  <td className="px-3 py-2.5">
                    <ClearedByCell card={c} />
                  </td>
                )}
              </tr>
            ))
          ) : (
            <tr><td colSpan={isDustPage ? 10 : 8} className="px-4 py-8 text-center text-ll-ink-subtle">
              {isDustPage ? "ไม่มีบัตรที่ต้องเคลียเศษ" : "ยังไม่มีข้อมูลจาก DB"}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function OxideCardsTable({ categoryId, cards, q }) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13px] text-ll-ink">
        <thead>
          <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
            <th className="px-4 py-2 font-medium">บัตร</th>
            <th className="px-3 py-2 font-medium">สถานะ</th>
            <th className="px-3 py-2 text-right font-medium">ออเดอร์</th>
            <th className="px-3 py-2 text-right font-medium">คงเหลือ</th>
            <th className="px-3 py-2 font-medium">ตัดล่าสุด</th>
          </tr>
        </thead>
        <tbody>
          {cards.length ? (
            cards.map((c) => (
              <tr
                key={c.id}
                onClick={() => router.push(`/profit/category/${categoryId}/card/${encodeURIComponent(c.id)}`)}
                className="cursor-pointer border-b border-ll-hairline last:border-0 hover:bg-ll-surface-2"
              >
                <td className="px-4 py-2.5 font-medium text-ll-ink">{c.name}</td>
                <td className="px-3 py-2.5"><StatusBadge enabled={c.status === "active"} /></td>
                <td className="px-3 py-2.5 text-right">{c.orderCount}</td>
                <td className="px-3 py-2.5 text-right">{fmtPoints(c.balancePoints)}</td>
                <td className="px-3 py-2.5 text-ll-ink-subtle">{fmtDate(c.lastOrderAt)}</td>
              </tr>
            ))
          ) : (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-ll-ink-subtle">{q ? "ไม่พบเลขที่ค้นหา" : "ยังไม่มีข้อมูลจาก DB"}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
