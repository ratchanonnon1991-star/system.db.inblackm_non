"use client";

import { useEffect, useMemo, useState } from "react";
import { Store } from "lucide-react";
import { apiJson } from "@/lib/api-json";
import { gameinfoMarketGameLabel } from "@/lib/gameinfo-market-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

const LABELS = { kaleoz: "Kaleoz", itemku: "Itemku", g2g: "G2G" };

// A Select has no empty option of its own, so choosing "nothing" needs a value
// to carry. Picking it clears the mapping — which used to be impossible: a
// game chosen by mistake, or a column linked by mistake, could only ever be
// swapped for another one, never taken back out.
const CLEAR = "__clear__";

export default function GameinfoMarketManager({ gameId, dataMode, columns, onColumnsChange }) {
  const [open, setOpen] = useState(false);
  const [markets, setMarkets] = useState([]);
  const [gamesByMarket, setGamesByMarket] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const marketColumns = useMemo(() => new Map(columns.filter((column) => column.kind === "market").map((column) => [column.marketKey, column])), [columns]);
  // Any column can be a market's price. Legacy market-kind columns are still
  // offered so a game can point at the one it already has instead of losing it.
  const linkableColumns = useMemo(
    () => columns.map((column) => ({ key: column.key, label: column.label })),
    [columns]
  );

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

  // Turning a market on used to append a market_<market> column that could
  // never be deleted. A game now points at a column it already has, so the
  // same column can serve a market and still be edited or removed like any
  // other. Mappings made before this have no linked column and keep using the
  // old market-kind one, which is why it is still resolved below.
  function linkedColumnKey(market) {
    if (market.priceColumnKey) return market.priceColumnKey;
    // The legacy column only answers for this market while it is switched on —
    // the same rule findGameinfoMarketPriceColumn applies on the server. Any
    // looser and a column that was switched off would still show here as the
    // market's price, and unlinking would look like it had done nothing.
    const legacy = marketColumns.get(market.market);
    return legacy && legacy.enabled !== false ? legacy.key : "";
  }

  async function toggleMarket(current, enabled) {
    if (enabled && !current.externalGameKey) {
      setError(`กรุณาเลือกเกมของ ${LABELS[current.market]} ก่อนเปิดใช้งาน`);
      return;
    }
    if (enabled && !linkedColumnKey(current)) {
      setError(`กรุณาเลือกคอลัมน์อ้างอิงราคาของ ${LABELS[current.market]} ก่อนเปิดใช้งาน`);
      return;
    }
    const saved = await saveMarket(current, { enabled });
    if (!saved) return;
    // A legacy market-kind column still carries its own on/off flag, so keep
    // the two in step for games that have not been relinked yet.
    const legacy = marketColumns.get(current.market);
    if (legacy && !current.priceColumnKey) {
      onColumnsChange(columns.map((column) => (column.key === legacy.key ? { ...column, enabled } : column)));
    }
  }

  // Both of these clear to nothing, and both have to switch the market off on
  // the way: the server refuses a market that is on with no source game, and
  // turning one on without a price column is refused here — so leaving it on
  // with neither would be a state nothing else in the system accepts.
  async function clearGame(current) {
    await saveMarket(current, { externalGameKey: "", externalGameLabel: "", enabled: false });
  }

  async function linkColumn(current, columnKey) {
    if (columnKey === CLEAR) {
      const saved = await saveMarket(current, { priceColumnKey: "", enabled: false });
      if (!saved) return;
      // A game still on the pre-linking shape has no priceColumnKey to clear —
      // what answers for the market is the old market-kind column, so that is
      // what has to be switched off. Saved with the pack editor, like every
      // other column change made here.
      const legacy = marketColumns.get(current.market);
      if (legacy && legacy.enabled !== false) {
        onColumnsChange(columns.map((column) => (
          column.key === legacy.key ? { ...column, enabled: false } : column
        )));
      }
      return;
    }
    const saved = await saveMarket(current, { priceColumnKey: columnKey });
    if (!saved) return;
    // The linked column is an ordinary formula column now. A leftover
    // market-kind column would keep answering for this market, so switch it
    // off rather than leaving two answers to the same question.
    const legacy = marketColumns.get(current.market);
    if (legacy && legacy.key !== columnKey) {
      onColumnsChange(columns.map((column) => (column.key === legacy.key ? { ...column, enabled: false } : column)));
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
            const columnKey = linkedColumnKey(market);
            const column = columns.find((item) => item.key === columnKey) || null;
            // A legacy market column still gates on its own flag; a linked
            // ordinary column has nothing to gate on but the mapping itself.
            const enabled = market.enabled && (market.priceColumnKey ? Boolean(column) : column?.enabled === true);
            const games = gamesByMarket[market.market] || [];
            return (
              <Field key={market.market} orientation="horizontal" className="rounded-lg border p-3">
                <FieldContent className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FieldLabel>{LABELS[market.market]}</FieldLabel>
                    <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "เปิด" : "ปิด"}</Badge>
                  </div>
                  <Select
                    items={[
                      ...(market.externalGameKey ? [{ value: CLEAR, label: "— ไม่เลือกเกม (ปิด Market) —" }] : []),
                      ...games.map((game) => ({ value: game.value, label: gameinfoMarketGameLabel(game.label) })),
                    ]}
                    value={market.externalGameKey || null}
                    onOpenChange={(nextOpen) => { if (nextOpen) loadGames(market.market); }}
                    onValueChange={(value) => {
                      if (value === CLEAR) {
                        clearGame(market);
                        return;
                      }
                      const selected = games.find((game) => game.value === value);
                      saveMarket(market, { externalGameKey: value, externalGameLabel: selected?.label || value });
                    }}
                    disabled={busy === market.market}
                  >
                    <SelectTrigger className="w-full min-w-0 overflow-hidden"><SelectValue className="truncate" placeholder="เลือกเกมใน Market" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {market.externalGameKey ? (
                          <SelectItem value={CLEAR}>— ไม่เลือกเกม (ปิด Market) —</SelectItem>
                        ) : null}
                        {games.map((game) => <SelectItem key={game.value} value={game.value}>{gameinfoMarketGameLabel(game.label)}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Select
                    items={[
                      ...(columnKey ? [{ value: CLEAR, label: "— ไม่ผูกคอลัมน์ (ปิด Market) —" }] : []),
                      ...linkableColumns.map((item) => ({ value: item.key, label: item.label })),
                    ]}
                    value={columnKey || null}
                    onValueChange={(value) => linkColumn(market, value)}
                    disabled={busy === market.market}
                  >
                    <SelectTrigger className="w-full min-w-0 overflow-hidden">
                      <SelectValue className="truncate" placeholder="เลือกคอลัมน์อ้างอิงราคา" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {columnKey ? (
                          <SelectItem value={CLEAR}>— ไม่ผูกคอลัมน์ (ปิด Market) —</SelectItem>
                        ) : null}
                        {linkableColumns.map((item) => (
                          <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {linkableColumns.length
                      ? "เลือกคอลัมน์ที่มีอยู่ให้เป็นราคาของ Market นี้ · เลือกซ้ำเพื่อเปลี่ยน หรือเลือก “ไม่ผูกคอลัมน์” เพื่อถอดออก"
                      : "ยังไม่มีคอลัมน์ให้เลือก — สร้างคอลัมน์สูตรก่อน"}
                  </FieldDescription>
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
