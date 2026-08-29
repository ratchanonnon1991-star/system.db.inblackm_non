"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, ListOrdered, PackageSearch, RefreshCw, Trash2, Unlink } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { gameinfoDistinctColorStyleMap } from "@/lib/gameinfo-stable-color";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MARKET_LABELS = { kaleoz: "Kaleoz", itemku: "Itemku" };

export default function GameinfoMarketMappingPage({ games, dataMode, editable }) {
  const gameLabels = useMemo(() => games.map((game) => `${game.id} · ${game.game}`), [games]);
  const gameByLabel = useMemo(() => new Map(games.map((game) => [`${game.id} · ${game.game}`, game])), [games]);
  const firstEnabled = games.find((game) => game.markets.some((market) => market.enabled));
  const [gameLabel, setGameLabel] = useState(firstEnabled ? `${firstEnabled.id} · ${firstEnabled.game}` : gameLabels[0] || "");
  const selectedGame = gameByLabel.get(gameLabel) || null;
  const enabledMarkets = selectedGame?.markets.filter((market) => market.enabled) || [];
  const [market, setMarket] = useState(enabledMarkets[0]?.market || "kaleoz");
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedPackId, setSelectedPackId] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [skippedOrderedPackIds, setSkippedOrderedPackIds] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const current = selectedGame?.markets.find((item) => item.market === market && item.enabled);
    if (!current) setMarket(enabledMarkets[0]?.market || "kaleoz");
    setSelectedPackId("");
    setPage(1);
  }, [gameLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!selectedGame || !market) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ gameId: String(selectedGame.id), mode: dataMode, market, workspace: "1", query, status, page: String(page) });
      const data = await apiJson(`/api/gameinfo/market-mappings?${params}`);
      setWorkspace(data.workspace);
    } catch (reason) {
      setError(reason.message || "โหลด Mapping ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [dataMode, market, page, query, selectedGame, status]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const packs = workspace?.packs || [];
    return {
      mapped: packs.filter((pack) => pack.mapping?.status === "active").length,
      unmapped: packs.filter((pack) => !pack.mapping).length,
      stale: packs.filter((pack) => pack.mapping?.status === "stale").length,
    };
  }, [workspace]);

  const mappingColorStyles = useMemo(() => gameinfoDistinctColorStyleMap(
    (workspace?.packs || []).map((pack) => pack.mapping?.externalPackKey).filter(Boolean)
  ), [workspace]);

  const orderedMappingDraft = useMemo(() => {
    const marketPacks = (workspace?.catalog?.items || []).filter((item) => !item.packId);
    const packs = (workspace?.packs || []).filter((pack) => !pack.mapping).slice(0, marketPacks.length);
    const selectedPacks = packs.filter((pack) => !skippedOrderedPackIds.has(String(pack.id)));
    const pairs = selectedPacks.map((pack, index) => ({
      packId: pack.id,
      packName: pack.name || pack.id,
      externalPackKey: marketPacks[index].externalPackKey,
      marketPackName: marketPacks[index].name,
    }));
    return { packs, pairs };
  }, [skippedOrderedPackIds, workspace]);
  const orderedPairs = orderedMappingDraft.pairs;

  function setOrderedPackSkipped(packId, skipped) {
    setSkippedOrderedPackIds((current) => {
      const next = new Set(current);
      if (skipped) next.add(String(packId));
      else next.delete(String(packId));
      return next;
    });
  }

  function openOrderedMapping() {
    setSkippedOrderedPackIds(new Set());
    setBulkConfirm(true);
  }

  async function saveMapping() {
    if (!confirm || !selectedPackId) return;
    const pack = workspace.packs.find((item) => item.id === selectedPackId);
    setSaving(true);
    setError("");
    try {
      await apiJson("/api/gameinfo/market-mappings", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: selectedGame.id, dataMode, market, packId: selectedPackId, externalPackKey: confirm.externalPackKey, version: pack?.mapping?.version || 0 }),
      });
      setConfirm(null);
      await load();
    } catch (reason) {
      setError(reason.message || "บันทึก Mapping ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function unmap(pack) {
    setError("");
    try {
      await apiJson("/api/gameinfo/market-mappings", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: selectedGame.id, dataMode, market, packId: pack.id, version: pack.mapping.version }),
      });
      if (selectedPackId === pack.id) setSelectedPackId("");
      await load();
    } catch (reason) {
      setError(reason.message || "ยกเลิก Mapping ไม่สำเร็จ");
    }
  }

  async function saveOrderedMappings() {
    if (!orderedPairs.length) return;
    setSaving(true);
    setError("");
    try {
      await apiJson("/api/gameinfo/market-mappings", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: selectedGame.id, dataMode, market, pairs: orderedPairs }),
      });
      setBulkConfirm(false);
      setSelectedPackId("");
      await load();
    } catch (reason) {
      setError(reason.message || "ลิงก์ Mapping ตามลำดับไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function clearMappings() {
    setSaving(true);
    setError("");
    try {
      await apiJson("/api/gameinfo/market-mappings", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: selectedGame.id, dataMode, market, all: true }),
      });
      setClearConfirm(false);
      setSelectedPackId("");
      await load();
    } catch (reason) {
      setError(reason.message || "ล้าง Mapping ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle>เลือกชุด Mapping</CardTitle><CardDescription>เลือกเกม GameInfo และ Market ที่เปิดอยู่ในหน้า Packs</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field><FieldLabel>เกม GameInfo</FieldLabel>
              <Combobox items={gameLabels} value={gameLabel} onValueChange={(value) => setGameLabel(value || "")}>
                <ComboboxInput placeholder="ค้นหาเกม" showClear={false} />
                <ComboboxContent><ComboboxEmpty>ไม่พบเกม</ComboboxEmpty><ComboboxList>{(item) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}</ComboboxList></ComboboxContent>
              </Combobox>
            </Field>
            <Field><FieldLabel>Market</FieldLabel>
              <Select items={enabledMarkets.map((item) => ({ value: item.market, label: MARKET_LABELS[item.market] }))} value={market} onValueChange={(value) => { setMarket(value); setPage(1); }} disabled={!enabledMarkets.length}>
                <SelectTrigger><SelectValue placeholder="ยังไม่ได้เปิด Market" /></SelectTrigger>
                <SelectContent><SelectGroup>{enabledMarkets.map((item) => <SelectItem key={item.market} value={item.market}>{MARKET_LABELS[item.market]}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {!enabledMarkets.length ? <Alert><PackageSearch /><AlertTitle>เกมนี้ยังไม่ได้เปิด Market</AlertTitle><AlertDescription>เปิด Market จากหน้า Packs และเลือกเกมต้นทางก่อนเริ่ม Mapping</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertTitle>ดำเนินการไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Pack ใน GameInfo</CardTitle>
            <CardDescription>เลือก Pack แล้วกดใช้อ้างอิงจาก Catalog ด้านขวา</CardDescription>
            <div className="flex flex-wrap gap-2"><Badge>จับคู่แล้ว {counts.mapped}</Badge><Badge variant="secondary">ยังไม่จับคู่ {counts.unmapped}</Badge>{counts.stale ? <Badge variant="destructive">Stale {counts.stale}</Badge> : null}</div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {loading && !workspace ? <div className="flex flex-col gap-2 p-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-32 w-full" /></div> :
              <Table><TableHeader><TableRow><TableHead>Pack</TableHead><TableHead className="text-right">ราคา</TableHead><TableHead>สถานะ</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>{(workspace?.packs || []).map((pack) => <TableRow key={pack.id} data-state={selectedPackId === pack.id ? "selected" : undefined}>
                  <TableCell className="font-medium">{pack.name || pack.id}</TableCell><TableCell className="text-right tabular-nums">{pack.price || "—"}</TableCell>
                  <TableCell>{pack.mapping ? <Badge variant={pack.mapping.status === "stale" ? "destructive" : "outline"}>{pack.mapping.status}</Badge> : <Badge variant="secondary">ยังไม่จับคู่</Badge>}</TableCell>
                  <TableCell className="text-right"><div className="flex justify-end gap-1"><Button type="button" size="sm" variant={selectedPackId === pack.id ? "default" : "outline"} onClick={() => setSelectedPackId(pack.id)}>เลือก</Button>{editable && pack.mapping ? <Button type="button" size="icon-sm" variant="ghost" className="gameinfo-mapping-color" style={mappingColorStyles.get(pack.mapping.externalPackKey)} aria-label="ยกเลิก Mapping" onClick={() => unmap(pack)}><Unlink /></Button> : null}</div></TableCell>
                </TableRow>)}</TableBody>
              </Table>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Catalog {MARKET_LABELS[market]}</CardTitle><CardDescription>แสดงข้อมูลล่าสุดจากฐานข้อมูล ไม่โหลด Market สดในหน้านี้</CardDescription>
            <div className="flex flex-wrap gap-2"><Badge variant="outline">Market ทั้งหมด {workspace?.catalog?.summary?.total || 0}</Badge><Badge>จับคู่แล้ว {workspace?.catalog?.summary?.mapped || 0}</Badge><Badge variant="secondary">ยังไม่จับคู่ {workspace?.catalog?.summary?.unmapped || 0}</Badge>{workspace?.catalog?.summary?.stale ? <Badge variant="destructive">Stale {workspace.catalog.summary.stale}</Badge> : null}</div>
            {editable ? <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!orderedMappingDraft.packs.length || loading} onClick={openOrderedMapping}><ListOrdered data-icon="inline-start" />ลิงก์ตามลำดับ {orderedMappingDraft.packs.length} รายการ</Button><Button type="button" variant="outline" disabled={!counts.mapped && !counts.stale || loading} onClick={() => setClearConfirm(true)}><Trash2 data-icon="inline-start" />ล้าง Mapping</Button></div> : null}
            <div className="flex flex-wrap gap-2"><Input className="min-w-48 flex-1" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="ค้นหาชื่อ หมวด หรือยอด" /><Button type="button" variant="outline" size="icon" aria-label="โหลดใหม่" onClick={load}><RefreshCw /></Button></div>
            <Tabs value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}><TabsList><TabsTrigger value="all">ทั้งหมด</TabsTrigger><TabsTrigger value="unmapped">ยังไม่จับคู่</TabsTrigger><TabsTrigger value="mapped">จับคู่แล้ว</TabsTrigger><TabsTrigger value="stale">Stale</TabsTrigger></TabsList></Tabs>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {(workspace?.catalog?.items || []).length ? <Table><TableHeader><TableRow><TableHead>Pack Market</TableHead><TableHead>หมวด/ยอด</TableHead><TableHead>สถานะ</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{workspace.catalog.items.map((item) => <TableRow key={item.externalPackKey}><TableCell className="font-medium">{item.name}</TableCell><TableCell><div className="flex flex-col text-sm"><span>{item.category || "—"}</span><span className="text-muted-foreground">{item.amount || "—"}</span></div></TableCell><TableCell><Badge variant={item.packId ? "outline" : "secondary"}>{item.packId ? `ใช้กับ ${item.packId}` : "ว่าง"}</Badge></TableCell><TableCell className="text-right"><Button type="button" size="sm" variant="outline" className={item.packId ? "gameinfo-mapping-color" : undefined} style={item.packId ? mappingColorStyles.get(item.externalPackKey) : undefined} disabled={!editable || !selectedPackId || Boolean(item.packId && workspace.packs.find((pack) => pack.id === selectedPackId)?.mapping?.externalPackKey !== item.externalPackKey)} onClick={() => setConfirm(item)}><Link2 data-icon="inline-start" />ใช้อ้างอิง</Button></TableCell></TableRow>)}</TableBody>
            </Table> : <Empty><EmptyHeader><EmptyMedia variant="icon"><PackageSearch /></EmptyMedia><EmptyTitle>ยังไม่มี Catalog</EmptyTitle><EmptyDescription>กด Market Check เพื่อโหลดข้อมูลล่าสุดก่อนทำ Mapping</EmptyDescription></EmptyHeader></Empty>}
          </CardContent>
          {workspace?.catalog?.total > workspace?.catalog?.limit ? <div className="p-4"><Pagination><PaginationContent><PaginationItem><PaginationPrevious href="#" text="ก่อนหน้า" aria-disabled={page <= 1} onClick={(event) => { event.preventDefault(); if (page > 1) setPage(page - 1); }} /></PaginationItem><PaginationItem><PaginationNext href="#" text="ถัดไป" aria-disabled={page * workspace.catalog.limit >= workspace.catalog.total} onClick={(event) => { event.preventDefault(); if (page * workspace.catalog.limit < workspace.catalog.total) setPage(page + 1); }} /></PaginationItem></PaginationContent></Pagination></div> : null}
        </Card>
      </div>

      <Dialog open={Boolean(confirm)} onOpenChange={(next) => { if (!next) setConfirm(null); }}><DialogContent><DialogHeader><DialogTitle>ยืนยัน Mapping</DialogTitle><DialogDescription>จับคู่ Pack “{workspace?.packs.find((pack) => pack.id === selectedPackId)?.name}” กับ “{confirm?.name}” การเลือกนี้จะถูกจำไว้และใช้ตรวจราคา</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setConfirm(null)}>ยกเลิก</Button><Button type="button" disabled={saving} onClick={saveMapping}>{saving ? "กำลังบันทึก" : "ยืนยัน"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={bulkConfirm} onOpenChange={(next) => { if (!saving) setBulkConfirm(next); }}><DialogContent><DialogHeader><DialogTitle>ยืนยันลิงก์ตามลำดับ</DialogTitle><DialogDescription>เอาเครื่องหมายออกจาก Pack ที่ไม่ต้องการ ระบบจะข้ามรายการนั้นและเลื่อน Pack Market ขึ้นมาจับคู่รายการถัดไป</DialogDescription></DialogHeader><div className="max-h-64 overflow-y-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead className="w-12">ใช้</TableHead><TableHead>GameInfo</TableHead><TableHead>Market</TableHead></TableRow></TableHeader><TableBody>{orderedMappingDraft.packs.map((pack) => {
        const skipped = skippedOrderedPackIds.has(String(pack.id));
        const pair = orderedPairs.find((item) => String(item.packId) === String(pack.id));
        return <TableRow key={pack.id} className={skipped ? "text-muted-foreground" : undefined}><TableCell><Checkbox checked={!skipped} disabled={saving} aria-label={`ใช้ ${pack.name || pack.id} ในการ Mapping`} onCheckedChange={(checked) => setOrderedPackSkipped(pack.id, !checked)} /></TableCell><TableCell>{pack.name || pack.id}</TableCell><TableCell>{skipped ? <Badge variant="secondary">ข้าม</Badge> : pair?.marketPackName || "—"}</TableCell></TableRow>;
      })}</TableBody></Table></div><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setBulkConfirm(false)}>ยกเลิก</Button><Button type="button" disabled={saving || !orderedPairs.length} onClick={saveOrderedMappings}>{saving ? "กำลังลิงก์" : `ยืนยัน ${orderedPairs.length} รายการ`}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={clearConfirm} onOpenChange={(next) => { if (!saving) setClearConfirm(next); }}><DialogContent><DialogHeader><DialogTitle>ล้าง Mapping ทั้งหมด?</DialogTitle><DialogDescription>Mapping ของเกมนี้ใน {MARKET_LABELS[market]} จำนวน {counts.mapped + counts.stale} รายการจะถูกล้าง หลังจากนั้นสามารถ Mapping ใหม่ได้</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setClearConfirm(false)}>ยกเลิก</Button><Button type="button" variant="destructive" disabled={saving} onClick={clearMappings}>{saving ? "กำลังล้าง" : "ล้างทั้งหมด"}</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
}
