"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, ExternalLink, GripVertical, Image as ImageIcon, Minus, RefreshCw, Search } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useGameinfoDialog } from "@/lib/use-gameinfo-dialog";

const storageKey = (name, game) => `gameinfo:kaleoz-${name}:${game || "zepeto"}`;
const AUTO_REFRESH_MS = 60 * 60 * 1000;

function money(value, currency) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("th-TH", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toLocaleString("th-TH")} ${currency}`;
  }
}

function number(value) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

export default function GameinfoPackPriceCompare({ page: serverPage }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [sellerOrder, setSellerOrder] = useState([]);
  const [baselineSeller, setBaselineSeller] = useState("InblackmTH");
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [refreshedPage, setRefreshedPage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const page = refreshedPage?.game === serverPage?.game && refreshedPage?.productType === serverPage?.productType ? refreshedPage : serverPage;
  const currentGame = page?.game || "zepeto";
  const currentProductType = page?.productType;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const {
    dialogRef,
    titleId,
    onBackdropMouseDown,
  } = useGameinfoDialog({ open: Boolean(selectedGroup), onRequestClose: () => setSelectedGroup(null) });
  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("th");
    if (!needle) return page?.groups || [];
    return (page?.groups || []).filter((group) =>
      group.offers.some((offer) => `${group.quantity ?? ""} ${offer.title} ${offer.seller}`.toLocaleLowerCase("th").includes(needle))
    );
  }, [page, query]);
  const availableSellers = useMemo(() => [...new Set((page?.offers || []).map((offer) => offer.seller).filter(Boolean))]
    .sort((a, b) => (a === "InblackmTH" ? -1 : b === "InblackmTH" ? 1 : a.localeCompare(b))), [page]);
  const sellers = useMemo(() => [
    ...sellerOrder.filter((seller) => availableSellers.includes(seller)),
    ...availableSellers.filter((seller) => !sellerOrder.includes(seller)),
  ], [availableSellers, sellerOrder]);
  const activeBaselineSeller = sellers.includes(baselineSeller) ? baselineSeller : sellers[0];
  const visibleSellers = sellers.filter((seller) => !hiddenColumns.includes(`seller:${seller}`));
  const showCheapest = !hiddenColumns.includes("summary:cheapest");
  const showMostExpensive = !hiddenColumns.includes("summary:most-expensive");
  const showDetails = !hiddenColumns.includes("summary:details");

  const refreshPrices = useCallback(async () => {
    if (!currentProductType) return;
    setRefreshing(true);
    setRefreshError("");
    try {
      const response = await fetch(`/api/gameinfo/kaleoz-prices?game=${encodeURIComponent(currentGame)}&unit=${encodeURIComponent(currentProductType)}&refresh=1`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "รีข้อมูลไม่สำเร็จ");
      setRefreshedPage(data.page);
    } catch (error) {
      setRefreshError(error.message || "รีข้อมูลไม่สำเร็จ");
    } finally {
      setRefreshing(false);
    }
  }, [currentGame, currentProductType]);

  useEffect(() => {
    try {
      // Restore browser-specific preferences after hydration and whenever the game changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSellerOrder([]);
      setBaselineSeller("InblackmTH");
      setHiddenColumns([]);
      const saved = JSON.parse(localStorage.getItem(storageKey("seller-order", currentGame)) || "[]");
      if (Array.isArray(saved)) setSellerOrder(saved.filter((seller) => typeof seller === "string"));
      const savedBaseline = localStorage.getItem(storageKey("baseline-seller", currentGame));
      if (savedBaseline) setBaselineSeller(savedBaseline);
      const savedHiddenColumns = JSON.parse(localStorage.getItem(storageKey("hidden-columns", currentGame)) || "[]");
      if (Array.isArray(savedHiddenColumns)) setHiddenColumns(savedHiddenColumns.filter((column) => typeof column === "string"));
    } catch {
      localStorage.removeItem(storageKey("seller-order", currentGame));
    }
  }, [currentGame]);

  useEffect(() => {
    const timer = window.setInterval(refreshPrices, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshPrices]);

  function handleSellerDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oldIndex = visibleSellers.indexOf(active.id);
    const newIndex = visibleSellers.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedVisible = arrayMove(visibleSellers, oldIndex, newIndex);
    let visibleIndex = 0;
    const next = sellers.map((seller) => visibleSellers.includes(seller) ? reorderedVisible[visibleIndex++] : seller);
    setSellerOrder(next);
    localStorage.setItem(storageKey("seller-order", currentGame), JSON.stringify(next));
  }

  function selectBaselineSeller(seller) {
    setBaselineSeller(seller);
    localStorage.setItem(storageKey("baseline-seller", currentGame), seller);
  }

  function selectGame(value) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("game", value);
    next.delete("unit");
    setRefreshedPage(null);
    router.push(`${pathname}?${next.toString()}`);
  }

  function selectProductType(value) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("unit", value);
    setRefreshedPage(null);
    router.push(`${pathname}?${next.toString()}`);
  }

  function toggleColumn(column) {
    setHiddenColumns((current) => {
      const next = current.includes(column) ? current.filter((item) => item !== column) : [...current, column];
      localStorage.setItem(storageKey("hidden-columns", currentGame), JSON.stringify(next));
      return next;
    });
  }

  function showAllColumns() {
    setHiddenColumns([]);
    localStorage.removeItem(storageKey("hidden-columns", currentGame));
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[0.4px] text-linear-ink-tertiary">KALEOZ · {page?.gameLabel || "ZEPETO"} · PROPERTIES FILTER</p>
          <h1 className="text-[28px] font-semibold tracking-[-0.6px] text-linear-ink">Compare Product · เทียบราคา Kaleoz</h1>
          <p className="mt-1 text-sm text-linear-ink-subtle">รวมรายการที่มีตัวเลขแรกนอกวงเล็บตรงกัน และเปิดดูชื่อจริงเพื่อตรวจการจับคู่ได้</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-linear-ink-subtle">เกม</span>
            <select value={currentGame} onChange={(event) => selectGame(event.target.value)} className="min-h-10 min-w-52 rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm font-medium text-linear-ink">
              {(page?.games || []).map((game) => <option key={game.value} value={game.value} disabled={!game.available}>{game.label}{!game.available ? " (ยังไม่พบหน้า)" : ""}</option>)}
            </select>
          </label>
          <a href={page?.sourceUrl || "https://www.kaleoz.com/buy/zepeto?page=1"} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-linear-ink px-4 text-sm font-medium text-linear-canvas">
            เปิดหน้าต้นทาง <ExternalLink size={15} />
          </a>
        </div>
      </div>

      {page?.error ? (
        <p role="alert" className="rounded-xl border border-linear-primary/30 bg-linear-danger-bg p-4 text-sm text-linear-danger">{page.error}</p>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {[
              [page?.groups?.length || 0, "กลุ่มแพ็ค"],
              [page?.offers?.length || 0, `รายการจากตัวกรอง · ทั้งหมด ${number(page?.totalListings)}`],
              [sellers.length, "Seller"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5 shadow-[var(--ll-shadow-card)]">
                <p className="text-[28px] font-semibold tracking-[-0.6px] text-linear-ink">{number(value)}</p>
                <p className="mt-1 text-sm text-linear-ink-subtle">{label}</p>
              </div>
            ))}
          </div>

          <section className="rounded-2xl border border-linear-hairline bg-linear-surface-1 shadow-[var(--ll-shadow-card)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linear-hairline p-4">
              <label className="relative block w-full max-w-md">
                <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-linear-ink-tertiary" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเลขแพ็ค ชื่อ หรือ Seller" className="min-h-10 w-full rounded-lg border border-linear-hairline-strong bg-linear-surface-1 pl-10 pr-3 text-sm text-linear-ink placeholder:text-linear-ink-tertiary" />
              </label>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-linear-ink-subtle">หน่วยเงินในเกม</span>
                  <select value={page?.productType || ""} onChange={(event) => selectProductType(event.target.value)} disabled={!page?.productTypes?.length} className="min-h-10 min-w-40 rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm font-medium text-linear-ink disabled:opacity-60">
                    {(page?.productTypes || []).map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
                <details className="relative">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm font-medium text-linear-ink hover:bg-linear-surface-3 [&::-webkit-details-marker]:hidden">
                    <Columns3 size={16} /> เลือกคอลัมน์
                  </summary>
                  <div className="absolute right-0 top-12 z-30 w-64 rounded-xl border border-linear-hairline bg-linear-surface-1 p-3 shadow-[var(--ll-shadow-modal)]">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-linear-ink">คอลัมน์ที่แสดง</p>
                      <button type="button" onClick={showAllColumns} className="text-xs text-linear-ink-subtle hover:text-linear-ink">เลือกทั้งหมด</button>
                    </div>
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {[
                        ...sellers.map((seller) => ({ id: `seller:${seller}`, label: seller })),
                        { id: "summary:cheapest", label: "ราคาต่ำสุด" },
                        { id: "summary:most-expensive", label: "ราคาแพงสุด" },
                        { id: "summary:details", label: "ตรวจชื่อ" },
                      ].map((column) => (
                        <label key={column.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-linear-ink hover:bg-linear-surface-2">
                          <input type="checkbox" checked={!hiddenColumns.includes(column.id)} onChange={() => toggleColumn(column.id)} className="h-4 w-4 accent-linear-ink" />
                          <span className="truncate">{column.label}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 border-t border-linear-hairline pt-2 text-[11px] text-linear-ink-tertiary">ชื่อ Pack แสดงตลอด</p>
                  </div>
                </details>
                <details className="relative">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm font-medium text-linear-ink hover:bg-linear-surface-3 [&::-webkit-details-marker]:hidden">
                    Seller เปรียบเทียบ: <span className="max-w-32 truncate">{activeBaselineSeller || "—"}</span>
                  </summary>
                  <div className="absolute right-0 top-12 z-30 w-64 rounded-xl border border-linear-hairline bg-linear-surface-1 p-3 shadow-[var(--ll-shadow-modal)]">
                    <p className="mb-2 text-xs font-semibold text-linear-ink">เลือก Seller สำหรับเปรียบเทียบ</p>
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {sellers.map((seller) => (
                        <label key={seller} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-linear-ink hover:bg-linear-surface-2">
                          <input
                            type="checkbox"
                            checked={seller === activeBaselineSeller}
                            onChange={(event) => { if (event.target.checked) selectBaselineSeller(seller); }}
                            className="h-4 w-4 accent-linear-ink"
                          />
                          <span className="truncate">{seller}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 border-t border-linear-hairline pt-2 text-[11px] text-linear-ink-tertiary">เลือกได้ 1 Seller · แดง = ถูกกว่า · เขียว = แพงกว่า</p>
                  </div>
                </details>
                <button type="button" onClick={refreshPrices} disabled={refreshing} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm font-medium text-linear-ink hover:bg-linear-surface-3 disabled:cursor-wait disabled:opacity-60">
                  <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> {refreshing ? "กำลังรี..." : "รีข้อมูลตอนนี้"}
                </button>
                <p className="pb-2 text-sm text-linear-ink-subtle">รีอัตโนมัติทุก 1 ชม. · อัปเดตล่าสุด {page?.fetchedAt ? new Date(page.fetchedAt).toLocaleString("th-TH") : "—"}</p>
              </div>
            </div>
            {refreshError ? <p role="alert" className="border-b border-linear-hairline bg-linear-danger-bg px-4 py-2 text-xs text-linear-danger">{refreshError}</p> : null}

            <div className="scroll-x">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSellerDragEnd}>
                <SortableContext items={visibleSellers} strategy={horizontalListSortingStrategy}>
                  <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead className="bg-linear-surface-2 text-xs font-medium text-linear-ink-subtle">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-32 bg-linear-surface-2 px-4 py-3">ชื่อ Pack</th>
                    {visibleSellers.map((seller) => <SortableSellerHeader key={seller} seller={seller} isBaseline={seller === activeBaselineSeller} />)}
                    {showCheapest ? <th className="px-4 py-3 text-right">ราคาต่ำสุด</th> : null}
                    {showMostExpensive ? <th className="px-4 py-3 text-right">ราคาแพงสุด</th> : null}
                    {showDetails ? <th className="w-36 px-4 py-3">ตรวจชื่อ</th> : null}
                  </tr>
                </thead>
                {groups.map((group) => {
                  const cheapest = group.offers[0];
                  const mostExpensive = group.offers.at(-1);
                  const offersBySeller = new Map();
                  group.offers.forEach((offer) => {
                    if (!offersBySeller.has(offer.seller)) offersBySeller.set(offer.seller, offer);
                  });
                  const baselineOffer = offersBySeller.get(activeBaselineSeller);
                  return (
                    <tbody key={group.key} className="border-t border-linear-hairline">
                      <tr className="group hover:bg-linear-surface-2">
                        <td className="sticky left-0 bg-linear-surface-1 px-4 py-3 font-semibold text-linear-ink group-hover:bg-linear-surface-2">{group.packLabel || (group.quantity == null ? "ไม่พบตัวเลข" : `แพ็ค ${number(group.quantity)}`)}</td>
                        {visibleSellers.map((seller) => {
                          const offer = offersBySeller.get(seller);
                          const isCheapest = offer && offer.price === cheapest?.price;
                          return <SellerPriceCell key={seller} offer={offer} baselineOffer={baselineOffer} isBaseline={seller === activeBaselineSeller} isCheapest={isCheapest} />;
                        })}
                        {showCheapest ? <td className="px-4 py-3 text-right font-semibold tabular-nums text-linear-primary">{money(cheapest?.price, cheapest?.currency)}</td> : null}
                        {showMostExpensive ? <td className="px-4 py-3 text-right font-semibold tabular-nums text-linear-ink">{money(mostExpensive?.price, mostExpensive?.currency)}</td> : null}
                        {showDetails ? <td className="px-4 py-3">
                          <button type="button" onClick={() => setSelectedGroup(group)} className="min-h-10 rounded-lg border border-linear-hairline-strong px-3 text-xs font-medium text-linear-ink hover:bg-linear-surface-3">ดูรายละเอียด</button>
                        </td> : null}
                      </tr>
                    </tbody>
                  );
                })}
                {!groups.length ? <tbody><tr><td colSpan={visibleSellers.length + 1 + Number(showCheapest) + Number(showMostExpensive) + Number(showDetails)} className="px-4 py-12 text-center text-linear-ink-tertiary">ไม่พบรายการ</td></tr></tbody> : null}
                  </table>
                </SortableContext>
              </DndContext>
            </div>
          </section>

          {selectedGroup ? (
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onMouseDown={onBackdropMouseDown} className="fixed inset-0 z-50 flex items-center justify-center bg-linear-ink/40 p-4">
              <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5 shadow-[var(--ll-shadow-modal)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div><p className="text-xs text-linear-ink-tertiary">กลุ่มที่ระบบจับคู่</p><h2 id={titleId} className="text-xl font-semibold tracking-[-0.2px] text-linear-ink">{selectedGroup.packLabel || `แพ็ค ${number(selectedGroup.quantity)}`}</h2></div>
                  <button type="button" onClick={() => setSelectedGroup(null)} className="min-h-10 rounded-lg border border-linear-hairline-strong px-3 text-sm text-linear-ink">ปิด</button>
                </div>
                <div className="space-y-3">
                  {selectedGroup.offers.map((offer) => (
                    <article key={offer.itemId} className="grid gap-3 rounded-xl border border-linear-hairline p-4 sm:grid-cols-[64px_minmax(0,1fr)_auto]">
                      {offer.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={offer.imageUrl} alt="" className="h-16 w-16 rounded-lg border border-linear-hairline object-contain" />
                      ) : <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-linear-surface-3 text-linear-ink-tertiary"><ImageIcon size={20} /></span>}
                      <div className="min-w-0">
                        <a href={offer.productUrl} target="_blank" rel="noreferrer" className="font-medium text-linear-ink hover:underline">{offer.title}</a>
                        <p className="mt-1 text-xs text-linear-ink-subtle">Server: {offer.server || "—"} · Stock: {offer.stockText || number(offer.stock)} · Trading volume: {number(offer.tradingVolume)}</p>
                        <p className="mt-1 text-xs text-linear-ink-tertiary">{offer.seller} · {offer.sellerLevel || "Seller"}{offer.promo ? " · PROMO" : ""}</p>
                      </div>
                      <div className="text-right"><p className="font-semibold tabular-nums text-linear-ink">{money(offer.price, offer.currency)}</p><p className="mt-1 text-xs text-linear-ink-tertiary">{offer.unitPrice || "—"}</p></div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function SellerPriceCell({ offer, baselineOffer, isBaseline, isCheapest }) {
  if (!offer) return <td className="bg-linear-surface-2 px-4 py-3 text-right text-linear-ink-tertiary">—</td>;
  const difference = baselineOffer ? offer.price - baselineOffer.price : null;
  const cellTone = isCheapest || difference < 0
    ? "bg-linear-danger-bg"
    : difference > 0
      ? "bg-linear-success-bg"
      : difference === 0 || isBaseline
        ? "bg-linear-surface-3"
        : "bg-linear-surface-2";
  const priceTone = isCheapest || difference < 0
    ? "font-semibold text-linear-primary"
    : difference > 0
      ? "font-semibold text-linear-success"
      : difference == null
        ? "font-medium text-linear-ink-muted"
        : "font-medium text-linear-ink";
  return (
    <td className={`px-4 py-3 text-right tabular-nums ${cellTone}`}>
      <p className={priceTone}>{money(offer.price, offer.currency)}</p>
      {isBaseline ? null : difference == null ? (
        <span className="mt-1 block text-[11px] text-linear-ink-tertiary">ไม่มีราคาอ้างอิง</span>
      ) : difference < 0 ? (
        <span className="mt-1 inline-flex items-center justify-end gap-0.5 text-[11px] font-medium text-linear-danger"><ArrowDown size={12} />ถูกกว่า {money(Math.abs(difference), offer.currency)}</span>
      ) : difference > 0 ? (
        <span className="mt-1 inline-flex items-center justify-end gap-0.5 text-[11px] font-medium text-linear-success"><ArrowUp size={12} />แพงกว่า {money(difference, offer.currency)}</span>
      ) : (
        <span className="mt-1 inline-flex items-center justify-end gap-0.5 text-[11px] text-linear-ink-tertiary"><Minus size={12} />เท่ากัน</span>
      )}
    </td>
  );
}

function SortableSellerHeader({ seller, isBaseline }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: seller });
  return (
    <th
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 }}
      {...attributes}
      {...listeners}
      className={`min-w-40 cursor-grab touch-none px-4 py-3 active:cursor-grabbing ${isBaseline ? "bg-linear-ink text-linear-canvas" : ""}`}
      title="กดค้างแล้วลากเพื่อเปลี่ยนลำดับคอลัมน์"
    >
      <span className="flex items-center justify-end gap-1.5"><GripVertical size={14} aria-hidden="true" />{seller}</span>
    </th>
  );
}
