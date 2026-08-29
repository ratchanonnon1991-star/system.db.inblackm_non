"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, PackageSearch } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const MARKET_ITEMS = [{ value: "all", label: "ทุก Market" }, { value: "kaleoz", label: "Kaleoz" }, { value: "itemku", label: "Itemku" }];
const STATUS_ITEMS = [{ value: "active", label: "กำลังผิดปกติ" }, { value: "resolved", label: "กลับมาปกติ" }, { value: "all", label: "ทั้งหมด" }];
const DIRECTION_ITEMS = [{ value: "all", label: "ทุกประเภท" }, { value: "under", label: "ถูกเกิน" }, { value: "over", label: "แพงเกิน" }, { value: "invalid_base", label: "ราคา GameInfo ผิด" }, { value: "missing", label: "ไม่พบราคา" }];

function money(value) { return value == null ? "—" : Number(value).toLocaleString("th-TH", { maximumFractionDigits: 2 }); }

export default function GameinfoPriceAlertsPage({ games, ownSellers = [], canAcknowledge }) {
  const gameLabels = useMemo(() => ["ทุกเกม", ...games.map((game) => `${game.id} · ${game.game}`)], [games]);
  const gameIdByLabel = useMemo(() => new Map(games.map((game) => [`${game.id} · ${game.game}`, game.id])), [games]);
  const [gameLabel, setGameLabel] = useState("ทุกเกม");
  const [market, setMarket] = useState("all");
  const [status, setStatus] = useState("active");
  const [direction, setDirection] = useState("all");
  const [dataMode, setDataMode] = useState("all");
  const [seller, setSeller] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acknowledge, setAcknowledge] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (market !== "all") params.set("market", market);
      params.set("status", status);
      if (direction !== "all") params.set("direction", direction);
      if (dataMode !== "all") params.set("mode", dataMode);
      if (gameLabel !== "ทุกเกม") params.set("gameId", String(gameIdByLabel.get(gameLabel)));
      if (seller !== "all") params.set("seller", seller);
      const result = await apiJson(`/api/gameinfo/price-alerts?${params}`);
      setData(result.alerts);
    } catch (reason) {
      setError(reason.message || "โหลด Alert ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [dataMode, direction, gameIdByLabel, gameLabel, market, page, seller, status]);
  useEffect(() => { load(); }, [load]);

  async function saveAcknowledge() {
    if (!acknowledge) return;
    setSaving(true);
    setError("");
    try {
      await apiJson("/api/gameinfo/price-alerts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: acknowledge.id, note }) });
      setAcknowledge(null);
      setNote("");
      await load();
    } catch (reason) {
      setError(reason.message || "รับทราบ Alert ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function resetPage(setter) { return (value) => { setter(value); setPage(1); }; }

  return (
    <>
      <Card><CardHeader><CardTitle>Price Alerts</CardTitle><CardDescription>ผิดปกติเมื่อราคาหน้าร้านต่างจากคอลัมน์ “ราคา” ตั้งแต่ 5% ขึ้นไป</CardDescription></CardHeader><CardContent><FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Field><FieldLabel>Market</FieldLabel><Select items={MARKET_ITEMS} value={market} onValueChange={resetPage(setMarket)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{MARKET_ITEMS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel>เกม</FieldLabel><Combobox items={gameLabels} value={gameLabel} onValueChange={(value) => { setGameLabel(value || "ทุกเกม"); setPage(1); }}><ComboboxInput /><ComboboxContent><ComboboxEmpty>ไม่พบเกม</ComboboxEmpty><ComboboxList>{(item) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox></Field>
        <Field><FieldLabel>ชุดข้อมูล</FieldLabel><Select items={[{ value: "all", label: "ทั้งหมด" }, { value: "uid", label: "UID" }, { value: "idpass", label: "IDPASS" }]} value={dataMode} onValueChange={resetPage(setDataMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">ทั้งหมด</SelectItem><SelectItem value="uid">UID</SelectItem><SelectItem value="idpass">IDPASS</SelectItem></SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel>สถานะ</FieldLabel><Select items={STATUS_ITEMS} value={status} onValueChange={resetPage(setStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{STATUS_ITEMS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel>ประเภท</FieldLabel><Select items={DIRECTION_ITEMS} value={direction} onValueChange={resetPage(setDirection)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{DIRECTION_ITEMS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel>ร้านของเรา</FieldLabel><Select value={seller} onValueChange={resetPage(setSeller)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">ทุกร้าน</SelectItem>{ownSellers.filter((item) => item.enabled && (market === "all" || item.market === market)).map((item) => <SelectItem key={`${item.market}:${item.sellerKey}`} value={item.sellerKey}>{item.market} · {item.sellerName}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      </FieldGroup></CardContent></Card>
      {error ? <Alert variant="destructive"><AlertTitle>ดำเนินการไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Card><CardHeader><CardTitle>รายการ {data?.total || 0}</CardTitle><CardDescription>การรับทราบไม่ปิด Alert; ระบบจะปิดอัตโนมัติเมื่อรอบตรวจสำเร็จและราคากลับปกติ</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0">
        {loading && !data ? <div className="flex flex-col gap-2 p-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-48 w-full" /></div> : data?.items?.length ? <Table><TableHeader><TableRow><TableHead>เกม / Pack</TableHead><TableHead>Market / ร้าน</TableHead><TableHead className="text-right">GameInfo</TableHead><TableHead className="text-right">Market</TableHead><TableHead className="text-right">ส่วนต่าง</TableHead><TableHead>สถานะ</TableHead><TableHead /></TableRow></TableHeader><TableBody>{data.items.map((item) => <TableRow key={item.id}><TableCell><div className="flex flex-col"><span className="font-medium">{item.gameName}</span><span className="text-xs text-muted-foreground">{item.packName} · {item.dataMode.toUpperCase()}</span></div></TableCell><TableCell><div className="flex flex-col"><span className="font-medium">{item.market}</span><span className="text-xs text-muted-foreground">{item.sellerName}</span></div></TableCell><TableCell className="text-right tabular-nums">{money(item.basePrice)}</TableCell><TableCell className="text-right tabular-nums">{money(item.marketPrice)}</TableCell><TableCell className="text-right"><div className="flex flex-col items-end"><span className="tabular-nums">{money(item.difference)}</span><span className="text-xs text-muted-foreground">{item.percent == null ? "—" : `${item.percent.toFixed(2)}%`}</span></div></TableCell><TableCell><div className="flex flex-col items-start gap-1"><Badge variant={item.direction === "under" || item.direction === "invalid_base" ? "destructive" : "outline"}>{DIRECTION_ITEMS.find((option) => option.value === item.direction)?.label || item.direction}</Badge><Badge variant="secondary">{item.status}</Badge><Badge variant="outline">Mapping: {item.mappingStatus}</Badge>{item.acknowledgedAt ? <Badge variant="outline"><Check />รับทราบแล้ว</Badge> : null}</div></TableCell><TableCell className="text-right">{canAcknowledge && item.status === "active" ? <Button type="button" size="sm" variant="outline" onClick={() => { setAcknowledge(item); setNote(item.note || ""); }}>รับทราบ</Button> : null}</TableCell></TableRow>)}</TableBody></Table> : <Empty><EmptyHeader><EmptyMedia variant="icon"><PackageSearch /></EmptyMedia><EmptyTitle>ไม่มี Alert ตามตัวกรอง</EmptyTitle><EmptyDescription>ระบบจะแสดงรายการหลัง Scheduled หรือ Manual Check</EmptyDescription></EmptyHeader></Empty>}
      </CardContent>{data?.total > data?.limit ? <div className="p-4"><Pagination><PaginationContent><PaginationItem><PaginationPrevious href="#" text="ก่อนหน้า" aria-disabled={page <= 1} onClick={(event) => { event.preventDefault(); if (page > 1) setPage(page - 1); }} /></PaginationItem><PaginationItem><PaginationNext href="#" text="ถัดไป" aria-disabled={page * data.limit >= data.total} onClick={(event) => { event.preventDefault(); if (page * data.limit < data.total) setPage(page + 1); }} /></PaginationItem></PaginationContent></Pagination></div> : null}</Card>
      <Alert><AlertTriangle /><AlertTitle>ความเสี่ยงหลัก</AlertTitle><AlertDescription>“ถูกเกิน” ใช้สถานะ critical เพราะอาจทำให้ขายขาดทุน ส่วน “แพงเกิน” ใช้ warning เพื่อให้ตรวจสอบ</AlertDescription></Alert>
      <Dialog open={Boolean(acknowledge)} onOpenChange={(next) => { if (!next) setAcknowledge(null); }}><DialogContent><DialogHeader><DialogTitle>รับทราบ Alert</DialogTitle><DialogDescription>บันทึกว่ามีผู้ตรวจแล้ว โดย Alert จะยังเปิดจนราคากลับปกติ</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="alert-note">หมายเหตุ</FieldLabel><Textarea id="alert-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="สาเหตุหรือการดำเนินการ" /></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setAcknowledge(null)}>ยกเลิก</Button><Button type="button" disabled={saving} onClick={saveAcknowledge}>{saving ? "กำลังบันทึก" : "รับทราบ"}</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
}
