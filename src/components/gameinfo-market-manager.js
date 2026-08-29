"use client";

import { useEffect, useMemo, useState } from "react";
import { Store } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

const LABELS = { kaleoz: "Kaleoz", itemku: "Itemku" };

export default function GameinfoMarketManager({ gameId, dataMode, columns, onColumnsChange }) {
  const [open, setOpen] = useState(false);
  const [markets, setMarkets] = useState([]);
  const [gamesByMarket, setGamesByMarket] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const marketColumns = useMemo(() => new Map(columns.filter((column) => column.kind === "market").map((column) => [column.marketKey, column])), [columns]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiJson(`/api/gameinfo/markets/games/${gameId}?mode=${dataMode}`)
      .then((data) => { if (!cancelled) setMarkets(data.markets || []); })
      .catch((reason) => { if (!cancelled) setError(reason.message || "โหลด Market ไม่สำเร็จ"); });
    return () => { cancelled = true; };
  }, [dataMode, gameId, open]);

  async function loadGames(market) {
    if (gamesByMarket[market]) return;
    try {
      const data = await apiJson(`/api/gameinfo/markets/games/${gameId}?mode=${dataMode}&market=${market}`);
      setGamesByMarket((current) => ({ ...current, [market]: data.marketGames || [] }));
    } catch (reason) {
      setError(reason.message || "โหลดรายชื่อเกมไม่สำเร็จ");
    }
  }

  async function saveMarket(current, patch) {
    setBusy(current.market);
    setError("");
    try {
      const next = { ...current, ...patch };
      const data = await apiJson(`/api/gameinfo/markets/games/${gameId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...next, dataMode, market: current.market, version: current.version }),
      });
      setMarkets((items) => items.map((item) => item.market === current.market ? data.market : item));
      return data.market;
    } catch (reason) {
      setError(reason.message || "บันทึก Market ไม่สำเร็จ");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function toggleMarket(current, enabled) {
    if (enabled && !current.externalGameKey) {
      setError(`กรุณาเลือกเกมของ ${LABELS[current.market]} ก่อนเปิดใช้งาน`);
      return;
    }
    const existing = marketColumns.get(current.market);
    const collision = columns.find((column) => column.kind !== "market" && column.label.trim().toLowerCase() === LABELS[current.market].toLowerCase());
    if (enabled && !existing && collision) {
      setError(`มีคอลัมน์สูตรชื่อ ${LABELS[current.market]} อยู่แล้ว กรุณาเปลี่ยนชื่อก่อนเปิด Market`);
      return;
    }
    const saved = await saveMarket(current, { enabled });
    if (!saved) return;
    if (existing) {
      onColumnsChange(columns.map((column) => column.key === existing.key ? { ...column, enabled } : column));
    } else if (enabled) {
      onColumnsChange([...columns, {
        key: `market_${current.market}`,
        label: LABELS[current.market],
        formula: "[ราคา]",
        type: "number",
        symbol: "฿",
        scopeMode: "global",
        categoryFormulas: {},
        rowOverrides: {},
        kind: "market",
        marketKey: current.market,
        enabled: true,
      }]);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Store data-icon="inline-start" /> จัดการ Market
      </SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Market ของเกมนี้</SheetTitle>
          <SheetDescription>เลือกเกมต้นทางและเปิดคอลัมน์ราคา Market โดยข้อมูลเดิมจะไม่ถูกลบเมื่อปิด</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {markets.map((market) => {
            const column = marketColumns.get(market.market);
            const enabled = market.enabled && column?.enabled !== false;
            const games = gamesByMarket[market.market] || [];
            return (
              <Field key={market.market} orientation="horizontal" className="rounded-lg border p-3">
                <FieldContent>
                  <div className="flex items-center gap-2">
                    <FieldLabel>{LABELS[market.market]}</FieldLabel>
                    <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "เปิด" : "ปิด"}</Badge>
                  </div>
                  <Select
                    items={games.map((game) => ({ value: game.value, label: game.label }))}
                    value={market.externalGameKey || null}
                    onOpenChange={(nextOpen) => { if (nextOpen) loadGames(market.market); }}
                    onValueChange={(value) => {
                      const selected = games.find((game) => game.value === value);
                      saveMarket(market, { externalGameKey: value, externalGameLabel: selected?.label || value });
                    }}
                    disabled={busy === market.market}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="เลือกเกมใน Market" /></SelectTrigger>
                    <SelectContent><SelectGroup>{games.map((game) => <SelectItem key={game.value} value={game.value}>{game.label}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                  <FieldDescription>{column ? "มีคอลัมน์และสูตร Market แล้ว" : "เปิดครั้งแรกเพื่อสร้างคอลัมน์สูตร"}</FieldDescription>
                </FieldContent>
                <Switch checked={enabled} disabled={busy === market.market} onCheckedChange={(checked) => toggleMarket(market, checked)} aria-label={`เปิด ${LABELS[market.market]}`} />
              </Field>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
