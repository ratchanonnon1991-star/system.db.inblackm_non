"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { gameinfoMarketGameLabel } from "@/lib/gameinfo-market-system";
import { cappedSellerColumns, msUntilNextDailyRefresh, packCompareStorageKey, togglePackCompareColumn } from "@/lib/gameinfo-pack-market";
import { diffPricePages } from "@/lib/gameinfo-price-diff";
import { cn } from "@/lib/utils";

const storageKey = packCompareStorageKey;
// itemku returns every shop on the marketplace, so the table (one column per
// seller) and the column menu both need a default cap or they lock the page up.
const DEFAULT_SELLER_COLUMNS = 12;
const SELLER_MENU_LIMIT = 50;
// How long a cell stays marked after a refresh moved it, matching the query panel.
const CHANGED_HIGHLIGHT_MS = 8000;
const ITEMKU_GAME_URL = (slug) => `https://www.itemku.com/en/g/${slug}/top-up`;
const G2G_GAME_URL = (slug) => `https://www.g2g.com/categories/${slug}`;

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
  return gameinfoMarketGameLabel(value);
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

export default function GameinfoPackPriceCompare({ page: serverPage, editable = false, title = "เทียบราคาแพ็ค" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [sellerOrder, setSellerOrder] = useState([]);
  const [baselineSeller, setBaselineSeller] = useState(serverPage?.baselineSeller || "");
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [columnsPicked, setColumnsPicked] = useState(false);
  const [sellerQuery, setSellerQuery] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");
  // Drag-to-select: pointerdown paints the first row, pointerenter paints the
  // rest, and the click that follows the drag must not undo the first row.
  const paintHiddenRef = useRef(null);
  const skipNextCheckedChangeRef = useRef(false);
  const [refreshedPage, setRefreshedPage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [refreshNotice, setRefreshNotice] = useState("");
  // Only a manual refresh asks first; the daily 09:00 run fires on its own.
  const [refreshPrompt, setRefreshPrompt] = useState(null);
  const [changedCells, setChangedCells] = useState(() => new Set());
  const [manageOpen, setManageOpen] = useState(false);
  const [gameUrl, setGameUrl] = useState("");
  const [savedGames, setSavedGames] = useState(null);
  const [gameBusy, setGameBusy] = useState(false);
  const [gameError, setGameError] = useState("");
  const [gameSort, setGameSort] = useState("custom");
  const provider = ["kaleoz", "itemku", "g2g"].includes(serverPage?.provider) ? serverPage.provider : "kaleoz";
  const page = refreshedPage?.provider === provider && refreshedPage?.game === serverPage?.game && refreshedPage?.productType === serverPage?.productType ? refreshedPage : serverPage;
  const currentGame = page?.game || "zepeto";
  const currentProductType = page?.productType;
  // The configured own seller is the default. Any selection in this page is preview-only.
  const savedBaselineSeller = serverPage?.baselineSeller || "";
  const gameList = savedGames || page?.games;
  const games = useMemo(() => sortGames(gameItems(gameList), gameSort), [gameList, gameSort]);
  const marketUi = {
    kaleoz: { label: "Kaleoz", gameUrl: KALEOZ_GAME_URL, example: "https://www.kaleoz.com/buy/honkai-star-rail", placeholder: "https://www.kaleoz.com/buy/<ชื่อเกม>" },
    itemku: { label: "itemku", gameUrl: ITEMKU_GAME_URL, example: "https://www.itemku.com/en/g/honkai-star-rail/top-up", placeholder: "https://www.itemku.com/en/g/<ชื่อเกม>/top-up" },
    g2g: { label: "G2G", gameUrl: G2G_GAME_URL, example: "https://www.g2g.com/categories/zepeto-top-up", placeholder: "https://www.g2g.com/categories/<ชื่อเกม>" },
  }[provider];
  const marketLabel = page?.providerLabel || marketUi.label;
  const marketGameUrl = marketUi.gameUrl;
  const marketUrlExample = marketUi.example;
  const marketUrlPlaceholder = marketUi.placeholder;
  const productTypes = selectItems(page?.productTypes).map((type, index) => index === 0 ? { ...type, label: "ทุกหมวดหมู่" } : type);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const pageRef = useRef(page);
  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("th");
    if (!needle) return page?.groups || [];
    return (page?.groups || []).filter((group) => packName(group).toLocaleLowerCase("th").includes(needle));
  }, [page, query]);
  const availableSellers = useMemo(() => [...new Set((page?.offers || []).map((offer) => offer.seller).filter(Boolean))], [page]);
  const sellers = useMemo(() => [
    ...sellerOrder.filter((seller) => availableSellers.includes(seller)),
    ...availableSellers.filter((seller) => !sellerOrder.includes(seller)),
  ], [availableSellers, sellerOrder]);
  const sellerItems = sellers.map((seller) => ({ label: seller, value: seller }));
  const activeBaselineSeller = availableSellers.includes(baselineSeller) ? baselineSeller : "";
  // Sellers that cover the most pack groups are the useful ones to show first.
  const sellerCoverage = useMemo(() => {
    const coverage = new Map();
    for (const group of page?.groups || []) {
      for (const seller of group.sellers || []) coverage.set(seller, (coverage.get(seller) || 0) + 1);
    }
    return coverage;
  }, [page]);
  const cappedColumns = useMemo(
    () => cappedSellerColumns(sellers, sellerCoverage, DEFAULT_SELLER_COLUMNS, activeBaselineSeller),
    [activeBaselineSeller, sellerCoverage, sellers]
  );
  // Until the user opens the menu and picks, the cap stands in for their choice.
  const effectiveHiddenColumns = columnsPicked ? hiddenColumns : [...hiddenColumns, ...cappedColumns];
  const cappedSellerCount = columnsPicked ? 0 : cappedColumns.length;
  // A seller qualifies for the filter when at least one of its packs sits on that
  // side of the reference price.
  const sellerPriceSides = useMemo(() => {
    const sides = new Map();
    for (const group of page?.groups || []) {
      const baselinePrice = group.offers.find((offer) => offer.seller === activeBaselineSeller)?.price;
      if (!Number.isFinite(baselinePrice)) continue;
      for (const offer of group.offers) {
        if (offer.seller === activeBaselineSeller || !Number.isFinite(offer.price)) continue;
        const side = sides.get(offer.seller) || { expensive: 0, cheaper: 0 };
        if (offer.price > baselinePrice) side.expensive += 1;
        else if (offer.price < baselinePrice) side.cheaper += 1;
        sides.set(offer.seller, side);
      }
    }
    return sides;
  }, [activeBaselineSeller, page]);
  const matchesPriceFilter = useCallback((seller) => {
    if (priceFilter === "all" || seller === activeBaselineSeller) return true;
    return (sellerPriceSides.get(seller)?.[priceFilter] || 0) > 0;
  }, [activeBaselineSeller, priceFilter, sellerPriceSides]);
  const menuSellers = useMemo(() => {
    const needle = sellerQuery.trim().toLocaleLowerCase("th");
    return needle ? sellers.filter((seller) => seller.toLocaleLowerCase("th").includes(needle)) : sellers;
  }, [sellerQuery, sellers]);
  const visibleSellers = sellers.filter((seller) => !effectiveHiddenColumns.includes(`seller:${seller}`) && matchesPriceFilter(seller));
  const showCheapest = !effectiveHiddenColumns.includes("summary:cheapest");
  const showMostExpensive = !effectiveHiddenColumns.includes("summary:most-expensive");
  const showDetails = !effectiveHiddenColumns.includes("summary:details");
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
      const response = await fetch(`/api/gameinfo/${provider}-prices?game=${encodeURIComponent(currentGame)}&unit=${encodeURIComponent(currentProductType)}&refresh=1`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "รีเฟรชข้อมูลไม่สำเร็จ");
      // The server hands back the previous page untouched when the prices match,
      // so an unchanged refresh must not replace what is on screen.
      const checkedLabel = data.page?.checkedAt ? new Date(data.page.checkedAt).toLocaleTimeString("th-TH") : "";
      if (data.page?.unchanged) {
        setRefreshNotice(`ข้อมูลไม่เปลี่ยน · เช็คเมื่อ ${checkedLabel || "เมื่อสักครู่"}`);
        return;
      }
      setChangedCells(diffPricePages(pageRef.current, data.page));
      setRefreshNotice("");
      setRefreshedPage(data.page);
    } catch (error) {
      setRefreshError(error.message || "รีเฟรชข้อมูลไม่สำเร็จ");
    } finally {
      setRefreshing(false);
    }
  }, [currentGame, currentProductType, provider]);

  useEffect(() => {
    try {
      setSellerOrder([]);
      setBaselineSeller(savedBaselineSeller);
      setHiddenColumns([]);
      setColumnsPicked(false);
      setSellerQuery("");
      setPriceFilter("all");
      setChangedCells(new Set());
      setRefreshNotice("");
      setSavedGames(null);
      const saved = JSON.parse(localStorage.getItem(storageKey("seller-order", provider, currentGame)) || "[]");
      if (Array.isArray(saved)) setSellerOrder(saved.filter((seller) => typeof seller === "string"));
      const rawHiddenColumns = localStorage.getItem(storageKey("hidden-columns", provider, currentGame));
      const savedHiddenColumns = rawHiddenColumns == null ? null : JSON.parse(rawHiddenColumns);
      if (Array.isArray(savedHiddenColumns)) {
        setHiddenColumns(savedHiddenColumns.filter((column) => typeof column === "string"));
        setColumnsPicked(true);
      }
    } catch {
      localStorage.removeItem(storageKey("seller-order", provider, currentGame));
    }
  }, [currentGame, savedBaselineSeller, provider]);

  // Kept in a ref so refreshPrices can diff against what is on screen without
  // being rebuilt (and restarting the hourly timer) on every page change.
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    if (!changedCells.size) return undefined;
    const timer = window.setTimeout(() => setChangedCells(new Set()), CHANGED_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [changedCells]);

  useEffect(() => {
    function endPaint() {
      paintHiddenRef.current = null;
      // The click that closes a drag fires before timers, so clear the guard after it.
      setTimeout(() => { skipNextCheckedChangeRef.current = false; }, 0);
    }
    window.addEventListener("pointerup", endPaint);
    window.addEventListener("pointercancel", endPaint);
    return () => {
      window.removeEventListener("pointerup", endPaint);
      window.removeEventListener("pointercancel", endPaint);
    };
  }, []);

  useEffect(() => {
    const savedSort = localStorage.getItem(GAME_SORT_STORAGE_KEY);
    if (GAME_SORTS.some((sort) => sort.value === savedSort)) setGameSort(savedSort);
  }, []);

  // Once a day at 09:00 Thailand time, no prompt. Re-armed after each run rather
  // than on an interval so it cannot drift off the hour.
  useEffect(() => {
    let timer = window.setTimeout(function run() {
      refreshPrices();
      timer = window.setTimeout(run, msUntilNextDailyRefresh());
    }, msUntilNextDailyRefresh());
    return () => window.clearTimeout(timer);
  }, [refreshPrices]);

  function confirmRefresh() {
    setRefreshPrompt(null);
    refreshPrices();
  }

  function handleSellerDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oldIndex = visibleSellers.indexOf(active.id);
    const newIndex = visibleSellers.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedVisible = arrayMove(visibleSellers, oldIndex, newIndex);
    let visibleIndex = 0;
    const next = sellers.map((seller) => visibleSellers.includes(seller) ? reorderedVisible[visibleIndex++] : seller);
    setSellerOrder(next);
    localStorage.setItem(storageKey("seller-order", provider, currentGame), JSON.stringify(next));
  }

  function selectBaselineSeller(seller) {
    if (!seller) return;
    setBaselineSeller(seller);
    if (effectiveHiddenColumns.includes(`seller:${seller}`)) toggleColumn(`seller:${seller}`);
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
    const nextGames = await submitGameList(`/api/gameinfo/${provider}-games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: gameUrl }),
    }, "เพิ่มเกมไม่สำเร็จ");
    if (!nextGames) return;
    setGameUrl("");
    router.refresh();
  }

  async function removeGame(game) {
    const nextGames = await submitGameList(`/api/gameinfo/${provider}-games?game=${encodeURIComponent(game.value)}`, { method: "DELETE" }, "ลบเกมไม่สำเร็จ");
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

  function selectMarket(value) {
    if (!value || value === provider) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("market", value);
    next.delete("game");
    next.delete("unit");
    setQuery("");
    setRefreshedPage(null);
    setSavedGames(null);
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

  function commitHiddenColumns(next) {
    setHiddenColumns(next);
    setColumnsPicked(true);
    localStorage.setItem(storageKey("hidden-columns", provider, currentGame), JSON.stringify(next));
  }

  function toggleColumn(column) {
    commitHiddenColumns(togglePackCompareColumn(effectiveHiddenColumns, column));
  }

  function setColumnHidden(column, hidden) {
    if (effectiveHiddenColumns.includes(column) !== hidden) toggleColumn(column);
  }

  function startColumnPaint(column) {
    paintHiddenRef.current = !effectiveHiddenColumns.includes(column);
    skipNextCheckedChangeRef.current = true;
    setColumnHidden(column, paintHiddenRef.current);
  }

  function paintColumn(column, event) {
    if (paintHiddenRef.current === null || !event.buttons) return;
    setColumnHidden(column, paintHiddenRef.current);
  }

  // Keyboard toggles never go through pointerdown, so they still land here.
  function toggleColumnFromCheckbox(column) {
    if (skipNextCheckedChangeRef.current) {
      skipNextCheckedChangeRef.current = false;
      return;
    }
    toggleColumn(column);
  }

  function showAllColumns() {
    commitHiddenColumns([]);
  }

  // Clears the seller ticks only; the summary columns keep whatever they are on.
  function clearSellerColumns() {
    commitHiddenColumns([
      ...effectiveHiddenColumns.filter((column) => !column.startsWith("seller:")),
      ...sellers.map((seller) => `seller:${seller}`),
    ]);
  }

  return (
    <TooltipProvider>
      <div data-shadcn-focus className="flex flex-col gap-5">
        <Tabs value={provider} onValueChange={selectMarket}>
          <TabsList aria-label="ตลาดสำหรับเทียบราคา" className="h-10">
            <TabsTrigger value="kaleoz" className="px-4">Kaleoz</TabsTrigger>
            <TabsTrigger value="itemku" className="px-4">itemku</TabsTrigger>
            <TabsTrigger value="g2g" className="px-4">G2G</TabsTrigger>
          </TabsList>
        </Tabs>
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <Badge variant="secondary" className="w-fit">{page?.providerLabel || "Kaleoz"} MARKET</Badge>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
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
              เปิด {page?.providerLabel || "Kaleoz"}: {gameLabel(page?.gameLabel || "ZEPETO")} <ExternalLink data-icon="inline-end" />
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
                <CardAction className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    อัปเดต {page?.fetchedAt ? new Date(page.fetchedAt).toLocaleString("th-TH") : "—"}
                    {refreshNotice ? <span className="ml-2 text-foreground">{refreshNotice}</span> : null}
                    {changedCells.size ? <span className="ml-2 text-foreground">เปลี่ยน {number(changedCells.size)} ช่อง</span> : null}
                  </span>
                  <Button type="button" variant="outline" onClick={() => setRefreshPrompt("manual")} disabled={refreshing || !currentProductType}>
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
                      <SelectTrigger id="compare-seller" className="w-full"><SelectValue placeholder="ไม่พบร้านของเราในหมวดนี้" /></SelectTrigger>
                      <SelectContent><SelectGroup>{sellerItems.map((seller) => <SelectItem key={seller.value} value={seller.value}>{seller.label}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                    <FieldDescription>{!savedBaselineSeller ? "ยังไม่พบร้านของเราที่ตั้งไว้ในหมวดนี้" : baselineSeller === savedBaselineSeller ? "ค่าเริ่มต้นจากร้านของเรา" : "เลือกเพื่อดูชั่วคราว ระบบจะไม่บันทึกค่านี้"}</FieldDescription>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            {refreshError ? <Alert variant="destructive"><RefreshCw /><AlertTitle>รีเฟรชไม่สำเร็จ</AlertTitle><AlertDescription>{refreshError}</AlertDescription></Alert> : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard value={page?.groups?.length || 0} label="กลุ่มแพ็คที่จับคู่" icon={PackageSearch} tone="blue" />
              <MetricCard value={page?.offers?.length || 0} label={`รายการที่ใช้ · จากทั้งหมด ${number(page?.totalListings)}`} icon={CheckCircle2} tone="amber" />
              <MetricCard value={sellers.length} label="Seller ที่พบ" icon={Store} tone="violet" />
              <MetricCard value={competitorComparison.moreExpensive} label="แพงกว่าคู่แข่ง" description={`จาก ${number(competitorComparison.comparable)} แพ็คที่เทียบได้`} icon={ArrowUp} tone="emerald" />
              <MetricCard value={competitorComparison.cheaper} label="ถูกกว่าคู่แข่ง" description={`จาก ${number(competitorComparison.comparable)} แพ็คที่เทียบได้`} icon={ArrowDown} tone="rose" />
            </div>

            <Card>
              <CardHeader className="border-b">
                <CardTitle>ตารางเปรียบเทียบราคา</CardTitle>
                <CardDescription>ลากหัวคอลัมน์เพื่อสลับลำดับ</CardDescription>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Tabs value={priceFilter} onValueChange={setPriceFilter}>
                      <TabsList aria-label="กรอง Seller ตามราคาเทียบกับราคาอ้างอิง">
                        <TabsTrigger value="all">ทุกร้าน</TabsTrigger>
                        <TabsTrigger value="expensive">แพงกว่า</TabsTrigger>
                        <TabsTrigger value="cheaper">ถูกกว่า</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="outline" />}><Columns3 data-icon="inline-start" /> เลือกคอลัมน์ {cappedSellerCount ? `(ซ่อน ${number(cappedSellerCount)} Seller)` : ""}</DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-72">
                        <div className="flex gap-1 p-1">
                          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={showAllColumns}>แสดงทุกคอลัมน์</Button>
                          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={clearSellerColumns}>ล้าง Seller</Button>
                        </div>
                        <DropdownMenuSeparator />
                        <div className="p-1">
                          <InputGroup>
                            <InputGroupAddon><Search /></InputGroupAddon>
                            <InputGroupInput type="search" value={sellerQuery} onChange={(event) => setSellerQuery(event.target.value)} onKeyDown={(event) => event.stopPropagation()} placeholder="ค้นหา Seller" aria-label="ค้นหา Seller" />
                          </InputGroup>
                        </div>
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>Seller ที่แสดง · {number(visibleSellers.length)} จาก {number(sellers.length)} · กดค้างแล้วลากเพื่อเลือกหลายรายการ</DropdownMenuLabel>
                          {menuSellers.slice(0, SELLER_MENU_LIMIT).map((seller) => <DropdownMenuCheckboxItem key={seller} checked={!effectiveHiddenColumns.includes(`seller:${seller}`)} onCheckedChange={() => toggleColumnFromCheckbox(`seller:${seller}`)} onPointerDown={() => startColumnPaint(`seller:${seller}`)} onPointerEnter={(event) => paintColumn(`seller:${seller}`, event)} closeOnClick={false}>{seller}</DropdownMenuCheckboxItem>)}
                          {!menuSellers.length ? <DropdownMenuLabel>ไม่พบ Seller ที่ตรงกับคำค้นหา</DropdownMenuLabel> : null}
                          {menuSellers.length > SELLER_MENU_LIMIT ? <DropdownMenuLabel>อีก {number(menuSellers.length - SELLER_MENU_LIMIT)} Seller · พิมพ์ค้นหาเพื่อดูเพิ่ม</DropdownMenuLabel> : null}
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>คอลัมน์สรุป</DropdownMenuLabel>
                          <DropdownMenuCheckboxItem checked={showCheapest} onCheckedChange={() => toggleColumn("summary:cheapest")} closeOnClick={false}>ราคาต่ำสุด</DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem checked={showMostExpensive} onCheckedChange={() => toggleColumn("summary:most-expensive")} closeOnClick={false}>ราคาแพงสุด</DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem checked={showDetails} onCheckedChange={() => toggleColumn("summary:details")} closeOnClick={false}>ตรวจชื่อรายการ</DropdownMenuCheckboxItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {priceFilter === "all" ? null : (
                  <p className="text-xs text-muted-foreground">
                    แสดงเฉพาะร้านที่มีอย่างน้อย 1 แพ็ค{priceFilter === "expensive" ? "แพงกว่า" : "ถูกกว่า"}ราคาอ้างอิง · เหลือ {number(visibleSellers.filter((seller) => seller !== activeBaselineSeller).length)} ร้าน (ไม่นับ {activeBaselineSeller || "ราคาอ้างอิง"})
                  </p>
                )}

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSellerDragEnd}>
                  <SortableContext items={visibleSellers} strategy={horizontalListSortingStrategy}>
                    <Table className="w-auto table-fixed" containerClassName="max-h-[37.5rem] overflow-auto rounded-md border">
                      <TableHeader><TableRow>
                        <TableHead className="sticky left-0 top-0 z-30 h-12 w-80 bg-card px-3">ชื่อ Pack</TableHead>
                        {visibleSellers.map((seller) => <SortableSellerHeader key={seller} seller={seller} isBaseline={seller === activeBaselineSeller} />)}
                        {showCheapest ? <TableHead className="sticky top-0 z-20 h-12 w-40 bg-card px-3 text-right">ราคาต่ำสุด</TableHead> : null}
                        {showMostExpensive ? <TableHead className="sticky top-0 z-20 h-12 w-40 bg-card px-3 text-right">ราคาแพงสุด</TableHead> : null}
                        {showDetails ? <TableHead className="sticky top-0 z-20 h-12 w-36 bg-card px-3">ตรวจชื่อ</TableHead> : null}
                      </TableRow></TableHeader>
                      <TableBody>
                        {groups.map((group) => {
                          const cheapest = group.offers[0];
                          const mostExpensive = group.offers.at(-1);
                          const offersBySeller = new Map();
                          group.offers.forEach((offer) => { if (!offersBySeller.has(offer.seller)) offersBySeller.set(offer.seller, offer); });
                          const baselineOffer = offersBySeller.get(activeBaselineSeller);
                          return (
                            <TableRow key={group.key} className="h-[4.5rem]">
                              <TableCell className="sticky left-0 z-10 truncate bg-card px-3 font-medium" title={packName(group)}>{packName(group)}</TableCell>
                              {visibleSellers.map((seller) => {
                                const offer = offersBySeller.get(seller);
                                return <SellerPriceCell key={seller} offer={offer} baselineOffer={baselineOffer} isBaseline={seller === activeBaselineSeller} isCheapest={Boolean(offer && offer.price === cheapest?.price)} isChanged={changedCells.has(`${group.key}:${seller}`)} />;
                              })}
                              {showCheapest ? <TableCell className="px-3 text-right font-semibold tabular-nums text-destructive">{money(cheapest?.price, cheapest?.currency)}</TableCell> : null}
                              {showMostExpensive ? <TableCell className="px-3 text-right font-medium tabular-nums">{money(mostExpensive?.price, mostExpensive?.currency)}</TableCell> : null}
                              {showDetails ? <TableCell className="px-3"><Button type="button" variant="outline" size="sm" onClick={() => setSelectedGroup(group)}>ดูรายการ</Button></TableCell> : null}
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
                      <div className="min-w-0"><a href={offer.productUrl} target="_blank" rel="noreferrer" className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{offer.title}</a><p className="mt-1 text-xs text-muted-foreground">{provider === "itemku" ? `Sold: ${number(offer.sold)} · Rating: ${offer.rating == null ? "—" : number(offer.rating)} · Delivery: ${offer.delivery || "—"}` : provider === "g2g" ? `Orders: ${number(offer.sold)} · Stock: ${offer.stockText || number(offer.stock)} · Delivery: ${offer.delivery || "—"}` : `Server: ${offer.server || "—"} · Stock: ${offer.stockText || number(offer.stock)} · Trading volume: ${number(offer.tradingVolume)}`}</p><div className="mt-2 flex flex-wrap gap-1.5"><Badge variant="outline">{offer.seller}</Badge>{offer.promo ? <Badge variant="secondary">PROMO</Badge> : null}</div></div>
                      <div className="sm:text-right"><p className="font-semibold tabular-nums">{money(offer.price, offer.currency)}</p><p className="mt-1 text-xs text-muted-foreground">{offer.unitPrice || "—"}</p></div>
                    </CardContent></Card>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        <Dialog open={Boolean(refreshPrompt)} onOpenChange={(open) => { if (!open) setRefreshPrompt(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>ยืนยันการรีเฟรชราคา</DialogTitle>
              <DialogDescription>จะดึงราคาใหม่จาก {marketLabel} ทันที ข้ามแคชที่เก็บไว้ (รอบอัตโนมัติทำงานเองทุกวัน 09:00 น.)</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">ถ้าราคาไม่เปลี่ยน ตารางจะคงเดิมและขึ้นข้อความบอกไว้เท่านั้น</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRefreshPrompt(null)}>ยกเลิก</Button>
              <Button type="button" onClick={confirmRefresh} disabled={refreshing}>
                {refreshing ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}รีเฟรชราคา
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={manageOpen} onOpenChange={(open) => { setManageOpen(open); if (!open) setGameError(""); }}>
          <DialogContent data-shadcn-focus className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>จัดการเกมที่เทียบราคา</DialogTitle><DialogDescription>วางลิงก์หน้าเกมของ {marketLabel} แล้วระบบจะดึงชื่อเกมมาให้เอง เช่น {marketUrlExample}</DialogDescription></DialogHeader>
            <form onSubmit={addGame} className="flex flex-col gap-3">
              <Field>
                <FieldLabel htmlFor="market-game-url">ลิงก์หน้าเกม {marketLabel}</FieldLabel>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <InputGroup className="flex-1"><InputGroupAddon><ExternalLink /></InputGroupAddon><InputGroupInput id="market-game-url" type="text" value={gameUrl} onChange={(event) => setGameUrl(event.target.value)} placeholder={marketUrlPlaceholder} /></InputGroup>
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
                    <a href={marketGameUrl(game.slug)} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                      ดูบน {marketLabel} <ExternalLink data-icon="inline-end" />
                    </a>
                    <Button type="button" variant="outline" size="sm" disabled={gameBusy || games.length < 2} onClick={() => removeGame(game)} title={games.length < 2 ? "ต้องเหลืออย่างน้อย 1 เกม" : "ลบเกมนี้"}>
                      <Trash2 data-icon="inline-start" /> ลบ
                    </Button>
                  </div>
                </div>
              ))}
              {!games.length ? <Empty><EmptyHeader><EmptyMedia variant="icon"><PackageSearch /></EmptyMedia><EmptyTitle>ยังไม่มีเกมในรายการ</EmptyTitle><EmptyDescription>วางลิงก์หน้าเกมของ {marketLabel} ด้านบนเพื่อเพิ่มเกมแรก</EmptyDescription></EmptyHeader></Empty> : null}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

// Soft, desaturated tones rather than the flat vivid tiles: the icon carries the
// colour on its own, with no filled square behind it.
const METRIC_TONES = {
  blue: "text-sky-500/75 dark:text-sky-300/75",
  amber: "text-amber-500/75 dark:text-amber-300/75",
  violet: "text-violet-500/75 dark:text-violet-300/75",
  emerald: "text-emerald-500/75 dark:text-emerald-300/75",
  rose: "text-rose-500/75 dark:text-rose-300/75",
};

function MetricCard({ value, label, description, icon: Icon, tone = "blue" }) {
  return <Card size="sm"><CardHeader><CardTitle className="text-2xl tabular-nums">{number(value)}</CardTitle><CardDescription>{label}</CardDescription>{description ? <p className="text-xs text-muted-foreground">{description}</p> : null}<CardAction><Icon className={cn("size-6", METRIC_TONES[tone])} /></CardAction></CardHeader></Card>;
}

function SellerPriceCell({ offer, baselineOffer, isBaseline, isCheapest, isChanged }) {
  if (!offer) return <TableCell className="bg-muted/40 px-3 text-right text-muted-foreground">—</TableCell>;
  const difference = Number.isFinite(offer.price) && Number.isFinite(baselineOffer?.price)
    ? offer.price - baselineOffer.price
    : null;
  // Cheaper than the reference stays red; more expensive reads green.
  const cellTone = isCheapest || difference < 0 ? "bg-destructive/5" : difference > 0 ? "bg-emerald-500/5" : difference === 0 || isBaseline ? "bg-muted/60" : "bg-muted/20";
  return (
    <TableCell className={cn("px-3 py-2.5 text-right tabular-nums", cellTone, isChanged && "ring-2 ring-primary/60 ring-inset")}>
      <Tooltip>
        <TooltipTrigger render={<button type="button" className="inline-flex flex-col items-end gap-1 rounded-md text-right outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />}>
          <span className={cn("text-[0.9375rem] font-medium", (isCheapest || difference < 0) && "font-semibold text-destructive", difference > 0 && "font-semibold text-emerald-600 dark:text-emerald-400")}>{money(offer.price, offer.currency)}</span>
          {isBaseline ? <Badge variant="outline" >ราคาอ้างอิง</Badge> : difference == null ? <span className="text-xs text-muted-foreground">ไม่มีราคาอ้างอิง</span> : difference < 0 ? <Badge variant="destructive"><ArrowDown />ถูกกว่า {money(Math.abs(difference), offer.currency)}</Badge> : difference > 0 ? <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"><ArrowUp />แพงกว่า {money(difference, offer.currency)}</Badge> : <Badge variant="outline"><Minus />เท่ากัน</Badge>}
        </TooltipTrigger>
        <TooltipContent><div className="flex flex-col gap-1">{offer.currency === "USD" ? <><p>Sold: {number(offer.sold)}</p><p>Rating: {offer.rating == null ? "—" : number(offer.rating)}</p><p>Delivery: {offer.delivery || "—"}</p></> : <><p className="font-medium tabular-nums">{offer.unitPrice || "—"}</p><p>Stock: {offer.stockText || number(offer.stock)}</p><p>Trading volume: {number(offer.tradingVolume)}</p></>}</div></TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

function SortableSellerHeader({ seller, isBaseline }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: seller });
  // dnd-kit numbers aria-describedby from a module counter, so the server and the
  // client disagree and hydration tears the whole table down. Drop it.
  const { "aria-describedby": describedBy, ...dragAttributes } = attributes;
  return (
    <TableHead ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 }} {...dragAttributes} {...listeners} className={cn("sticky top-0 z-20 h-12 w-48 cursor-grab touch-none bg-card px-3 text-right active:cursor-grabbing", isBaseline && "bg-primary text-primary-foreground")} title="กดค้างแล้วลากเพื่อเปลี่ยนลำดับคอลัมน์">
      <span className="flex items-center justify-end gap-1.5"><GripVertical />{seller}</span>
    </TableHead>
  );
}
