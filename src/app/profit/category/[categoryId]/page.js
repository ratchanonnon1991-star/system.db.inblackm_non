"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, History, Loader2, Plus } from "lucide-react";
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
  const [form, setForm] = useState({ name: "", openingBalance: "0", note: "" });
  const [saving, setSaving] = useState(false);
  const [sortDir, setSortDir] = useState("desc");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all"); // all | needs | cleared -- dust page only

  const load = useCallback(() => {
    apiJson(`/api/profit/categories/${categoryId}/cards`, { fallbackError: "โหลดรายการบัตรไม่สำเร็จ" })
      .then((res) => setData(res))
      .catch((err) => setError(err.message));
  }, [categoryId]);

  useEffect(() => {
    load();
  }, [load]);

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

  const submitAddCard = async () => {
    setSaving(true);
    try {
      await apiJson(`/api/profit/categories/${categoryId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, openingBalance: Number(form.openingBalance) || 0 }),
        fallbackError: "เพิ่มบัตรไม่สำเร็จ",
      });
      setAddOpen(false);
      setForm({ name: "", openingBalance: "0", note: "" });
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
        list = list.filter((c) => matchesQuery(query, [c.name, c.cardSerial, c.slotIndex, ...(c.orderIds || [])]));
      } else if (data.category.source === "oxide") {
        list = list.filter((c) => matchesQuery(query, [c.name, c.cardSerial]));
      }
    }

    if (data.category.id === "gocash-dust" && statusFilter !== "all") {
      list = list.filter((c) => (statusFilter === "cleared" ? c.dustCleared : c.needsDustClear));
    }

    return list;
  }, [data, q, statusFilter]);

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
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-ll-primary px-3 py-2 text-[12px] font-medium text-ll-on-primary hover:bg-ll-primary-hover"
            >
              <Plus size={13} /> เพิ่มบัตร
            </button>
          )}
        </div>
      </div>

      <CategorySummary category={category} cards={cards} />

      {(isGocash || isOxide) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2.5">
            <input
              type="search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder={isOxide ? "ค้นหาเลขบัตร, serial..." : "ค้นหาเลขบัตร, serial, ออเดอร์..."}
              className="h-9 w-72 max-w-full rounded-md border border-ll-hairline-strong bg-ll-surface-2 px-3 text-[13px] text-ll-ink outline-none focus:border-ll-primary focus:bg-ll-surface-1"
            />
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
            {isGocash && (
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
            {q || statusFilter !== "all" ? `เจอ ${filteredCards.length} บัตร` : `${cards.length} บัตร`}
            {isGocash ? ` · หน้า ${safePage}/${totalPages}` : ""}
          </span>
        </div>
      )}

      <section className="rounded-lg border border-ll-hairline bg-ll-surface-1">
        {isManual && <ManualCardsTable categoryId={categoryId} cards={filteredCards} />}
        {isGocash && (
          <GocashCardsTable cards={pagedCards} isDustPage={isDustPage} canEdit={canEdit} onToggleDustCleared={toggleDustCleared} />
        )}
        {isOxide && <OxideCardsTable categoryId={categoryId} cards={filteredCards} q={q} />}
        {isGocash && sortedCards.length > 0 && (
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
    </div>
  );
}

function CategorySummary({ category, cards }) {
  if (category.source === "gocash" || category.source === "gocash-dust") {
    const t = cards.reduce(
      (a, c) => ({
        sale: a.sale + c.saleTotal,
        cost: a.cost + c.costTotal,
        profit: a.profit + c.profitTotal,
        deducted: a.deducted + c.deductedTotal,
        remaining: a.remaining + (c.remaining || 0),
        orders: a.orders + c.orderCount,
        dup: a.dup + (c.duplicateCount > 0 ? 1 : 0),
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
          { k: "บัตรที่พบยอดซ้ำ", v: t.dup, tone: t.dup > 0 ? "neg" : undefined },
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
        { k: "บัตรที่พบยอดซ้ำ", v: t.dup, tone: t.dup > 0 ? "neg" : undefined },
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
            <tr><td colSpan={9} className="px-4 py-8 text-center text-ll-ink-subtle">ยังไม่มีบัตรในหมวดนี้</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GocashCardsTable({ cards, isDustPage, canEdit, onToggleDustCleared }) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px] text-ll-ink">
        <thead>
          <tr className="border-b border-ll-hairline text-left text-[11px] text-ll-ink-subtle">
            <th className="px-4 py-2 font-medium">บัตร</th>
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
                <td className="px-3 py-2.5 text-right">{c.orderCount}</td>
                <td className="px-3 py-2.5 text-right">{fmtMoney(c.saleTotal)}</td>
                <td className="px-3 py-2.5 text-right">{fmtUsd(c.deductedTotal)}</td>
                <td className="px-3 py-2.5 text-right">{fmtUsd(c.remaining)}</td>
                <td className="px-3 py-2.5"><DupBadge n={c.duplicateCount} /></td>
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
            <tr><td colSpan={isDustPage ? 9 : 7} className="px-4 py-8 text-center text-ll-ink-subtle">
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
