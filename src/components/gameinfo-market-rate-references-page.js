"use client";

import { useMemo, useState } from "react";
import { Clock3, Plus, Save, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function localDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function GameinfoMarketRateReferencesPage({ initialMarkets, canManage }) {
  const [markets, setMarkets] = useState(initialMarkets);
  const [addGames, setAddGames] = useState(() => Object.fromEntries(initialMarkets.map((market) => [market.key, market.games.find((game) => !market.references.some((item) => item.externalGameKey === game.value))?.value || ""])));
  const [addTimes, setAddTimes] = useState(() => Object.fromEntries(initialMarkets.map((market) => [market.key, localDateTime()])));
  const [drafts, setDrafts] = useState(() => Object.fromEntries(initialMarkets.flatMap((market) => market.references.map((reference) => [`${market.key}:${reference.externalGameKey}`, localDateTime(reference.referenceAt)]))));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [deletePrompt, setDeletePrompt] = useState(null);
  const defaultMarket = initialMarkets[0]?.key;

  const marketByKey = useMemo(() => new Map(markets.map((market) => [market.key, market])), [markets]);

  function replaceReference(reference) {
    setMarkets((current) => current.map((market) => market.key !== reference.market ? market : {
      ...market,
      references: [...market.references.filter((item) => item.externalGameKey !== reference.externalGameKey), reference]
        .sort((a, b) => a.externalGameLabel.localeCompare(b.externalGameLabel)),
    }));
    setDrafts((current) => ({ ...current, [`${reference.market}:${reference.externalGameKey}`]: localDateTime(reference.referenceAt) }));
  }

  async function saveReference(market, externalGameKey, value) {
    const key = `${market}:${externalGameKey}`;
    setBusy(key);
    setError("");
    try {
      const data = await apiJson("/api/gameinfo/market-rate-references", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ market, externalGameKey, referenceAt: new Date(value).toISOString() }),
      });
      replaceReference(data.reference);
      const nextMarket = marketByKey.get(market);
      const nextGame = nextMarket?.games.find((game) => !nextMarket.references.some((item) => item.externalGameKey === game.value) && game.value !== externalGameKey)?.value || "";
      setAddGames((current) => ({ ...current, [market]: nextGame }));
    } catch (reason) {
      setError(reason.message || "บันทึกเวลาอ้างอิงเรทไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function removeReference(reference) {
    const key = `${reference.market}:${reference.externalGameKey}`;
    setBusy(key);
    setError("");
    try {
      await apiJson(`/api/gameinfo/market-rate-references?market=${encodeURIComponent(reference.market)}&game=${encodeURIComponent(reference.externalGameKey)}`, { method: "DELETE" });
      setMarkets((current) => current.map((market) => market.key !== reference.market ? market : { ...market, references: market.references.filter((item) => item.externalGameKey !== reference.externalGameKey) }));
      setAddGames((current) => ({ ...current, [reference.market]: current[reference.market] || reference.externalGameKey }));
      setDeletePrompt(null);
    } catch (reason) {
      setError(reason.message || "ลบเวลาอ้างอิงเรทไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  return <>
    <header>
      <p className="text-xs font-medium text-muted-foreground">MARKET RATE CALIBRATION</p>
      <h2 className="text-2xl font-semibold tracking-tight">เวลาอ้างอิงเรทตามเกม</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">กำหนดเวลาที่ราคา Market ถูกอัปเดต ระบบจะเลือกอัตราแลกเปลี่ยนย้อนหลังที่ใกล้เวลานั้นที่สุดมาใช้คำนวณราคาเทียบ</p>
    </header>
    {error ? <Alert variant="destructive"><AlertTitle>ดำเนินการไม่สำเร็จ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Tabs defaultValue={defaultMarket}>
      <TabsList variant="line">{markets.map((market) => <TabsTrigger key={market.key} value={market.key}>{market.label}<Badge variant="secondary">{market.references.length}</Badge></TabsTrigger>)}</TabsList>
      {markets.map((market) => {
        const configured = new Set(market.references.map((item) => item.externalGameKey));
        const availableGames = market.games.filter((game) => !configured.has(game.value));
        return <TabsContent key={market.key} value={market.key} className="flex flex-col gap-4 pt-2">
          <Card>
            <CardHeader><CardTitle>เพิ่มเกมใน {market.label}</CardTitle><CardDescription>รายชื่อเกมมาจากลิงก์ที่จัดการไว้ใน Market นี้</CardDescription></CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.7fr)]">
                <Field data-disabled={!canManage || !availableGames.length}><FieldLabel htmlFor={`${market.key}-game`}>เกม</FieldLabel>
                  <Select items={availableGames.map((game) => ({ label: game.label, value: game.value }))} value={addGames[market.key] || null} onValueChange={(value) => setAddGames((current) => ({ ...current, [market.key]: value }))} disabled={!canManage || !availableGames.length}>
                    <SelectTrigger id={`${market.key}-game`} className="w-full"><SelectValue placeholder={availableGames.length ? "เลือกเกม" : "ตั้งเวลาครบทุกเกมแล้ว"} /></SelectTrigger>
                    <SelectContent><SelectGroup>{availableGames.map((game) => <SelectItem key={game.value} value={game.value}>{game.label}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                </Field>
                <Field data-disabled={!canManage}><FieldLabel htmlFor={`${market.key}-time`}>เวลาที่ Market อัปเดต</FieldLabel><Input id={`${market.key}-time`} type="datetime-local" value={addTimes[market.key]} disabled={!canManage} onChange={(event) => setAddTimes((current) => ({ ...current, [market.key]: event.target.value }))} /><FieldDescription>ค่าเริ่มต้นคือเวลาที่เปิดหน้านี้</FieldDescription></Field>
              </FieldGroup>
            </CardContent>
            <CardFooter><Button type="button" variant="outline" disabled={!canManage || !addGames[market.key] || busy !== ""} onClick={() => saveReference(market.key, addGames[market.key], addTimes[market.key])}>{busy === `${market.key}:${addGames[market.key]}` ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}เพิ่มเวลาอ้างอิง</Button></CardFooter>
          </Card>
          {market.references.length ? market.references.map((reference) => {
            const key = `${market.key}:${reference.externalGameKey}`;
            return <Card key={key} size="sm"><CardHeader><CardTitle>{reference.externalGameLabel}</CardTitle><CardDescription>{reference.externalGameKey}</CardDescription><CardAction><Badge variant="outline">อัปเดต {new Date(reference.updatedAt).toLocaleString("th-TH")}</Badge></CardAction></CardHeader>
              <CardContent><FieldGroup><Field orientation="horizontal" data-disabled={!canManage}><FieldContent><FieldLabel htmlFor={`${key}-time`}>เวลาที่ Market อัปเดต</FieldLabel><FieldDescription>ใช้หา exchange-rate snapshot ที่ใกล้ที่สุด</FieldDescription></FieldContent><Input id={`${key}-time`} className="max-w-xs" type="datetime-local" value={drafts[key] || ""} disabled={!canManage} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} /></Field></FieldGroup></CardContent>
              {canManage ? <CardFooter className="justify-between"><Button type="button" variant="destructive" size="sm" disabled={busy !== ""} onClick={() => setDeletePrompt(reference)}><Trash2 data-icon="inline-start" />ลบ</Button><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={busy !== ""} onClick={() => setDrafts((current) => ({ ...current, [key]: localDateTime() }))}><Clock3 data-icon="inline-start" />ใช้เวลาตอนนี้</Button><Button type="button" variant="outline" size="sm" disabled={busy !== ""} onClick={() => saveReference(market.key, reference.externalGameKey, drafts[key])}>{busy === key ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}บันทึก</Button></div></CardFooter> : null}
            </Card>;
          }) : <Empty><EmptyHeader><EmptyMedia variant="icon"><Clock3 /></EmptyMedia><EmptyTitle>ยังไม่มีเวลาอ้างอิงใน {market.label}</EmptyTitle><EmptyDescription>เลือกเกมและเพิ่มเวลาอัปเดตด้านบน เพื่อให้การเทียบราคาใช้เรทในช่วงเดียวกับ Market</EmptyDescription></EmptyHeader></Empty>}
        </TabsContent>;
      })}
    </Tabs>
    {!canManage ? <Alert><AlertTitle>ดูข้อมูลได้อย่างเดียว</AlertTitle><AlertDescription>ต้องมีสิทธิ์จัดการ GameInfo จึงจะเพิ่มหรือแก้เวลาอ้างอิงได้</AlertDescription></Alert> : null}
    <AlertDialog open={Boolean(deletePrompt)} onOpenChange={(open) => { if (!open && !busy) setDeletePrompt(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ลบเวลาอ้างอิงของ {deletePrompt?.externalGameLabel}?</AlertDialogTitle><AlertDialogDescription>หลังลบ ระบบจะกลับไปใช้อัตราแลกเปลี่ยนล่าสุดสำหรับเกมนี้</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={Boolean(busy)}>ยกเลิก</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={!deletePrompt || Boolean(busy)} onClick={() => removeReference(deletePrompt)}>{busy ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}ลบเวลาอ้างอิง</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
