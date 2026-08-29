"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Database, PackageSearch } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

export default function GameinfoMarketComparePage({ games, dataMode, initialMarket = "", initialExternalGame = "" }) {
  const gameLabels = useMemo(() => games.map((game) => `${game.id} · ${game.game}`), [games]);
  const gameByLabel = useMemo(() => new Map(games.map((game) => [`${game.id} · ${game.game}`, game])), [games]);
  const initialGame = games.find((game) => game.markets.some((item) => item.enabled && (!initialMarket || item.market === initialMarket) && (!initialExternalGame || item.externalGameKey === initialExternalGame)));
  const firstEnabled = initialGame || games.find((game) => game.markets.some((item) => item.enabled));
  const [gameLabel, setGameLabel] = useState(firstEnabled ? `${firstEnabled.id} · ${firstEnabled.game}` : gameLabels[0] || "");
  const game = gameByLabel.get(gameLabel) || null;
  const enabledMarkets = game?.markets.filter((item) => item.enabled) || [];
  const [market, setMarket] = useState(enabledMarkets.some((item) => item.market === initialMarket) ? initialMarket : enabledMarkets[0]?.market || "kaleoz");
  const [comparison, setComparison] = useState(null);
  const [selectedSellers, setSelectedSellers] = useState([]);
  const [showAllSellers, setShowAllSellers] = useState(false);
  const [baselineSeller, setBaselineSeller] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabledMarkets.some((item) => item.market === market)) setMarket(enabledMarkets[0]?.market || "kaleoz");
    setSelectedSellers([]);
    setShowAllSellers(false);
    setBaselineSeller("");
    setPage(1);
  }, [gameLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!game || !market) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ gameId: String(game.id), mode: dataMode, market, page: String(page) });
      if (showAllSellers) params.set("allSellers", "1");
      else selectedSellers.forEach((seller) => params.append("seller", seller));
      const data = await apiJson(`/api/gameinfo/pack-price-compare?${params}`);
      setComparison(data.comparison);
    } catch (reason) {
      setError(reason.message || "โหลดข้อมูลเทียบราคาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [dataMode, game, market, page, selectedSellers, showAllSellers]);

  useEffect(() => { load(); }, [load]);
  const displayedSellerKeys = comparison?.sellers?.map((seller) => seller.value) || [];
  const baselineItems = (comparison?.sellers || []).map((seller) => ({ value: seller.value, label: `${seller.label}${seller.own ? " · ร้านเรา" : ""}` }));
  const defaultBaseline = comparison?.sellers?.find((seller) => seller.own)?.value || comparison?.sellers?.[0]?.value || "";
  const activeBaseline = displayedSellerKeys.includes(baselineSeller) ? baselineSeller : defaultBaseline;

  function toggleSeller(sellerKey, checked) {
    const current = showAllSellers || !selectedSellers.length ? displayedSellerKeys : selectedSellers;
    setShowAllSellers(false);
    setSelectedSellers(checked ? [...new Set([...current, sellerKey])] : current.filter((key) => key !== sellerKey));
    setPage(1);
  }

  return (
    <>
      <Card><CardHeader><CardTitle>เทียบราคาแพ็ค</CardTitle><CardDescription>ข้อมูลจาก Catalog ล่าสุดในฐานข้อมูล; คอลัมน์ราคาอ่านจาก GameInfo ปัจจุบัน</CardDescription></CardHeader><CardContent>
        <FieldGroup className="grid gap-4 md:grid-cols-3">
          <Field><FieldLabel>เกม</FieldLabel><Combobox items={gameLabels} value={gameLabel} onValueChange={(value) => setGameLabel(value || "")}><ComboboxInput placeholder="ค้นหาเกม" /><ComboboxContent><ComboboxEmpty>ไม่พบเกม</ComboboxEmpty><ComboboxList>{(item) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox></Field>
          <Field><FieldLabel>Market</FieldLabel><Select items={enabledMarkets.map((item) => ({ value: item.market, label: MARKET_LABELS[item.market] }))} value={market} onValueChange={(value) => { setMarket(value); setPage(1); setSelectedSellers([]); setShowAllSellers(false); setBaselineSeller(""); }} disabled={!enabledMarkets.length}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{enabledMarkets.map((item) => <SelectItem key={item.market} value={item.market}>{MARKET_LABELS[item.market]}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <Field><FieldLabel>ร้านอ้างอิงชั่วคราว</FieldLabel><Select items={baselineItems} value={activeBaseline || null} onValueChange={(value) => setBaselineSeller(value)} disabled={!baselineItems.length}><SelectTrigger><SelectValue placeholder="ยังไม่มีร้าน" /></SelectTrigger><SelectContent><SelectGroup>{baselineItems.map((seller) => <SelectItem key={seller.value} value={seller.value}>{seller.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        </FieldGroup>
      </CardContent></Card>
      {error ? <Alert variant="destructive"><AlertTitle>โหลดไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{game?.game || "เลือกเกม"} · {MARKET_LABELS[market]}</CardTitle><CardDescription>แสดง 5 ร้านแรกตาม coverage · เปลี่ยนร้านอ้างอิงได้ชั่วคราวโดยไม่บันทึก</CardDescription></div><DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="outline" />}><Columns3 data-icon="inline-start" />ร้านที่แสดง {comparison?.sellers?.length || 0}/{comparison?.availableSellers?.length || 0}</DropdownMenuTrigger><DropdownMenuContent align="end" className="w-72"><DropdownMenuLabel>เลือกร้านที่ต้องการเทียบ</DropdownMenuLabel>{(comparison?.availableSellers || []).map((seller) => <DropdownMenuCheckboxItem key={seller.value} checked={displayedSellerKeys.includes(seller.value)} disabled={seller.own} onCheckedChange={(checked) => toggleSeller(seller.value, checked)} closeOnClick={false}>{seller.label}{seller.own ? " · ร้านเรา" : ""}</DropdownMenuCheckboxItem>)}<DropdownMenuSeparator /><div className="flex gap-2 p-1"><Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => { setShowAllSellers(true); setSelectedSellers([]); setPage(1); }}>เปิดทั้งหมด</Button><Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => { setShowAllSellers(false); setSelectedSellers([]); setBaselineSeller(""); setPage(1); }}>กลับค่าเริ่มต้น</Button></div></DropdownMenuContent></DropdownMenu></div></CardHeader><CardContent className="overflow-x-auto p-0">
        {loading && !comparison ? <div className="flex flex-col gap-2 p-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-56 w-full" /></div> : comparison?.rows?.length ?
          <Table><TableHeader><TableRow><TableHead className="sticky left-0 bg-muted">Pack</TableHead><TableHead className="text-right">{comparison.priceLabel || "ราคา Market"}</TableHead>{comparison.sellers.map((seller) => <TableHead key={seller.value} className="min-w-52 text-right">{seller.label}{seller.own ? <Badge className="ml-2" variant="outline">ร้านเรา</Badge> : null}{seller.value === activeBaseline ? <Badge className="ml-2" variant="secondary">อ้างอิง</Badge> : null}</TableHead>)}</TableRow></TableHeader><TableBody>{comparison.rows.map((row) => { const baselineOffer = row.offers.find((item) => item.sellerKey === activeBaseline); return <TableRow key={row.packId}><TableCell className="sticky left-0 bg-card"><div className="flex flex-col"><span className="font-medium">{row.packName}</span><span className="text-xs text-muted-foreground">{row.marketPackName}</span></div></TableCell><TableCell className="text-right font-medium tabular-nums">{money(row.price)}</TableCell>{comparison.sellers.map((seller) => { const offer = row.offers.find((item) => item.sellerKey === seller.value); return <TableCell key={seller.value} className="text-right"><div className="flex flex-col items-end gap-1"><span className="font-medium tabular-nums">{offer ? money(offer.price) : "—"}</span>{!offer ? <Badge variant="secondary">ไม่มีราคา</Badge> : seller.value === activeBaseline ? <Badge variant="secondary">ราคาอ้างอิง</Badge> : <Difference base={baselineOffer?.price} value={offer.price} />}</div></TableCell>; })}</TableRow>; })}</TableBody></Table> :
          <Empty><EmptyHeader><EmptyMedia variant="icon"><PackageSearch /></EmptyMedia><EmptyTitle>ยังไม่มี Pack ที่ Mapping</EmptyTitle><EmptyDescription>ทำ Mapping และ Market Check ก่อนเปิดหน้าเทียบราคา</EmptyDescription></EmptyHeader></Empty>}
      </CardContent>{comparison?.total > comparison?.limit ? <div className="p-4"><Pagination><PaginationContent><PaginationItem><PaginationPrevious href="#" text="ก่อนหน้า" aria-disabled={page <= 1} onClick={(event) => { event.preventDefault(); if (page > 1) setPage(page - 1); }} /></PaginationItem><PaginationItem><PaginationNext href="#" text="ถัดไป" aria-disabled={page * comparison.limit >= comparison.total} onClick={(event) => { event.preventDefault(); if (page * comparison.limit < comparison.total) setPage(page + 1); }} /></PaginationItem></PaginationContent></Pagination></div> : null}</Card>
      <Alert><Database /><AlertTitle>หน้า Compare ไม่เรียก Market สด</AlertTitle><AlertDescription>หากต้องการข้อมูลใหม่ ให้ไปหน้า Market Check แล้วกลับมาหน้านี้</AlertDescription></Alert>
    </>
  );
}
