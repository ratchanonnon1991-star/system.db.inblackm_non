"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Columns3, ExternalLink, GripVertical, Image as ImageIcon, Minus, PackageSearch, Plus, RefreshCw, Search, Settings2, Store, Trash2, X } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const storageKey = (name, game) => `gameinfo:kaleoz-${name}:${game || "zepeto"}`;
const AUTO_REFRESH_MS = 60 * 60 * 1000;

// Behaviour contract: refreshPrices fetches fresh market data; selectGame and
// selectProductType preserve URL filters; seller/column preferences persist per
// game; handleSellerDragEnd preserves custom seller ordering.
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

// Search matches the pack name exactly as the first column renders it, so what
// is typed is compared against what is on screen and nothing else.
function packName(group) {
  return group.packLabel || (group.quantity == null ? "ไม่พบตัวเลข" : `แพ็ค ${number(group.quantity)}`);
}

function selectItems(items = []) {
  return items.map((item) => ({ ...item, label: item.label, value: item.value }));
}

function gameLabel(value) {
  return String(value || "").replaceAll("South East Asia", "SEA");
}

function gameItems(items = []) {
  return selectItems(items).map((item) => ({ ...item, label: gameLabel(item.label) }));
}

const KALEOZ_GAME_URL = (slug) => `https://www.kaleoz.com/buy/${slug}?page=1`;
const GAME_SORT_STORAGE_KEY = "gameinfo:kaleoz-game-sort";
const GAME_SORTS = [
  { value: "custom", label: "ลำดับที่ตั้งไว้" },
  { value: "name-asc", label: "ชื่อเกม A-Z" },
  { value: "name-desc", label: "ชื่อเกม Z-A" },
  { value: "newest", label: "เพิ่มล่าสุดก่อน" },
  { value: "oldest", label: "เพิ่มเก่าสุดก่อน" },
];

// "custom" is the saved order from the database, so it is the identity sort.
// Every other mode sorts a copy, which keeps that saved order as the tie-break.
function sortGames(games, sort) {
  const added = (game) => Date.parse(game.createdAt || "") || 0;
  switch (sort) {
    case "name-asc": return [...games].sort((a, b) => a.label.localeCompare(b.label, "en"));
    case "name-desc": return [...games].sort((a, b) => b.label.localeCompare(a.label, "en"));
    case "newest": return [...games].sort((a, b) => added(b) - added(a));
    case "oldest": return [...games].sort((a, b) => added(a) - added(b));
    default: return games;
  }
}

export default function GameinfoPackPriceCompare({ page: serverPage, editable = false }) {
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
  const [manageOpen, setManageOpen] = useState(false);
  const [gameUrl, setGameUrl] = useState("");
  const [savedGames, setSavedGames] = useState(null);
  const [gameBusy, setGameBusy] = useState(false);
  const [gameError, setGameError] = useState("");
  const [gameSort, setGameSort] = useState("custom");
  const page = refreshedPage?.game === serverPage?.game && refreshedPage?.productType === serverPage?.productType ? refreshedPage : serverPage;
  const currentGame = page?.game || "zepeto";
  const currentProductType = page?.productType;
  const gameList = savedGames || page?.games;
  const games = useMemo(() => sortGames(gameItems(gameList), gameSort), [gameList, gameSort]);
  const productTypes = selectItems(page?.productTypes);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("th");
    if (!needle) return page?.groups || [];
    return (page?.groups || []).filter((group) => packName(group).toLocaleLowerCase("th").includes(needle));
  }, [page, query]);
  const availableSellers = useMemo(() => [...new Set((page?.offers || []).map((offer) => offer.seller).filter(Boolean))]
    .sort((a, b) => (a === "InblackmTH" ? -1 : b === "InblackmTH" ? 1 : a.localeCompare(b))), [page]);
  const sellers = useMemo(() => [
    ...sellerOrder.filter((seller) => availableSellers.includes(seller)),
    ...availableSellers.filter((seller) => !sellerOrder.includes(seller)),
  ], [availableSellers, sellerOrder]);
  const sellerItems = sellers.map((seller) => ({ label: seller, value: seller }));
  const activeBaselineSeller = sellers.includes(baselineSeller) ? baselineSeller : sellers[0];
  const visibleSellers = sellers.filter((seller) => !hiddenColumns.includes(`seller:${seller}`));
  const showCheapest = !hiddenColumns.includes("summary:cheapest");
  const showMostExpensive = !hiddenColumns.includes("summary:most-expensive");
  const showDetails = !hiddenColumns.includes("summary:details");
  const visibleColumnCount = visibleSellers.length + 1 + Number(showCheapest) + Number(showMostExpensive) + Number(showDetails);
  const competitorComparison = useMemo(() => {
    let moreExpensive = 0;
    let cheaper = 0;
    let comparable = 0;

    for (const group of page?.groups || []) {
      const baselineOffer = group.offers.find((offer) => offer.seller === activeBaselineSeller);
      const competitorPrices = group.offers
        .filter((offer) => offer.seller !== activeBaselineSeller)
        .map((offer) => offer.price)
        .filter(Number.isFinite);
      if (!baselineOffer || !Number.isFinite(baselineOffer.price) || !competitorPrices.length) continue;

      comparable += 1;
      const lowestCompetitorPrice = Math.min(...competitorPrices);
      if (baselineOffer.price > lowestCompetitorPrice) moreExpensive += 1;
      else if (baselineOffer.price < lowestCompetitorPrice) cheaper += 1;
    }

    return { moreExpensive, cheaper, comparable };
  }, [activeBaselineSeller, page]);

  const refreshPrices = useCallback(async () => {
    if (!currentProductType) return;
    setRefreshing(true);
    setRefreshError("");
    try {
      const response = await fetch(`/api/gameinfo/kaleoz-prices?game=${encodeURIComponent(currentGame)}&unit=${encodeURIComponent(currentProductType)}&refresh=1`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "รีเฟรชข้อมูลไม่สำเร็จ");
      setRefreshedPage(data.page);
    } catch (error) {
      setRefreshError(error.message || "รีเฟรชข้อมูลไม่สำเร็จ");
    } finally {
      setRefreshing(false);
    }
  }, [currentGame, currentProductType]);

  useEffect(() => {
    try {
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
    const savedSort = localStorage.getItem(GAME_SORT_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (GAME_SORTS.some((sort) => sort.value === savedSort)) setGameSort(savedSort);
  }, []);

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
    if (!seller) return;
    setBaselineSeller(seller);
    localStorage.setItem(storageKey("baseline-seller", currentGame), seller);
  }

  async function submitGameList(url, request, fallbackMessage) {
    setGameBusy(true);
    setGameError("");
    try {
      const response = await fetch(url, { ...request, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || fallbackMessage);
      setSavedGames(data.games);
      return data.games;
    } catch (error) {
      setGameError(error.message || fallbackMessage);
      return null;
    } finally {
      setGameBusy(false);
    }
  }

  async function addGame(event) {
    event.preventDefault();
    const nextGames = await submitGameList("/api/gameinfo/kaleoz-games", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: gameUrl }),
    }, "เพิ่มเกมไม่สำเร็จ");
    if (!nextGames) return;
    setGameUrl("");
    router.refresh();
  }

  async function removeGame(game) {
    const nextGames = await submitGameList(`/api/gameinfo/kaleoz-games?game=${encodeURIComponent(game.value)}`, { method: "DELETE" }, "ลบเกมไม่สำเร็จ");
    if (!nextGames) return;
    if (game.value === currentGame) selectGame(nextGames[0]?.value);
    else router.refresh();
  }

  function selectGameSort(value) {
    if (!value) return;
    setGameSort(value);
    localStorage.setItem(GAME_SORT_STORAGE_KEY, value);
  }

  function selectGame(value) {
    if (!value) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("game", value);
    next.delete("unit");
    setQuery("");
    setRefreshedPage(null);
    router.push(`${pathname}?${next.toString()}`);
  }

  function selectProductType(value) {
    if (!value) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("unit", value);
    setQuery("");
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
    <TooltipProvider>
      <div data-shadcn-focus className="flex flex-col gap-5">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <Badge variant="secondary" className="w-fit">KALEOZ MARKET</Badge>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">เทียบราคาแพ็ค</h1>
              <p className="mt-1 text-sm text-muted-foreground">เห็นราคาของทุก Seller ในตารางเดียว เลือกราคาอ้างอิงแล้วดูส่วนต่างได้ทันที</p>
            </div>
          </div>
          <div className="flex w-fit flex-wrap items-center gap-2">
            {editable ? (
              <Button type="button" variant="outline" size="lg" onClick={() => setManageOpen(true)}>
                <Settings2 data-icon="inline-start" /> จัดการเกม
              </Button>
            ) : null}
            <a href={page?.sourceUrl || KALEOZ_GAME_URL("zepeto")} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-fit")}>
              เปิด Kaleoz: {gameLabel(page?.gameLabel || "ZEPETO")} <ExternalLink data-icon="inline-end" />
            </a>
          </div>
        </header>

        {page?.error ? (
          <Alert variant="destructive"><PackageSearch /><AlertTitle>โหลดข้อมูลราคาไม่สำเร็จ</AlertTitle><AlertDescription>{page.error}</AlertDescription></Alert>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>ตัวกรองตลาด</CardTitle>
                <CardDescription>เลือกเกม หน่วยเงิน และ Seller ที่ใช้เป็นราคาอ้างอิง</CardDescription>
                <CardAction>
                  <Button type="button" variant="outline" onClick={refreshPrices} disabled={refreshing || !currentProductType}>
                    {refreshing ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                    {refreshing ? "กำลังรีเฟรช" : "รีเฟรชราคา"}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <FieldGroup className="grid gap-4 md:grid-cols-3">
                  <Field>
                    <FieldLabel htmlFor="compare-game">เกม</FieldLabel>
                    <Select items={games} value={currentGame} onValueChange={selectGame}>
                      <SelectTrigger id="compare-game" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectGroup>{games.map((game) => <SelectItem key={game.value} value={game.value}>{game.label}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="compare-unit">หมวดหมู่</FieldLabel>
                    <Select items={productTypes} value={currentProductType || null} onValueChange={selectProductType} disabled={!productTypes.length}>
                      <SelectTrigger id="compare-unit" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectGroup>{productTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="compare-seller">Seller อ้างอิง</FieldLabel>
                    <Select items={sellerItems} value={activeBaselineSeller || null} onValueChange={selectBaselineSeller} disabled={!sellerItems.length}>
                      <SelectTrigger id="compare-seller" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectGroup>{sellerItems.map((seller) => <SelectItem key={seller.value} value={seller.value}>{seller.label}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            {refreshError ? <Alert variant="destructive"><RefreshCw /><AlertTitle>รีเฟรชไม่สำเร็จ</AlertTitle><AlertDescription>{refreshError}</AlertDescription></Alert> : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard value={page?.groups?.length || 0} label="กลุ่มแพ็คที่จับคู่" icon={PackageSearch} />
              <MetricCard value={page?.offers?.length || 0} label={`รายการที่ใช้ · จากทั้งหมด ${number(page?.totalListings)}`} icon={CheckCircle2} />
              <MetricCard value={sellers.length} label="Seller ที่พบ" icon={Store} />
              <MetricCard value={competitorComparison.moreExpensive} label="แพงกว่าคู่แข่ง" description={`จาก ${number(competitorComparison.comparable)} แพ็คที่เทียบได้`} icon={ArrowUp} />
              <MetricCard value={competitorComparison.cheaper} label="ถูกกว่าคู่แข่ง" description={`จาก ${number(competitorComparison.comparable)} แพ็คที่เทียบได้`} icon={ArrowDown} />
            </div>

            <Card>
              <CardHeader className="border-b">
                <CardTitle>ตารางเปรียบเทียบราคา</CardTitle>
                <CardDescription>ลากหัวคอลัมน์เพื่อสลับลำดับ</CardDescription>
                <CardAction className="text-xs text-muted-foreground">อัปเดต {page?.fetchedAt ? new Date(page.fetchedAt).toLocaleString("th-TH") : "—"}</CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Field className="w-full max-w-md">
                    <FieldLabel htmlFor="compare-search" className="sr-only">ค้นหาชื่อแพ็ค</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon><Search /></InputGroupAddon>
                      <InputGroupInput id="compare-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อแพ็ค" />
                      {query ? <InputGroupAddon align="inline-end"><InputGroupButton type="button" variant="ghost" size="icon-xs" aria-label="ล้างคำค้นหา" onClick={() => setQuery("")}><X /></InputGroupButton></InputGroupAddon> : null}
                    </InputGroup>
                    {query ? <FieldDescription>พบ {number(groups.length)} จาก {number(page?.groups?.length || 0)} กลุ่มแพ็ค</FieldDescription> : null}
                  </Field>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" />}><Columns3 data-icon="inline-start" /> เลือกคอลัมน์</DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuLabel>คอลัมน์ที่แสดง</DropdownMenuLabel>
                      <DropdownMenuGroup>
                        {sellers.map((seller) => <DropdownMenuCheckboxItem key={seller} checked={!hiddenColumns.includes(`seller:${seller}`)} onCheckedChange={() => toggleColumn(`seller:${seller}`)}>{seller}</DropdownMenuCheckboxItem>)}
                        <DropdownMenuCheckboxItem checked={showCheapest} onCheckedChange={() => toggleColumn("summary:cheapest")}>ราคาต่ำสุด</DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem checked={showMostExpensive} onCheckedChange={() => toggleColumn("summary:most-expensive")}>ราคาแพงสุด</DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem checked={showDetails} onCheckedChange={() => toggleColumn("summary:details")}>ตรวจชื่อรายการ</DropdownMenuCheckboxItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup><DropdownMenuItem onClick={showAllColumns}>แสดงทุกคอลัมน์</DropdownMenuItem></DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSellerDragEnd}>
                  <SortableContext items={visibleSellers} strategy={horizontalListSortingStrategy}>
                    <Table className="min-w-[980px]" containerClassName="max-h-[37.5rem] overflow-auto rounded-md border">
                      <TableHeader><TableRow>
                        <TableHead className="sticky left-0 min-w-36 bg-card">ชื่อ Pack</TableHead>
                        {visibleSellers.map((seller) => <SortableSellerHeader key={seller} seller={seller} isBaseline={seller === activeBaselineSeller} />)}
                        {showCheapest ? <TableHead className="text-right">ราคาต่ำสุด</TableHead> : null}
                        {showMostExpensive ? <TableHead className="text-right">ราคาแพงสุด</TableHead> : null}
                        {showDetails ? <TableHead className="w-32">ตรวจชื่อ</TableHead> : null}
                      </TableRow></TableHeader>
                      <TableBody>
                        {groups.map((group) => {
                          const cheapest = group.offers[0];
                          const mostExpensive = group.offers.at(-1);
                          const offersBySeller = new Map();
                          group.offers.forEach((offer) => { if (!offersBySeller.has(offer.seller)) offersBySeller.set(offer.seller, offer); });
                          const baselineOffer = offersBySeller.get(activeBaselineSeller);
                          return (
                            <TableRow key={group.key} className="h-14">
                              <TableCell className="sticky left-0 bg-card font-medium">{packName(group)}</TableCell>
                              {visibleSellers.map((seller) => {
                                const offer = offersBySeller.get(seller);
                                return <SellerPriceCell key={seller} offer={offer} baselineOffer={baselineOffer} isBaseline={seller === activeBaselineSeller} isCheapest={Boolean(offer && offer.price === cheapest?.price)} />;
                              })}
                              {showCheapest ? <TableCell className="text-right font-semibold tabular-nums text-destructive">{money(cheapest?.price, cheapest?.currency)}</TableCell> : null}
                              {showMostExpensive ? <TableCell className="text-right font-medium tabular-nums">{money(mostExpensive?.price, mostExpensive?.currency)}</TableCell> : null}
                              {showDetails ? <TableCell><Button type="button" variant="outline" size="sm" onClick={() => setSelectedGroup(group)}>ดูรายการ</Button></TableCell> : null}
                            </TableRow>
                          );
                        })}
                        {!groups.length ? <TableRow><TableCell colSpan={visibleColumnCount}><Empty><EmptyHeader><EmptyMedia variant="icon"><PackageSearch /></EmptyMedia><EmptyTitle>ไม่พบแพ็คที่ตรงกับคำค้นหา</EmptyTitle><EmptyDescription>ค้นหาเทียบกับชื่อแพ็คในคอลัมน์แรกเท่านั้น</EmptyDescription></EmptyHeader>{query ? <Button type="button" variant="outline" size="sm" onClick={() => setQuery("")}><X data-icon="inline-start" /> ล้างคำค้นหา</Button> : null}</Empty></TableCell></TableRow> : null}
                      </TableBody>
                    </Table>
                  </SortableContext>
                </DndContext>
              </CardContent>
            </Card>

            <Dialog open={Boolean(selectedGroup)} onOpenChange={(open) => { if (!open) setSelectedGroup(null); }}>
              <DialogContent data-shadcn-focus className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
                <DialogHeader><DialogTitle>{selectedGroup?.packLabel || `แพ็ค ${number(selectedGroup?.quantity)}`}</DialogTitle><DialogDescription>รายการจริงที่ระบบจัดอยู่ในกลุ่มเดียวกัน ใช้ตรวจสอบชื่อ ราคา และ Seller</DialogDescription></DialogHeader>
                <div className="flex flex-col gap-3">
                  {(selectedGroup?.offers || []).map((offer) => (
                    <Card key={offer.itemId} size="sm"><CardContent className="grid gap-3 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center">
                      {offer.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={offer.imageUrl} alt="" className="size-16 rounded-lg border object-contain" />
                      ) : <span className="flex size-16 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ImageIcon /></span>}
                      <div className="min-w-0"><a href={offer.productUrl} target="_blank" rel="noreferrer" className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{offer.title}</a><p className="mt-1 text-xs text-muted-foreground">Server: {offer.server || "—"} · Stock: {offer.stockText || number(offer.stock)} · Trading volume: {number(offer.tradingVolume)}</p><div className="mt-2 flex flex-wrap gap-1.5"><Badge variant="outline">{offer.seller}</Badge>{offer.promo ? <Badge variant="secondary">PROMO</Badge> : null}</div></div>
                      <div className="sm:text-right"><p className="font-semibold tabular-nums">{money(offer.price, offer.currency)}</p><p className="mt-1 text-xs text-muted-foreground">{offer.unitPrice || "—"}</p></div>
                    </CardContent></Card>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        <Dialog open={manageOpen} onOpenChange={(open) => { setManageOpen(open); if (!open) setGameError(""); }}>
          <DialogContent data-shadcn-focus className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>จัดการเกมที่เทียบราคา</DialogTitle><DialogDescription>วางลิงก์หน้าเกมของ Kaleoz แล้วระบบจะดึงชื่อเกมมาให้เอง เช่น https://www.kaleoz.com/buy/honkai-star-rail</DialogDescription></DialogHeader>
            <form onSubmit={addGame} className="flex flex-col gap-3">
              <Field>
                <FieldLabel htmlFor="kaleoz-game-url">ลิงก์หน้าเกม Kaleoz</FieldLabel>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <InputGroup className="flex-1"><InputGroupAddon><ExternalLink /></InputGroupAddon><InputGroupInput id="kaleoz-game-url" type="text" value={gameUrl} onChange={(event) => setGameUrl(event.target.value)} placeholder="https://www.kaleoz.com/buy/<ชื่อเกม>" /></InputGroup>
                  <Button type="submit" disabled={gameBusy || !gameUrl.trim()}>{gameBusy ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}เพิ่มเกม</Button>
                </div>
              </Field>
              {gameError ? <Alert variant="destructive"><PackageSearch /><AlertTitle>ทำรายการไม่สำเร็จ</AlertTitle><AlertDescription>{gameError}</AlertDescription></Alert> : null}
            </form>
            <Field>
              <FieldLabel htmlFor="kaleoz-game-sort">เรียงลำดับเกมใน dropdown</FieldLabel>
              <Select items={GAME_SORTS} value={gameSort} onValueChange={selectGameSort}>
                <SelectTrigger id="kaleoz-game-sort" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{GAME_SORTS.map((sort) => <SelectItem key={sort.value} value={sort.value}>{sort.label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            <div className="flex flex-col gap-2">
              {games.map((game) => (
                <div key={game.value} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{game.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{game.slug}{game.createdAt ? ` · เพิ่มเมื่อ ${new Date(game.createdAt).toLocaleDateString("th-TH")}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a href={KALEOZ_GAME_URL(game.slug)} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                      ดูบน Kaleoz <ExternalLink data-icon="inline-end" />
                    </a>
                    <Button type="button" variant="outline" size="sm" disabled={gameBusy || games.length < 2} onClick={() => removeGame(game)} title={games.length < 2 ? "ต้องเหลืออย่างน้อย 1 เกม" : "ลบเกมนี้"}>
                      <Trash2 data-icon="inline-start" /> ลบ
                    </Button>
                  </div>
                </div>
              ))}
              {!games.length ? <Empty><EmptyHeader><EmptyMedia variant="icon"><PackageSearch /></EmptyMedia><EmptyTitle>ยังไม่มีเกมในรายการ</EmptyTitle><EmptyDescription>วางลิงก์หน้าเกมของ Kaleoz ด้านบนเพื่อเพิ่มเกมแรก</EmptyDescription></EmptyHeader></Empty> : null}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function MetricCard({ value, label, description, icon: Icon }) {
  return <Card size="sm"><CardHeader><CardTitle className="text-2xl tabular-nums">{number(value)}</CardTitle><CardDescription>{label}</CardDescription>{description ? <p className="text-xs text-muted-foreground">{description}</p> : null}<CardAction><Icon className="text-muted-foreground" /></CardAction></CardHeader></Card>;
}

function SellerPriceCell({ offer, baselineOffer, isBaseline, isCheapest }) {
  if (!offer) return <TableCell className="bg-muted/40 text-right text-muted-foreground">—</TableCell>;
  const difference = Number.isFinite(offer.price) && Number.isFinite(baselineOffer?.price)
    ? offer.price - baselineOffer.price
    : null;
  const cellTone = isCheapest || difference < 0 ? "bg-destructive/5" : difference === 0 || isBaseline ? "bg-muted/60" : "bg-muted/20";
  return (
    <TableCell className={cn("text-right tabular-nums", cellTone)}>
      <Tooltip>
        <TooltipTrigger render={<button type="button" className="inline-flex flex-col items-end rounded-md text-right outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />}>
          <span className={cn("font-medium", (isCheapest || difference < 0) && "font-semibold text-destructive")}>{money(offer.price, offer.currency)}</span>
          {isBaseline ? <Badge variant="outline" className="mt-1">ราคาอ้างอิง</Badge> : difference == null ? <span className="mt-1 text-xs text-muted-foreground">ไม่มีราคาอ้างอิง</span> : difference < 0 ? <Badge variant="destructive" className="mt-1"><ArrowDown />ถูกกว่า {money(Math.abs(difference), offer.currency)}</Badge> : difference > 0 ? <Badge variant="secondary" className="mt-1"><ArrowUp />แพงกว่า {money(difference, offer.currency)}</Badge> : <Badge variant="outline" className="mt-1"><Minus />เท่ากัน</Badge>}
        </TooltipTrigger>
        <TooltipContent><div className="flex flex-col gap-1"><p className="font-medium tabular-nums">{offer.unitPrice || "—"}</p><p>Stock: {offer.stockText || number(offer.stock)}</p><p>Trading volume: {number(offer.tradingVolume)}</p></div></TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

function SortableSellerHeader({ seller, isBaseline }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: seller });
  return (
    <TableHead ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 }} {...attributes} {...listeners} className={cn("min-w-40 cursor-grab touch-none text-right active:cursor-grabbing", isBaseline && "bg-primary text-primary-foreground")} title="กดค้างแล้วลากเพื่อเปลี่ยนลำดับคอลัมน์">
      <span className="flex items-center justify-end gap-1.5"><GripVertical />{seller}</span>
    </TableHead>
  );
}
