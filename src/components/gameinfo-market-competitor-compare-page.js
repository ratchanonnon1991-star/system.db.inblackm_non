"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Database, ExternalLink, ListTree, PackageSearch, Search } from "lucide-react";
import { gameinfoMarketPackDisplayName } from "@/lib/gameinfo-market-system";
import { apiJson } from "@/lib/api-json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const MARKET_LABELS = { kaleoz: "Kaleoz", itemku: "Itemku" };

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : "—";
}

function Difference({ base, value }) {
  const difference = Number(value) - Number(base);
  if (!Number.isFinite(difference) || !Number.isFinite(Number(base)) || Number(base) <= 0) return <Badge variant="secondary">เทียบไม่ได้</Badge>;
  const percent = Math.abs(difference) / Number(base) * 100;
  if (difference < 0) return <Badge variant={percent >= 5 ? "destructive" : "outline"}><ArrowDown />ถูกกว่า {money(Math.abs(difference))} ({percent.toFixed(2)}%)</Badge>;
  if (difference > 0) return <Badge variant="outline"><ArrowUp />แพงกว่า {money(difference)} ({percent.toFixed(2)}%)</Badge>;
  return <Badge variant="secondary">เท่ากัน</Badge>;
}

function MetricCard({ label, value, description }) {
  return <Card size="sm"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl tabular-nums">{value}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">{description}</CardContent></Card>;
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

function offerDetail(offer) {
  const metadata = offer?.metadata || {};
  return [
    metadata.unitPrice ? `ราคาต่อหน่วย ${metadata.unitPrice}` : "",
    metadata.stockText ? `Stock ${metadata.stockText}` : metadata.stock != null ? `Stock ${money(metadata.stock)}` : "",
    metadata.tradingVolume != null ? `ยอดขาย ${money(metadata.tradingVolume)}` : metadata.sold != null ? `ขายแล้ว ${money(metadata.sold)}` : "",
    metadata.rating != null ? `Rating ${money(metadata.rating)}` : "",
    metadata.delivery ? `ส่ง ${metadata.delivery}` : "",
  ].filter(Boolean).join(" · ");
}

function SellerOfferCell({ offer, baselinePrice, isBaseline }) {
  if (!offer) return <TableCell className="text-right"><Badge variant="secondary">ไม่มีราคา</Badge></TableCell>;
  const metadata = offer.metadata || {};
  return <TableCell className="text-right"><Tooltip><TooltipTrigger render={<button type="button" className="inline-flex flex-col items-end gap-1 rounded-md text-right outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />}><span className="font-medium tabular-nums">{money(offer.price)}</span>{!isBaseline ? <Difference base={baselinePrice} value={offer.price} /> : null}</TooltipTrigger><TooltipContent><div className="flex flex-col gap-1"><p className="font-medium tabular-nums">{metadata.unitPrice || "—"}</p><p>Stock: {metadata.stockText || (metadata.stock != null ? money(metadata.stock) : "—")}</p><p>Trading volume: {metadata.tradingVolume != null ? money(metadata.tradingVolume) : "—"}</p><p>ตรวจล่าสุด: {dateTime(offer.fetchedAt)}</p></div></TooltipContent></Tooltip></TableCell>;
}

function PackSourceDialog({ row, source, loading, error, onOpenChange }) {
  return <Dialog open={Boolean(row)} onOpenChange={onOpenChange}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{row?.packName || "ตรวจ Pack ต้นทาง"}</DialogTitle><DialogDescription>Pack GameInfo นี้จับคู่มาจากรายการใดใน Market และมี Offer จาก Seller ใดบ้าง</DialogDescription></DialogHeader>{loading ? <div className="flex flex-col gap-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : error ? <Alert variant="destructive"><AlertTitle>โหลดต้นทางไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : source ? <div className="flex flex-col gap-3"><Card size="sm"><CardHeader><CardTitle>{source.name}</CardTitle><CardDescription>{[source.category, source.amount].filter(Boolean).join(" · ") || "ไม่มีหมวด/ยอด"}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Badge variant="outline">Pack key: {source.externalPackKey}</Badge>{source.listingId ? <Badge variant="secondary">Listing: {source.listingId}</Badge> : null}<Badge variant="secondary">ล่าสุด {dateTime(source.lastSeenAt)}</Badge></CardContent></Card>{source.offers.map((offer) => <Card key={`${offer.sellerKey}:${offer.listingId}`} size="sm"><CardContent className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="min-w-0"><p className="font-medium">{offer.sellerName}</p><p className="truncate text-xs text-muted-foreground">{offer.listingId || "ไม่มี Listing ID"}</p>{offerDetail(offer) ? <p className="mt-1 text-xs text-muted-foreground">{offerDetail(offer)}</p> : null}</div><div className="flex shrink-0 items-center gap-2 sm:justify-end"><span className="font-semibold tabular-nums">{money(offer.price)} {offer.currency}</span>{offer.productUrl ? <Button variant="outline" size="sm" nativeButton={false} render={<a href={offer.productUrl} target="_blank" rel="noreferrer" />}><ExternalLink data-icon="inline-start" />เปิดรายการ</Button> : null}</div></CardContent></Card>)}{!source.offers.length ? <Empty><EmptyHeader><EmptyMedia variant="icon"><PackageSearch /></EmptyMedia><EmptyTitle>ไม่มี Offer ล่าสุด</EmptyTitle><EmptyDescription>ลองทำ Market Check แล้วเปิดดูอีกครั้ง</EmptyDescription></EmptyHeader></Empty> : null}</div> : null}</DialogContent></Dialog>;
}

export default function GameinfoMarketCompetitorComparePage({ games, dataMode, initialMarket = "", initialExternalGame = "" }) {
  const gameLabels = useMemo(() => games.map((game) => `${game.id} · ${game.game}`), [games]);
  const gameByLabel = useMemo(() => new Map(games.map((game) => [`${game.id} · ${game.game}`, game])), [games]);
  const initialGame = games.find((game) => game.markets.some((item) => item.enabled && (!initialMarket || item.market === initialMarket) && (!initialExternalGame || item.externalGameKey === initialExternalGame)));
  const firstEnabled = initialGame || games.find((game) => game.markets.some((item) => item.enabled));
  const [gameLabel, setGameLabel] = useState(firstEnabled ? `${firstEnabled.id} · ${firstEnabled.game}` : gameLabels[0] || "");
  const game = gameByLabel.get(gameLabel) || null;
  const enabledMarkets = game?.markets.filter((item) => item.enabled) || [];
  const [market, setMarket] = useState(enabledMarkets.some((item) => item.market === initialMarket) ? initialMarket : enabledMarkets[0]?.market || "kaleoz");
  const [comparison, setComparison] = useState(null);
  const [selectedSellers, setSelectedSellers] = useState(null);
  const [baselineSeller, setBaselineSeller] = useState("");
  const [sellerQuery, setSellerQuery] = useState("");
  const [query, setQuery] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sourceRow, setSourceRow] = useState(null);
  const [sourceDetail, setSourceDetail] = useState(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const paintCheckedRef = useRef(null);
  const skipNextCheckedChangeRef = useRef(false);

  function resetView() {
    setSelectedSellers(null);
    setBaselineSeller("");
    setSellerQuery("");
    setQuery("");
    setPriceFilter("all");
    setPage(1);
    setSourceRow(null);
    setSourceDetail(null);
    setSourceError("");
  }

  useEffect(() => {
    if (!game?.id || !market) return;
    let ignore = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ gameId: String(game.id), mode: dataMode, market, page: String(page), competitors: selectedSellers === null ? "1" : "0" });
        (selectedSellers || []).forEach((seller) => params.append("seller", seller));
        const data = await apiJson(`/api/gameinfo/pack-price-compare?${params}`);
        if (!ignore) setComparison(data.comparison);
      } catch (reason) {
        if (!ignore) setError(reason.message || "โหลดข้อมูลเทียบคู่แข่งไม่สำเร็จ");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    const timer = setTimeout(load, selectedSellers === null ? 0 : 120);
    return () => { ignore = true; clearTimeout(timer); };
  }, [dataMode, game?.id, market, page, selectedSellers]);

  const displayedSellerKeys = comparison?.sellers?.map((seller) => seller.value) || [];
  const ownSellerKeys = (comparison?.availableSellers || []).filter((seller) => seller.own).map((seller) => seller.value);
  const selectedSellerKeys = selectedSellers === null ? displayedSellerKeys : [...new Set([...ownSellerKeys, ...selectedSellers])];
  const selectedSellerKeySet = new Set(selectedSellerKeys);
  const normalizedSellerQuery = sellerQuery.trim().toLocaleLowerCase("th");
  const menuSellers = (comparison?.availableSellers || []).filter((seller) => !normalizedSellerQuery || seller.label.toLocaleLowerCase("th").includes(normalizedSellerQuery));
  const defaultBaseline = comparison?.sellers?.find((seller) => seller.own)?.value || comparison?.sellers?.[0]?.value || "";
  const activeBaseline = displayedSellerKeys.includes(baselineSeller) ? baselineSeller : defaultBaseline;
  const baselineItems = (comparison?.sellers || []).map((seller) => ({ value: seller.value, label: seller.label }));
  const rows = comparison?.rows || [];
  const needle = query.trim().toLocaleLowerCase();
  const filteredRows = rows.filter((row) => `${row.packName} ${row.marketPackName}`.toLocaleLowerCase().includes(needle));
  const orderedSellers = [...(comparison?.sellers || [])].sort((left, right) => Number(right.value === activeBaseline) - Number(left.value === activeBaseline));
  const visibleSellers = orderedSellers.filter((seller) => {
    if (priceFilter === "all" || seller.value === activeBaseline) return true;
    return rows.some((row) => {
      const baseline = row.offers.find((offer) => offer.sellerKey === activeBaseline)?.price;
      const current = row.offers.find((offer) => offer.sellerKey === seller.value)?.price;
      if (!Number.isFinite(Number(baseline)) || !Number.isFinite(Number(current))) return false;
      return priceFilter === "expensive" ? Number(current) > Number(baseline) : Number(current) < Number(baseline);
    });
  });
  const summary = rows.reduce((result, row) => {
    const baseline = row.offers.find((offer) => offer.sellerKey === activeBaseline)?.price;
    const competitors = row.offers.filter((offer) => offer.sellerKey !== activeBaseline).map((offer) => Number(offer.price)).filter(Number.isFinite);
    if (!Number.isFinite(Number(baseline)) || !competitors.length) return result;
    result.comparable += 1;
    const lowest = Math.min(...competitors);
    if (Number(baseline) > lowest) result.expensive += 1;
    else if (Number(baseline) < lowest) result.cheaper += 1;
    return result;
  }, { comparable: 0, expensive: 0, cheaper: 0 });

  function selectGame(value) {
    const nextLabel = value || "";
    const nextGame = gameByLabel.get(nextLabel);
    setGameLabel(nextLabel);
    setMarket(nextGame?.markets.find((item) => item.enabled)?.market || "kaleoz");
    setComparison(null);
    resetView();
  }

  function setSellerChecked(sellerKey, checked) {
    const ownSet = new Set(ownSellerKeys);
    if (ownSet.has(sellerKey)) return;
    setSelectedSellers((currentSelection) => {
      const current = (currentSelection === null ? displayedSellerKeys : currentSelection).filter((key) => !ownSet.has(key));
      if (current.includes(sellerKey) === checked) return currentSelection;
      return checked ? [...current, sellerKey] : current.filter((key) => key !== sellerKey);
    });
    setPage(1);
  }

  function startSellerPaint(sellerKey) {
    paintCheckedRef.current = !selectedSellerKeySet.has(sellerKey);
    skipNextCheckedChangeRef.current = true;
    setSellerChecked(sellerKey, paintCheckedRef.current);
  }

  function paintSeller(sellerKey, event) {
    if (paintCheckedRef.current === null || !event.buttons) return;
    setSellerChecked(sellerKey, paintCheckedRef.current);
  }

  function toggleSellerFromCheckbox(sellerKey, checked) {
    if (skipNextCheckedChangeRef.current) {
      skipNextCheckedChangeRef.current = false;
      return;
    }
    setSellerChecked(sellerKey, checked);
  }

  function selectAllSellers() {
    setSelectedSellers((comparison?.availableSellers || []).filter((seller) => !seller.own).map((seller) => seller.value));
    setPage(1);
  }

  function clearSellers() {
    setSelectedSellers([]);
    setPage(1);
  }

  async function openSource(row) {
    setSourceRow(row);
    setSourceDetail(null);
    setSourceError("");
    setSourceLoading(true);
    try {
      const params = new URLSearchParams({
        externalGameKey: comparison?.config?.externalGameKey || "",
        externalPackKey: row.externalPackKey,
      });
      const data = await apiJson(`/api/gameinfo/markets/${market}/catalog?${params}`);
      setSourceDetail(data.source);
    } catch (reason) {
      setSourceError(reason.message || "โหลด Pack ต้นทางไม่สำเร็จ");
    } finally {
      setSourceLoading(false);
    }
  }

  return (
    <TooltipProvider><>
      <Card><CardHeader><CardTitle>เทียบราคากับร้านอื่น</CardTitle><CardDescription>รูปแบบการเทียบแบบเดิม แต่ใช้ Catalog ล่าสุดจากฐานข้อมูลและโหลดเฉพาะข้อมูลที่เปิดดู</CardDescription></CardHeader><CardContent><FieldGroup className="grid gap-4 md:grid-cols-3">
        <Field><FieldLabel>เกม</FieldLabel><Combobox items={gameLabels} value={gameLabel} onValueChange={selectGame}><ComboboxInput placeholder="ค้นหาเกม" /><ComboboxContent><ComboboxEmpty>ไม่พบเกม</ComboboxEmpty><ComboboxList>{(item) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox></Field>
        <Field><FieldLabel>Market</FieldLabel><Select items={enabledMarkets.map((item) => ({ value: item.market, label: MARKET_LABELS[item.market] }))} value={market} onValueChange={(value) => { setMarket(value); setComparison(null); resetView(); }} disabled={!enabledMarkets.length}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{enabledMarkets.map((item) => <SelectItem key={item.market} value={item.market}>{MARKET_LABELS[item.market]}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel>ร้านอ้างอิง</FieldLabel><Select items={baselineItems} value={activeBaseline || null} onValueChange={setBaselineSeller} disabled={!baselineItems.length}><SelectTrigger><SelectValue placeholder="ยังไม่มีร้าน" /></SelectTrigger><SelectContent><SelectGroup>{baselineItems.map((seller) => <SelectItem key={seller.value} value={seller.value}>{seller.label}</SelectItem>)}</SelectGroup></SelectContent></Select><p className="text-xs text-muted-foreground">ใช้ร้านของเราที่ตั้งไว้เป็นค่าเริ่มต้น</p></Field>
      </FieldGroup></CardContent></Card>

      {error ? <Alert variant="destructive"><AlertTitle>โหลดไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pack ที่ Mapping" value={comparison?.total || 0} description={`หน้า ${page} · สูงสุด 50 Pack`} />
        <MetricCard label="Seller ที่พบ" value={comparison?.availableSellers?.length || 0} description={`โหลดอยู่ ${comparison?.sellers?.length || 0} ร้าน`} />
        <MetricCard label="ร้านอ้างอิงแพงกว่า" value={summary.expensive} description={`จาก ${summary.comparable} Pack ที่เทียบได้`} />
        <MetricCard label="ร้านอ้างอิงถูกกว่า" value={summary.cheaper} description={`จาก ${summary.comparable} Pack ที่เทียบได้`} />
      </div>

      <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{game?.game || "เลือกเกม"} · {MARKET_LABELS[market]}</CardTitle><CardDescription>เริ่มต้นแสดง 12 ร้านเพื่อความลื่น และเลือกเพิ่มได้จากรายการ Seller</CardDescription></div><DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="outline" />}><Columns3 data-icon="inline-start" />เลือก Seller {selectedSellerKeys.length}/{comparison?.availableSellers?.length || 0}</DropdownMenuTrigger><DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto"><div className="flex gap-1 p-1"><Button type="button" variant="outline" size="sm" className="flex-1" onClick={selectAllSellers}>เลือกทั้งหมด</Button><Button type="button" variant="outline" size="sm" className="flex-1" onClick={clearSellers}>ล้าง</Button></div><DropdownMenuSeparator /><div className="p-1"><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput type="search" value={sellerQuery} onChange={(event) => setSellerQuery(event.target.value)} onKeyDown={(event) => event.stopPropagation()} placeholder="ค้นหา Seller" aria-label="ค้นหา Seller" /></InputGroup></div><DropdownMenuGroup><DropdownMenuLabel>เลือกแล้ว {selectedSellerKeys.length} ร้าน · กดค้างแล้วลากเพื่อเลือกหลายรายการ</DropdownMenuLabel>{menuSellers.map((seller) => <DropdownMenuCheckboxItem key={seller.value} checked={selectedSellerKeySet.has(seller.value)} disabled={seller.own} onCheckedChange={(checked) => toggleSellerFromCheckbox(seller.value, checked)} onPointerDown={() => startSellerPaint(seller.value)} onPointerEnter={(event) => paintSeller(seller.value, event)} closeOnClick={false}>{seller.label}{seller.own ? "" : ` · ${seller.coverage} Pack`}</DropdownMenuCheckboxItem>)}{!menuSellers.length ? <DropdownMenuLabel>ไม่พบ Seller ที่ตรงกับคำค้นหา</DropdownMenuLabel> : null}</DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem onClick={() => { setSelectedSellers(null); setBaselineSeller(""); setPage(1); }}>กลับค่าเริ่มต้น</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></div></CardHeader><CardContent className="flex flex-col gap-4 p-0">
        <div className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between"><Field className="max-w-md"><FieldLabel htmlFor="competitor-pack-search" className="sr-only">ค้นหาชื่อ Pack</FieldLabel><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput id="competitor-pack-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อ Pack" /></InputGroup></Field><Tabs value={priceFilter} onValueChange={setPriceFilter}><TabsList aria-label="กรอง Seller ตามราคาอ้างอิง"><TabsTrigger value="all">ทุกร้าน</TabsTrigger><TabsTrigger value="expensive"><ArrowUp />แพงกว่า</TabsTrigger><TabsTrigger value="cheaper"><ArrowDown />ถูกกว่า</TabsTrigger></TabsList></Tabs></div>
        {loading && !comparison ? <div className="flex flex-col gap-2 p-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-56 w-full" /></div> : rows.length ? <Table containerClassName="max-h-[37.5rem] overflow-auto"><TableHeader><TableRow><TableHead className="sticky left-0 bg-muted">Pack</TableHead><TableHead className="min-w-32 text-right">{comparison.priceLabel || "ราคา"}</TableHead>{visibleSellers.map((seller) => <TableHead key={seller.value} className={cn("min-w-52 text-right", seller.value === activeBaseline && "bg-linear-surface-4 text-white")}>{seller.label}</TableHead>)}<TableHead className="min-w-32 text-right">ต่ำสุด</TableHead><TableHead className="min-w-32 text-right">สูงสุด</TableHead><TableHead className="min-w-32">ตรวจต้นทาง</TableHead></TableRow></TableHeader><TableBody>{filteredRows.map((row) => { const baselineOffer = row.offers.find((offer) => offer.sellerKey === activeBaseline); const prices = row.offers.map((offer) => Number(offer.price)).filter(Number.isFinite); return <TableRow key={row.packId}><TableCell className="sticky left-0 bg-card"><div className="flex max-w-[18rem] flex-col"><span className="truncate font-medium" title={row.packName}>{row.packName}</span><span className="truncate text-xs text-muted-foreground" title={row.marketPackName}>{gameinfoMarketPackDisplayName(row.marketPackName)}</span></div></TableCell><TableCell className="text-right font-medium tabular-nums">{money(row.price)}</TableCell>{visibleSellers.map((seller) => <SellerOfferCell key={seller.value} offer={row.offers.find((item) => item.sellerKey === seller.value)} baselinePrice={baselineOffer?.price} isBaseline={seller.value === activeBaseline} />)}<TableCell className="text-right tabular-nums">{prices.length ? money(Math.min(...prices)) : "—"}</TableCell><TableCell className="text-right tabular-nums">{prices.length ? money(Math.max(...prices)) : "—"}</TableCell><TableCell><Button type="button" variant="outline" size="sm" onClick={() => openSource(row)}><ListTree data-icon="inline-start" />ดูรายการ</Button></TableCell></TableRow>; })}{!filteredRows.length ? <TableRow><TableCell colSpan={visibleSellers.length + 5}><Empty><EmptyHeader><EmptyMedia variant="icon"><Search /></EmptyMedia><EmptyTitle>ไม่พบ Pack</EmptyTitle><EmptyDescription>ลองเปลี่ยนคำค้นหา</EmptyDescription></EmptyHeader></Empty></TableCell></TableRow> : null}</TableBody></Table> : <Empty><EmptyHeader><EmptyMedia variant="icon"><PackageSearch /></EmptyMedia><EmptyTitle>ยังไม่มี Pack ที่ Mapping</EmptyTitle><EmptyDescription>ทำ Mapping และ Market Check ก่อนเปิดหน้านี้</EmptyDescription></EmptyHeader></Empty>}
      </CardContent>{comparison?.total > comparison?.limit ? <div className="p-4"><Pagination><PaginationContent><PaginationItem><PaginationPrevious href="#" text="ก่อนหน้า" aria-disabled={page <= 1} onClick={(event) => { event.preventDefault(); if (page > 1) setPage(page - 1); }} /></PaginationItem><PaginationItem><PaginationNext href="#" text="ถัดไป" aria-disabled={page * comparison.limit >= comparison.total} onClick={(event) => { event.preventDefault(); if (page * comparison.limit < comparison.total) setPage(page + 1); }} /></PaginationItem></PaginationContent></Pagination></div> : null}</Card>

      <PackSourceDialog row={sourceRow} source={sourceDetail} loading={sourceLoading} error={sourceError} onOpenChange={(open) => { if (!open) { setSourceRow(null); setSourceDetail(null); setSourceError(""); } }} />
      <Alert><Database /><AlertTitle>โหลดจากฐานข้อมูลเท่านั้น</AlertTitle><AlertDescription>หน้านี้ไม่เรียก Market สด หากต้องการข้อมูลใหม่ให้กด Market Check ก่อน</AlertDescription></Alert>
    </></TooltipProvider>
  );
}
