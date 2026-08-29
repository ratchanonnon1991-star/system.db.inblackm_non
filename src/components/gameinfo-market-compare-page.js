"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, PackageSearch } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
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
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabledMarkets.some((item) => item.market === market)) setMarket(enabledMarkets[0]?.market || "kaleoz");
    setPage(1);
  }, [gameLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!game || !market) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ gameId: String(game.id), mode: dataMode, market, page: String(page), ownOnly: "1" });
      const data = await apiJson(`/api/gameinfo/pack-price-compare?${params}`);
      setComparison(data.comparison);
    } catch (reason) {
      setError(reason.message || "โหลดข้อมูลเทียบราคาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [dataMode, game, market, page]);

  useEffect(() => { load(); }, [load]);
  return (
    <>
      <Card><CardHeader><CardTitle>ราคาแพ็คร้านเรา</CardTitle><CardDescription>แสดงเฉพาะ Pack และราคาที่ดึงได้จากร้านของเราตาม Market ที่ตั้งค่าไว้</CardDescription></CardHeader><CardContent>
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field><FieldLabel>เกม</FieldLabel><Combobox items={gameLabels} value={gameLabel} onValueChange={(value) => setGameLabel(value || "")}><ComboboxInput placeholder="ค้นหาเกม" /><ComboboxContent><ComboboxEmpty>ไม่พบเกม</ComboboxEmpty><ComboboxList>{(item) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox></Field>
          <Field><FieldLabel>Market</FieldLabel><Select items={enabledMarkets.map((item) => ({ value: item.market, label: MARKET_LABELS[item.market] }))} value={market} onValueChange={(value) => { setMarket(value); setPage(1); }} disabled={!enabledMarkets.length}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{enabledMarkets.map((item) => <SelectItem key={item.market} value={item.market}>{MARKET_LABELS[item.market]}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        </FieldGroup>
      </CardContent></Card>
      {error ? <Alert variant="destructive"><AlertTitle>โหลดไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Card><CardHeader><CardTitle>{game?.game || "เลือกเกม"} · {MARKET_LABELS[market]}</CardTitle><CardDescription>แสดงสูงสุด 50 Pack ต่อหน้า และแสดงเฉพาะร้านของเราที่เปิดใช้งาน</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0">
        {loading && !comparison ? <div className="flex flex-col gap-2 p-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-56 w-full" /></div> : comparison?.rows?.length ?
          <Table><TableHeader><TableRow><TableHead className="sticky left-0 bg-muted">Pack</TableHead><TableHead className="text-right">{comparison.priceLabel || "ราคา"}</TableHead>{comparison.sellers.map((seller) => <TableHead key={seller.value} className="min-w-52 text-right">{seller.label}</TableHead>)}</TableRow></TableHeader><TableBody>{comparison.rows.map((row) => <TableRow key={row.packId}><TableCell className="sticky left-0 bg-card"><div className="flex flex-col"><span className="font-medium">{row.packName}</span><span className="text-xs text-muted-foreground">{row.marketPackName}</span></div></TableCell><TableCell className="text-right font-medium tabular-nums">{money(row.price)}</TableCell>{comparison.sellers.map((seller) => { const offer = row.offers.find((item) => item.sellerKey === seller.value); return <TableCell key={seller.value} className="text-right font-medium tabular-nums">{offer ? money(offer.price) : "—"}</TableCell>; })}</TableRow>)}</TableBody></Table> :
          <Empty><EmptyHeader><EmptyMedia variant="icon"><PackageSearch /></EmptyMedia><EmptyTitle>ยังไม่มี Pack ของร้านเรา</EmptyTitle><EmptyDescription>ตั้งค่าร้านของเรา แล้วกด Market Check และ Mapping Pack ก่อน</EmptyDescription></EmptyHeader></Empty>}
      </CardContent>{comparison?.total > comparison?.limit ? <div className="p-4"><Pagination><PaginationContent><PaginationItem><PaginationPrevious href="#" text="ก่อนหน้า" aria-disabled={page <= 1} onClick={(event) => { event.preventDefault(); if (page > 1) setPage(page - 1); }} /></PaginationItem><PaginationItem><PaginationNext href="#" text="ถัดไป" aria-disabled={page * comparison.limit >= comparison.total} onClick={(event) => { event.preventDefault(); if (page * comparison.limit < comparison.total) setPage(page + 1); }} /></PaginationItem></PaginationContent></Pagination></div> : null}</Card>
      <Alert><Database /><AlertTitle>หน้า Compare ไม่เรียก Market สด</AlertTitle><AlertDescription>หากต้องการข้อมูลใหม่ ให้ไปหน้า Market Check แล้วกลับมาหน้านี้</AlertDescription></Alert>
    </>
  );
}
