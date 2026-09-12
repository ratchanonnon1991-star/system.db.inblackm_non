// Unifies local (Postgres-backed) cards/orders with the live GoCash/Oxide/
// Wavepay slots into one shape the API/frontend can render without caring
// where the data came from.
import * as repo from "@/server/profit-repository";
import * as gocash from "@/server/profit-gocash";
import * as oxide from "@/server/profit-oxide";
import * as wavepay from "@/server/profit-wavepay";
import * as donshop from "@/server/profit-donshop";
import * as gamepoint from "@/server/profit-gamepoint";
import * as agenh2h from "@/server/profit-agenh2h";
import * as codareseller from "@/server/profit-codareseller";
import * as netease from "@/server/profit-netease";
import * as truemoney from "@/server/profit-truemoney";
import * as atom from "@/server/profit-atom";
import * as smartsun from "@/server/profit-smartsun";
import * as u9 from "@/server/profit-u9";
import { CATEGORIES, getCategory, legacyIdsFor } from "@/server/profit-categories";
import { fetchUsdThbRate } from "@/server/exchangerate-api";
import { listDetectedSalePlatforms, normalizeSalePlatform } from "@/server/profit-platform-normalize";

// The free tier of exchangerate-api.com only refreshes once every 24h, so
// re-fetching more often than this would just repeat the same number.
const USD_THB_RATE_STALE_MS = 12 * 60 * 60 * 1000;

// A Multi Game Card sitting on a balance with no order in this long is
// "idle" -- flagged onto the "ต้องรวมบัตร" worklist so staff can consolidate
// its leftover points onto an active card instead of it sitting unused.
const OXIDE_IDLE_MS = 12 * 60 * 60 * 1000;
// Dedupes concurrent refreshes the same way gameinfo-exchange-rates.js's
// refreshFlights map does, so a burst of page loads while the cached rate is
// stale doesn't fire the API once per request.
let usdThbRateRefresh = null;

// Keeps the USD->THB rate fresh from exchangerate-api.com without hitting it
// on every request -- only refetches when the cached value is missing/stale
// *and* was itself sourced from the API; a manual override is left alone
// until staff explicitly re-syncs (see syncUsdThbRateFromApi).
export async function ensureUsdThbRate() {
  const info = await repo.getUsdThbRateInfo();
  const stale = !info.updatedAt || Date.now() - new Date(info.updatedAt).getTime() > USD_THB_RATE_STALE_MS;
  if (!stale || info.source === "manual") return info;
  if (!usdThbRateRefresh) {
    usdThbRateRefresh = (async () => {
      try {
        const { rate } = await fetchUsdThbRate();
        await repo.setUsdThbRateFromApi(rate);
        return repo.getUsdThbRateInfo();
      } catch (error) {
        return { ...info, error: error instanceof Error ? error.message : "ดึงอัตราแลกเปลี่ยนไม่สำเร็จ" };
      }
    })().finally(() => {
      usdThbRateRefresh = null;
    });
  }
  return usdThbRateRefresh;
}

// Forces a fresh pull regardless of staleness -- the "ซิงค์จาก API" button.
export async function syncUsdThbRateFromApi() {
  const { rate } = await fetchUsdThbRate();
  await repo.setUsdThbRateFromApi(rate);
  return repo.getUsdThbRateInfo();
}

// cost (THB) = deducted(USD) * usdThbRate * gocashRate -- see the settings
// comment in profit-repository.js for what each factor means.
async function gocashEffectiveRate() {
  const [usdThb, gocashRate] = await Promise.all([
    ensureUsdThbRate().then((info) => info.rate),
    repo.getGocashRate(),
  ]);
  // usdThb is also needed on its own for russia_reseller USDT→THB sale
  // conversion (must NOT include the GoCash deal markup).
  return { effective: usdThb * gocashRate, usdThb };
}

function profitPct(sale, cost) {
  const profit = sale - cost;
  if (sale <= 0) return 0;
  return (profit / sale) * 100;
}

// Marks every occurrence after the first (per key) as a duplicate.
function markDuplicates(items, keyFn) {
  const seen = new Set();
  return items.map((item) => {
    const key = keyFn(item);
    if (key === null || key === undefined) return { ...item, isDuplicate: false };
    const dup = seen.has(key);
    seen.add(key);
    return { ...item, isDuplicate: dup };
  });
}

function localOrderView(order) {
  const profit = order.saleAmount - order.cost;
  return {
    id: order.id,
    txid: order.txid,
    saleAmount: order.saleAmount,
    cost: order.cost,
    profit,
    profitPct: profitPct(order.saleAmount, order.cost),
    note: order.note,
    createdAt: order.createdAt,
    source: "manual",
    editable: true,
    ledger: null,
  };
}

// Cost priority: a per-order override always wins; failing that, a per-pack
// default set on the "ตั้งค่าต้นทุนตามแพ็ก" page; failing that, the rate
// formula (deducted(USD) * effectiveRate, where effectiveRate = usdThbRate *
// gocashRate -- see gocashEffectiveRate below).
//
// Platform: codashop_orders.source (joined in via profit-gocash.js) already
// records which resale platform (kaleoz, russia_reseller, ...) the order
// sold through, when the team tagged it there -- that's authoritative, so it
// always wins over a manually-typed tag. Most historical rows were never
// tagged upstream, though, so a manual tag (profit_gocash_overrides.platform)
// fills the gap for those.
//
// Sale priority: same shape as cost -- a per-order override (a real,
// explicitly-entered amount) wins; failing that, the effective platform's
// reference price for this pack (from "ตั้งราคาขายตามแพ็ก"); failing that, 0.
//
// packCosts/platformPrices/platformFees/overrides are bulk-fetched once per
// request (see computeGocashCards / cardDetail / gocashHistoryFeed) and
// passed down so a page rendering hundreds of GoCash rows only ever hits
// Postgres once per lookup, not once per row.
//
// Product sheet column "USDT" / platform "USDT Russia" (russia_reseller) is
// priced in USDT (e.g. ZEPETO 14 ZEMs = 0.61), while every other platform
// price and all cost/profit math is THB. Convert at read time with the same
// plain USD:THB spot rate oxide russia costs already use (USDT ≈ USD).
// Reference sheet AND per-order overrides for this platform are USDT -- the
// history cell shows the entered USDT figure; profit uses the THB conversion.
const USDT_SALE_PLATFORMS = new Set(["russia_reseller"]);

function platformSaleThb(platform, rawSale, usdThbRate) {
  const n = Number(rawSale) || 0;
  if (!USDT_SALE_PLATFORMS.has(platform) || !(usdThbRate > 0)) {
    return { saleThb: n, saleUsdt: null };
  }
  // Sheet + per-order overrides for this platform are always USDT; convert
  // for profit, keep saleUsdt so the UI can show the number staff typed.
  return { saleThb: n * usdThbRate, saleUsdt: n };
}

// platformFees: some resale platforms (e.g. Kaleoz) take a cut of the listed
// sale price before the money actually lands. Per team convention, whatever's
// typed into "ตั้งราคาขายตามแพ็ก" for that platform is the full/gross listed
// price -- the system deducts the fee automatically before computing profit,
// so staff never have to do that math by hand. saleAmount itself stays the
// gross figure (what was actually typed in); only cost/profit math uses the
// fee-adjusted net.
function gocashOrderView(row, effectiveRate, packCosts, platformPrices, platformFees, overrides, usdThbRate) {
  const override = overrides[row.id] || null;
  const platform = row.platform || override?.platform || null;
  const hasSaleOverride = override != null && override.saleAmount > 0;
  const packKey = row.packName != null ? `gocash:${row.packName}` : null;
  const platformPrice = platform && packKey != null ? platformPrices[platform]?.[packKey] : undefined;
  const rawSale = hasSaleOverride ? override.saleAmount : platformPrice ?? 0;
  const { saleThb: sale, saleUsdt } = platformSaleThb(platform, rawSale, usdThbRate);
  const feePct = (platform && platformFees[platform]) || 0;
  const netSale = sale * (1 - feePct / 100);
  const hasCostOverride = override != null && override.cost !== undefined && override.cost !== null;
  const packCost = packKey != null ? packCosts[packKey] : undefined;
  const rateCost = row.deducted != null ? row.deducted * effectiveRate : 0;
  const cost = hasCostOverride ? override.cost : packCost ?? rateCost;
  const profit = netSale - cost;
  return {
    id: `gocash:${row.id}`,
    historyId: row.id,
    txid: row.orderId ? `#${row.orderId}` : `hist-${row.id}`,
    orderId: row.orderId,
    saleOrderId: row.saleOrderId || null,
    packName: row.packName,
    platform,
    platformFromDb: Boolean(row.platform),
    saleAmount: sale,
    saleAmountUsdt: saleUsdt,
    platformFeePct: feePct,
    saleFromPlatform: !hasSaleOverride && platformPrice != null,
    // Platform is known but nobody has priced this pack for it yet on
    // "ตั้งราคาขายตามแพ็ก" -- surfaced so staff know *why* sale shows 0
    // instead of assuming the auto-fill is broken.
    saleMissingPlatformPrice: !hasSaleOverride && platform != null && platformPrice == null,
    cost,
    costFromPack: !hasCostOverride && packCost != null,
    costFromRate: !hasCostOverride && packCost == null,
    profit,
    profitPct: sale > 0 ? (profit / sale) * 100 : 0,
    note: "",
    createdAt: row.createdAt,
    source: "gocash",
    editable: true,
    ledger: { in: row.oldBalance, out: row.deducted, remaining: row.newBalance },
    // Raw override baseline (not the blended/fallback value above) -- the
    // client echoes this back as `expected` when saving so the server can
    // tell whether someone else changed this exact field since this row was
    // loaded (see assertOverrideUnchanged in profit-repository.js).
    overrideSaleAmount: override ? override.saleAmount : null,
    overrideCost: override ? override.cost : null,
    overridePlatform: override ? override.platform : null,
  };
}

// Real per-order fulfillment cost -- telegram_orders_dev.price, joined in by
// profit-oxide.js. Two currencies mixed into that one column depending on
// which queue filled the order (confirmed against the team's own reference
// sheet): telegram_source "russia" quotes in USD, converted here with the
// plain USD:THB spot rate (same one GoCash's USD:THB display uses, no
// GoCash-specific deal markup); anything else (the "playerok-<id>" queue,
// telegram_source null) is already THB.
function oxideTelegramCostThb(order, usdThbRate) {
  if (order.telegramPrice == null) return null;
  return order.telegramSource === "russia" ? order.telegramPrice * usdThbRate : order.telegramPrice;
}

// Same cost/sale/platform priority as gocashOrderView above, for Multi Game
// Card (oxide) orders -- reuses the same per-pack cost / per-platform sale
// price tables (namespaced "oxide:<packName>" -- see listKnownPacks) and the
// same override-then-fallback shape. Cost priority: per-order override, then
// the per-pack default ("ตั้งค่าต้นทุนตามแพ็ก"), then the real fulfillment
// cost above (oxideTelegramCostThb) -- unlike GoCash's rate-based fallback
// (which needs a balance ledger this source doesn't have), this is real
// per-order data, not a formula. Only with none of those does cost fall to 0.
function oxideOrderView(order, packCosts, platformPrices, platformFees, overrides, usdThbRate) {
  const override = overrides[order.id] || null;
  const platform = order.platform || override?.platform || null;
  const hasSaleOverride = override != null && override.saleAmount > 0;
  const packKey = order.packName != null ? `oxide:${order.packName}` : null;
  const platformPrice = platform && packKey != null ? platformPrices[platform]?.[packKey] : undefined;
  const rawSale = hasSaleOverride ? override.saleAmount : platformPrice ?? 0;
  const { saleThb: sale, saleUsdt } = platformSaleThb(platform, rawSale, usdThbRate);
  const feePct = (platform && platformFees[platform]) || 0;
  const netSale = sale * (1 - feePct / 100);
  const hasCostOverride = override != null && override.cost !== undefined && override.cost !== null;
  const packCost = packKey != null ? packCosts[packKey] : undefined;
  const telegramCost = oxideTelegramCostThb(order, usdThbRate);
  const cost = hasCostOverride ? override.cost : packCost ?? telegramCost ?? 0;
  const profit = netSale - cost;
  return {
    id: `oxide-order:${order.id}`,
    orderId: order.id,
    txid: `#${order.id}`,
    saleOrderId: order.saleOrderId || null,
    gameName: order.gameName,
    packName: order.packName,
    platform,
    platformFromDb: Boolean(order.platform),
    saleAmount: sale,
    saleAmountUsdt: saleUsdt,
    platformFeePct: feePct,
    saleFromPlatform: !hasSaleOverride && platformPrice != null,
    saleMissingPlatformPrice: !hasSaleOverride && platform != null && platformPrice == null,
    cost,
    costFromPack: !hasCostOverride && packCost != null,
    costFromTelegram: !hasCostOverride && packCost == null && telegramCost != null,
    costMissing: !hasCostOverride && packCost == null && telegramCost == null,
    profit,
    profitPct: sale > 0 ? (profit / sale) * 100 : 0,
    priceUsdApprox: order.priceUsdApprox,
    invoiceTxnId: order.invoiceTxnId,
    telegramSource: order.telegramSource,
    createdAt: order.createdAt,
    cardSerial: order.cardSerial,
    // Points ledger for this specific order -- see the big comment on
    // profit-oxide.js's listOrdersForSerials for what this is and its one
    // caveat (concurrent redemptions on the same physical card). Null when
    // this particular order's provider_response didn't carry a molGameCard
    // reading (very rare -- confirmed 100% coverage on every currently
    // active card, but old/replaced cards' history was never back-audited).
    oldBalancePoints: order.oldBalancePoints,
    deductedPoints: order.deductedPoints,
    newBalancePoints: order.newBalancePoints,
    source: "oxide",
    editable: true,
    // Raw override baseline -- see the matching comment in gocashOrderView.
    overrideSaleAmount: override ? override.saleAmount : null,
    overrideCost: override ? override.cost : null,
    overridePlatform: override ? override.platform : null,
  };
}

// Same cost/sale/platform priority as gocashOrderView/oxideOrderView above,
// for WavePay orders -- reuses the same per-pack cost / per-platform sale
// price tables (namespaced "wavepay:<packName>" -- see listKnownPacks).
// Cost priority: per-order override, then the per-pack default
// ("ตั้งค่าต้นทุนตามแพ็ก"), then 0 -- unlike Oxide there's no real per-order
// THB fulfillment cost to fall back on (WavePay's own ledger is in Kyat,
// and there's no verified Kyat:THB rate in this system to convert it with),
// so an unpriced pack shows costMissing instead of a guessed number.
function wavepayOrderView(order, packCosts, platformPrices, platformFees, overrides, usdThbRate) {
  const override = overrides[order.id] || null;
  const platform = order.platform || override?.platform || null;
  const hasSaleOverride = override != null && override.saleAmount > 0;
  const packKey = order.packName != null ? `wavepay:${order.packName}` : null;
  const platformPrice = platform && packKey != null ? platformPrices[platform]?.[packKey] : undefined;
  const rawSale = hasSaleOverride ? override.saleAmount : platformPrice ?? 0;
  const { saleThb: sale, saleUsdt } = platformSaleThb(platform, rawSale, usdThbRate);
  const feePct = (platform && platformFees[platform]) || 0;
  const netSale = sale * (1 - feePct / 100);
  const hasCostOverride = override != null && override.cost !== undefined && override.cost !== null;
  const packCost = packKey != null ? packCosts[packKey] : undefined;
  const cost = hasCostOverride ? override.cost : packCost ?? 0;
  const profit = netSale - cost;
  return {
    id: `wavepay-order:${order.id}`,
    orderId: order.id,
    txid: `#${order.id}`,
    saleOrderId: order.saleOrderId || null,
    gameName: order.gameName,
    packName: order.packName,
    platform,
    platformFromDb: Boolean(order.platform),
    saleAmount: sale,
    saleAmountUsdt: saleUsdt,
    platformFeePct: feePct,
    saleFromPlatform: !hasSaleOverride && platformPrice != null,
    saleMissingPlatformPrice: !hasSaleOverride && platform != null && platformPrice == null,
    cost,
    costFromPack: !hasCostOverride && packCost != null,
    costMissing: !hasCostOverride && packCost == null,
    profit,
    profitPct: sale > 0 ? (profit / sale) * 100 : 0,
    invoiceTxnId: order.invoiceTxnId,
    createdAt: order.createdAt,
    account: order.account,
    // Real per-order Kyat ledger straight off the wallet API's own
    // response -- see profit-wavepay.js's getAllRows for what this is and
    // its one caveat (several games' bots share the same WavePay account,
    // so cross-order chaining can occasionally break -- ~11% of the time on
    // the busiest account, confirmed live). Kept separate from the THB
    // sale/cost/profit above -- Kyat isn't THB, so it's never summed into
    // those.
    oldBalanceKs: order.oldBalance,
    deductedKs: order.deducted,
    newBalanceKs: order.newBalance,
    packPriceKs: order.packPriceKs,
    source: "wavepay",
    editable: true,
    overrideSaleAmount: override ? override.saleAmount : null,
    overrideCost: override ? override.cost : null,
    overridePlatform: override ? override.platform : null,
  };
}

// U9 (Ooredoo) — same sale/cost/platform priority as wavepayOrderView,
// namespaced "u9:<packName>". Kyat amounts come from pack_price (balances
// are N/A on live U9 rows); never mixed into THB rollups.
function u9OrderView(order, packCosts, platformPrices, platformFees, overrides, usdThbRate) {
  const override = overrides[order.id] || null;
  const platform = order.platform || override?.platform || null;
  const hasSaleOverride = override != null && override.saleAmount > 0;
  const packKey = order.packName != null ? `u9:${order.packName}` : null;
  const platformPrice = platform && packKey != null ? platformPrices[platform]?.[packKey] : undefined;
  const rawSale = hasSaleOverride ? override.saleAmount : platformPrice ?? 0;
  const { saleThb: sale, saleUsdt } = platformSaleThb(platform, rawSale, usdThbRate);
  const feePct = (platform && platformFees[platform]) || 0;
  const netSale = sale * (1 - feePct / 100);
  const hasCostOverride = override != null && override.cost !== undefined && override.cost !== null;
  const packCost = packKey != null ? packCosts[packKey] : undefined;
  const cost = hasCostOverride ? override.cost : packCost ?? 0;
  const profit = netSale - cost;
  return {
    id: `u9-order:${order.id}`,
    orderId: order.id,
    txid: `#${order.id}`,
    saleOrderId: order.saleOrderId || null,
    gameName: order.gameName,
    packName: order.packName,
    platform,
    platformFromDb: Boolean(order.platform),
    saleAmount: sale,
    saleAmountUsdt: saleUsdt,
    platformFeePct: feePct,
    saleFromPlatform: !hasSaleOverride && platformPrice != null,
    saleMissingPlatformPrice: !hasSaleOverride && platform != null && platformPrice == null,
    cost,
    costFromPack: !hasCostOverride && packCost != null,
    costMissing: !hasCostOverride && packCost == null,
    profit,
    profitPct: sale > 0 ? (profit / sale) * 100 : 0,
    invoiceTxnId: order.invoiceTxnId,
    createdAt: order.createdAt,
    account: order.account,
    oldBalanceKs: order.oldBalance,
    deductedKs: order.deducted,
    newBalanceKs: order.newBalance,
    packPriceKs: order.packPriceKs,
    source: "u9",
    editable: true,
    overrideSaleAmount: override ? override.saleAmount : null,
    overrideCost: override ? override.cost : null,
    overridePlatform: override ? override.platform : null,
  };
}

// Shared order view for TrueMoney / ATOM / Smart-Sun (phone-account cards).
function phoneChannelOrderView(source, order, packCosts, platformPrices, platformFees, overrides, usdThbRate, amountKey) {
  const override = overrides[order.id] || null;
  const platform = order.platform || override?.platform || null;
  const hasSaleOverride = override != null && override.saleAmount > 0;
  const packKey = order.packName != null ? `${source}:${order.packName}` : null;
  const platformPrice = platform && packKey != null ? platformPrices[platform]?.[packKey] : undefined;
  const rawSale = hasSaleOverride ? override.saleAmount : platformPrice ?? 0;
  const { saleThb: sale, saleUsdt } = platformSaleThb(platform, rawSale, usdThbRate);
  const feePct = (platform && platformFees[platform]) || 0;
  const netSale = sale * (1 - feePct / 100);
  const hasCostOverride = override != null && override.cost !== undefined && override.cost !== null;
  const packCost = packKey != null ? packCosts[packKey] : undefined;
  const cost = hasCostOverride ? override.cost : packCost ?? 0;
  const profit = netSale - cost;
  return {
    id: `${source}-order:${order.id}`,
    orderId: order.id,
    txid: `#${order.id}`,
    saleOrderId: order.saleOrderId || null,
    gameName: order.gameName,
    packName: order.packName,
    platform,
    platformFromDb: Boolean(order.platform),
    saleAmount: sale,
    saleAmountUsdt: saleUsdt,
    platformFeePct: feePct,
    saleFromPlatform: !hasSaleOverride && platformPrice != null,
    saleMissingPlatformPrice: !hasSaleOverride && platform != null && platformPrice == null,
    cost,
    costFromPack: !hasCostOverride && packCost != null,
    costMissing: !hasCostOverride && packCost == null,
    profit,
    profitPct: sale > 0 ? (profit / sale) * 100 : 0,
    invoiceTxnId: order.invoiceTxnId,
    createdAt: order.createdAt,
    account: order.account,
    [amountKey]: order.deducted,
    packPriceLocal: order.packPrice,
    source,
    editable: true,
    overrideSaleAmount: override ? override.saleAmount : null,
    overrideCost: override ? override.cost : null,
    overridePlatform: override ? override.platform : null,
  };
}

function truemoneyOrderView(order, packCosts, platformPrices, platformFees, overrides, usdThbRate) {
  return phoneChannelOrderView("truemoney", order, packCosts, platformPrices, platformFees, overrides, usdThbRate, "deductedThb");
}

function atomOrderView(order, packCosts, platformPrices, platformFees, overrides, usdThbRate) {
  return phoneChannelOrderView("atom", order, packCosts, platformPrices, platformFees, overrides, usdThbRate, "deductedKs");
}

function smartsunOrderView(order, packCosts, platformPrices, platformFees, overrides, usdThbRate) {
  return phoneChannelOrderView("smartsun", order, packCosts, platformPrices, platformFees, overrides, usdThbRate, "deductedPhp");
}


// DonShopIDR is an IDR H2H API (no prepaid card). Same sale/platform
// priority as oxideOrderView (override → pack/platform price), but cost
// falls back ONLY to the per-pack THB default -- never to
// telegram_orders_dev.price. Itemku (and some other) queue quotes store
// marketplace IDR amounts in that column, so treating them as THB inflated
// totals by ~28M on the live feed. Same choice Wavepay already made
// (wavepayOrderView). fund_price / pack_price stay in IDR display columns
// and are never mixed into THB rollups.
function donshopOrderView(order, packCosts, platformPrices, platformFees, overrides, usdThbRate) {
  const override = overrides[order.id] || null;
  const platform = order.platform || override?.platform || null;
  const hasSaleOverride = override != null && override.saleAmount > 0;
  const packKey = order.packName != null ? `donshop:${order.packName}` : null;
  const platformPrice = platform && packKey != null ? platformPrices[platform]?.[packKey] : undefined;
  const rawSale = hasSaleOverride ? override.saleAmount : platformPrice ?? 0;
  const { saleThb: sale, saleUsdt } = platformSaleThb(platform, rawSale, usdThbRate);
  const feePct = (platform && platformFees[platform]) || 0;
  const netSale = sale * (1 - feePct / 100);
  const hasCostOverride = override != null && override.cost !== undefined && override.cost !== null;
  const packCost = packKey != null ? packCosts[packKey] : undefined;
  const cost = hasCostOverride ? override.cost : packCost ?? 0;
  const profit = netSale - cost;
  return {
    id: `donshop-order:${order.id}`,
    orderId: order.id,
    txid: `#${order.id}`,
    saleOrderId: order.saleOrderId || null,
    gameName: order.gameName,
    packName: order.packName,
    platform,
    platformFromDb: Boolean(order.platform),
    saleAmount: sale,
    saleAmountUsdt: saleUsdt,
    platformFeePct: feePct,
    saleFromPlatform: !hasSaleOverride && platformPrice != null,
    saleMissingPlatformPrice: !hasSaleOverride && platform != null && platformPrice == null,
    cost,
    costFromPack: !hasCostOverride && packCost != null,
    costMissing: !hasCostOverride && packCost == null,
    profit,
    profitPct: sale > 0 ? (profit / sale) * 100 : 0,
    invoiceNumber: order.invoiceNumber,
    voucher: order.voucher,
    createdAt: order.createdAt,
    // IDR wallet ledger from DonShop _worker_meta — not THB.
    oldBalanceIdr: order.oldBalanceIdr,
    deductedIdr: order.deductedIdr,
    newBalanceIdr: order.newBalanceIdr,
    fundPriceIdr: order.fundPriceIdr,
    packPriceIdr: order.packPriceIdr,
    apiPriceIdr: order.apiPriceIdr,
    source: "donshop",
    editable: true,
    overrideSaleAmount: override ? override.saleAmount : null,
    overrideCost: override ? override.cost : null,
    overridePlatform: override ? override.platform : null,
  };
}

// Game Point Club (MYR H2H API) — same THB sale/cost rules as Donshop; MYR
// wallet ledger stays in display columns and never mixes into baht rollups.
function gamepointOrderView(order, packCosts, platformPrices, platformFees, overrides, usdThbRate) {
  const override = overrides[order.id] || null;
  const platform = order.platform || override?.platform || null;
  const hasSaleOverride = override != null && override.saleAmount > 0;
  const packKey = order.packName != null ? `gamepoint:${order.packName}` : null;
  const platformPrice = platform && packKey != null ? platformPrices[platform]?.[packKey] : undefined;
  const rawSale = hasSaleOverride ? override.saleAmount : platformPrice ?? 0;
  const { saleThb: sale, saleUsdt } = platformSaleThb(platform, rawSale, usdThbRate);
  const feePct = (platform && platformFees[platform]) || 0;
  const netSale = sale * (1 - feePct / 100);
  const hasCostOverride = override != null && override.cost !== undefined && override.cost !== null;
  const packCost = packKey != null ? packCosts[packKey] : undefined;
  const cost = hasCostOverride ? override.cost : packCost ?? 0;
  const profit = netSale - cost;
  return {
    id: `gamepoint-order:${order.id}`,
    orderId: order.id,
    txid: `#${order.id}`,
    saleOrderId: order.saleOrderId || null,
    gameName: order.gameName,
    packName: order.packName,
    platform,
    platformFromDb: Boolean(order.platform),
    saleAmount: sale,
    saleAmountUsdt: saleUsdt,
    platformFeePct: feePct,
    saleFromPlatform: !hasSaleOverride && platformPrice != null,
    saleMissingPlatformPrice: !hasSaleOverride && platform != null && platformPrice == null,
    cost,
    costFromPack: !hasCostOverride && packCost != null,
    costMissing: !hasCostOverride && packCost == null,
    profit,
    profitPct: sale > 0 ? (profit / sale) * 100 : 0,
    referenceNo: order.referenceNo,
    itemLabel: order.itemLabel,
    createdAt: order.createdAt,
    oldBalanceMyr: order.oldBalanceMyr,
    deductedMyr: order.deductedMyr,
    newBalanceMyr: order.newBalanceMyr,
    storedCostMyr: order.storedCostMyr,
    source: "gamepoint",
    editable: true,
    overrideSaleAmount: override ? override.saleAmount : null,
    overrideCost: override ? override.cost : null,
    overridePlatform: override ? override.platform : null,
  };
}

// Agen H2H (IDR API) — same THB sale/cost rules as Donshop; IDR wallet ledger
// stays in display columns and never mixes into baht rollups.
function agenh2hOrderView(order, packCosts, platformPrices, platformFees, overrides, usdThbRate) {
  const override = overrides[order.id] || null;
  const platform = order.platform || override?.platform || null;
  const hasSaleOverride = override != null && override.saleAmount > 0;
  const packKey = order.packName != null ? `agenh2h:${order.packName}` : null;
  const platformPrice = platform && packKey != null ? platformPrices[platform]?.[packKey] : undefined;
  const rawSale = hasSaleOverride ? override.saleAmount : platformPrice ?? 0;
  const { saleThb: sale, saleUsdt } = platformSaleThb(platform, rawSale, usdThbRate);
  const feePct = (platform && platformFees[platform]) || 0;
  const netSale = sale * (1 - feePct / 100);
  const hasCostOverride = override != null && override.cost !== undefined && override.cost !== null;
  const packCost = packKey != null ? packCosts[packKey] : undefined;
  const cost = hasCostOverride ? override.cost : packCost ?? 0;
  const profit = netSale - cost;
  return {
    id: `agenh2h-order:${order.id}`,
    orderId: order.id,
    txid: `#${order.id}`,
    saleOrderId: order.saleOrderId || null,
    gameName: order.gameName,
    packName: order.packName,
    platform,
    platformFromDb: Boolean(order.platform),
    saleAmount: sale,
    saleAmountUsdt: saleUsdt,
    platformFeePct: feePct,
    saleFromPlatform: !hasSaleOverride && platformPrice != null,
    saleMissingPlatformPrice: !hasSaleOverride && platform != null && platformPrice == null,
    cost,
    costFromPack: !hasCostOverride && packCost != null,
    costMissing: !hasCostOverride && packCost == null,
    profit,
    profitPct: sale > 0 ? (profit / sale) * 100 : 0,
    invoiceNumber: order.invoiceNumber,
    refId: order.refId,
    serialNumber: order.serialNumber,
    createdAt: order.createdAt,
    oldBalanceIdr: order.oldBalanceIdr,
    deductedIdr: order.deductedIdr,
    newBalanceIdr: order.newBalanceIdr,
    source: "agenh2h",
    editable: true,
    overrideSaleAmount: override ? override.saleAmount : null,
    overrideCost: override ? override.cost : null,
    overridePlatform: override ? override.platform : null,
  };
}

// Codashop Reseller (USD API) — THB sale/cost like other H2H APIs; pack_price
// USD is display-only (no wallet balance ledger in provider_response).
function codaresellerOrderView(order, packCosts, platformPrices, platformFees, overrides, usdThbRate) {
  const override = overrides[order.id] || null;
  const platform = order.platform || override?.platform || null;
  const hasSaleOverride = override != null && override.saleAmount > 0;
  const packKey = order.packName != null ? `codareseller:${order.packName}` : null;
  const platformPrice = platform && packKey != null ? platformPrices[platform]?.[packKey] : undefined;
  const rawSale = hasSaleOverride ? override.saleAmount : platformPrice ?? 0;
  const { saleThb: sale, saleUsdt } = platformSaleThb(platform, rawSale, usdThbRate);
  const feePct = (platform && platformFees[platform]) || 0;
  const netSale = sale * (1 - feePct / 100);
  const hasCostOverride = override != null && override.cost !== undefined && override.cost !== null;
  const packCost = packKey != null ? packCosts[packKey] : undefined;
  const cost = hasCostOverride ? override.cost : packCost ?? 0;
  const profit = netSale - cost;
  return {
    id: `codareseller-order:${order.id}`,
    orderId: order.id,
    txid: `#${order.id}`,
    saleOrderId: order.saleOrderId || null,
    gameName: order.gameName,
    packName: order.packName,
    platform,
    platformFromDb: Boolean(order.platform),
    saleAmount: sale,
    saleAmountUsdt: saleUsdt,
    platformFeePct: feePct,
    saleFromPlatform: !hasSaleOverride && platformPrice != null,
    saleMissingPlatformPrice: !hasSaleOverride && platform != null && platformPrice == null,
    cost,
    costFromPack: !hasCostOverride && packCost != null,
    costMissing: !hasCostOverride && packCost == null,
    profit,
    profitPct: sale > 0 ? (profit / sale) * 100 : 0,
    invoiceNumber: order.invoiceNumber,
    skuIds: order.skuIds,
    createdAt: order.createdAt,
    oldBalanceUsd: order.oldBalanceUsd,
    deductedUsd: order.deductedUsd,
    newBalanceUsd: order.newBalanceUsd,
    packPriceRaw: order.packPriceRaw,
    source: "codareseller",
    editable: true,
    overrideSaleAmount: override ? override.saleAmount : null,
    overrideCost: override ? override.cost : null,
    overridePlatform: override ? override.platform : null,
  };
}

// Netease bot — THB sale/cost like other feeds; USD wallet ledger from
// netease_purchase_history stays display-only.
function neteaseOrderView(order, packCosts, platformPrices, platformFees, overrides, usdThbRate) {
  const override = overrides[order.id] || null;
  const platform = order.platform || override?.platform || null;
  const hasSaleOverride = override != null && override.saleAmount > 0;
  const packKey = order.packName != null ? `netease:${order.packName}` : null;
  const platformPrice = platform && packKey != null ? platformPrices[platform]?.[packKey] : undefined;
  const rawSale = hasSaleOverride ? override.saleAmount : platformPrice ?? 0;
  const { saleThb: sale, saleUsdt } = platformSaleThb(platform, rawSale, usdThbRate);
  const feePct = (platform && platformFees[platform]) || 0;
  const netSale = sale * (1 - feePct / 100);
  const hasCostOverride = override != null && override.cost !== undefined && override.cost !== null;
  const packCost = packKey != null ? packCosts[packKey] : undefined;
  const cost = hasCostOverride ? override.cost : packCost ?? 0;
  const profit = netSale - cost;
  return {
    id: `netease-order:${order.id}`,
    orderId: order.id,
    codaOrderId: order.codaOrderId,
    txid: order.codaOrderId != null ? `#${order.codaOrderId}` : `#N${order.id}`,
    saleOrderId: order.saleOrderId || null,
    gameName: order.gameName,
    packName: order.packName,
    platform,
    platformFromDb: Boolean(order.platform),
    saleAmount: sale,
    saleAmountUsdt: saleUsdt,
    platformFeePct: feePct,
    saleFromPlatform: !hasSaleOverride && platformPrice != null,
    saleMissingPlatformPrice: !hasSaleOverride && platform != null && platformPrice == null,
    cost,
    costFromPack: !hasCostOverride && packCost != null,
    costMissing: !hasCostOverride && packCost == null,
    profit,
    profitPct: sale > 0 ? (profit / sale) * 100 : 0,
    neteaseOrderNo: order.neteaseOrderNo,
    purchaseEmail: order.purchaseEmail,
    receiptUrl: order.receiptUrl,
    createdAt: order.createdAt,
    oldBalanceUsd: order.oldBalanceUsd,
    deductedUsd: order.deductedUsd,
    newBalanceUsd: order.newBalanceUsd,
    source: "netease",
    editable: true,
    overrideSaleAmount: override ? override.saleAmount : null,
    overrideCost: override ? override.cost : null,
    overridePlatform: override ? override.platform : null,
  };
}

// profitTotal sums each order's own .profit rather than saleTotal - costTotal
// -- with a platform fee in play (see gocashOrderView) those no longer
// agree, since profit is computed off the fee-adjusted net sale while
// saleTotal stays the gross figure.
function summarizeOrders(orders) {
  const saleTotal = orders.reduce((s, o) => s + o.saleAmount, 0);
  const costTotal = orders.reduce((s, o) => s + o.cost, 0);
  const profitTotal = orders.reduce((s, o) => s + (o.profit ?? o.saleAmount - o.cost), 0);
  const duplicateCount = orders.filter((o) => o.isDuplicate).length;
  return {
    orderCount: orders.length,
    saleTotal,
    costTotal,
    profitTotal,
    profitPct: saleTotal > 0 ? (profitTotal / saleTotal) * 100 : 0,
    duplicateCount,
  };
}

// Which game a GoCash card belongs to: an explicit per-card tag (see
// profit_gocash_card_games) wins; if the "gocash" channel has exactly one
// game defined -- true today ("sky"), and true for as long as this channel
// keeps servicing a single game -- every untagged card defaults to it
// automatically so nobody has to hand-tag 200+ existing cards. With zero or
// 2+ games and no tag, the card is left unassigned rather than silently
// guessing wrong.
function resolveGocashGame(cardId, cardGameTags, channelGames) {
  const taggedId = cardGameTags[cardId] || null;
  if (taggedId) {
    const game = channelGames.find((g) => g.id === taggedId);
    if (game) return { gameId: game.id, gameName: game.name, gameAuto: false };
  }
  if (channelGames.length === 1) {
    return { gameId: channelGames[0].id, gameName: channelGames[0].name, gameAuto: true };
  }
  return { gameId: null, gameName: null, gameAuto: false };
}

// Full GoCash card+order aggregation — the expensive part (joins every
// history row into its card, marks duplicates, sums totals). Factored out
// so categorySummaries() can compute it once per request and hand the same
// result to both 'gocash' and 'gocash-dust' instead of doing it twice.
async function computeGocashCards(categoryId) {
  const [cardRows, rates, packCosts, platformPrices, platformFees, overrides, dustCleared, duplicateReviewed, channelGames, cardGameTags] = await Promise.all([
    gocash.listCards(),
    gocashEffectiveRate(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listGocashOverrides(),
    repo.listDustCleared(),
    repo.listDuplicateReviewed(),
    repo.listChannelGames("gocash"),
    repo.listGocashCardGames(),
  ]);
  const { effective: effectiveRate, usdThb: usdThbRate } = rates;
  return cardRows.map((row) => {
    const orders = markDuplicates(
      row.rows.map((r) => gocashOrderView(r, effectiveRate, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.orderId
    );
    const summary = summarizeOrders(orders);
    const id = `gocash:${row.cardKey}`;
    const isDust = row.remaining > 0 && row.remaining < gocash.DUST_THRESHOLD;
    const mark = dustCleared[id] || null;
    // A mark only counts if no order has landed on this card since it was made —
    // new activity means the dust situation needs a fresh look.
    const dustClearedFlag = Boolean(mark?.clearedAt)
      && (!row.lastOrderAt || new Date(row.lastOrderAt) <= new Date(mark.clearedAt));
    // Same "counts only until new activity" rule for duplicate-order review --
    // a new order after the mark could be a fresh duplicate, so it needs a
    // fresh look instead of staying dismissed forever.
    const reviewMark = duplicateReviewed[id] || null;
    const duplicateReviewedFlag = Boolean(reviewMark?.reviewedAt)
      && (!row.lastOrderAt || new Date(row.lastOrderAt) <= new Date(reviewMark.reviewedAt));
    const { gameId, gameName, gameAuto } = resolveGocashGame(id, cardGameTags, channelGames);
    return {
      id,
      categoryId,
      slotIndex: row.slotIndex,
      cardSerial: row.cardSerial,
      name: row.cardSerial || (row.slotIndex == null ? "GoCash (ไม่มี serial)" : `Slot ${row.slotIndex}`),
      note: row.cardSerial ? `Serial ${row.cardSerial}` : "",
      status: "active",
      source: "gocash",
      editable: false,
      gameId,
      gameName,
      gameAuto,
      ...summary,
      deductedTotal: row.deductedTotal,
      remaining: row.remaining,
      faceValue: gocash.FACE_VALUE,
      isDust,
      dustCleared: dustClearedFlag,
      needsDustClear: isDust && !dustClearedFlag,
      dustClearedAt: dustClearedFlag ? mark.clearedAt : null,
      dustClearedByName: dustClearedFlag ? mark.clearedByName : null,
      duplicateReviewed: duplicateReviewedFlag,
      needsDuplicateReview: summary.duplicateCount > 0 && !duplicateReviewedFlag,
      duplicateReviewedAt: duplicateReviewedFlag ? reviewMark.reviewedAt : null,
      duplicateReviewedByName: duplicateReviewedFlag ? reviewMark.reviewedByName : null,
      lastOrderAt: row.lastOrderAt,
      orderIds: [...new Set(orders.map((o) => o.orderId).filter(Boolean))],
    };
  });
}

// Filters a computed GoCash card list down to the dust-clearing worklist.
function deriveDustCards(gocashCards, categoryId) {
  return gocashCards
    .filter((c) => c.isDust)
    .map((c) => ({ ...c, categoryId }))
    .sort((a, b) => {
      if (a.needsDustClear !== b.needsDustClear) return a.needsDustClear ? -1 : 1;
      return new Date(b.lastOrderAt || 0) - new Date(a.lastOrderAt || 0);
    });
}

// Full Multi Game Card (oxide) card+order aggregation, mirroring
// computeGocashCards above -- fetches the shared cost/sale tables once per
// request instead of once per card.
async function computeOxideCards(categoryId) {
  const [cards, packCosts, platformPrices, platformFees, overrides, usdThbRate, mergeCleared] = await Promise.all([
    oxide.listCards(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listOxideOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
    repo.listOxideMergeCleared(),
  ]);
  const rawOrders = await oxide.listOrdersForSerials(cards.map((c) => c.cardSerial));
  const bySerial = new Map();
  for (const o of rawOrders) {
    if (!bySerial.has(o.cardSerial)) bySerial.set(o.cardSerial, []);
    bySerial.get(o.cardSerial).push(o);
  }
  return cards.map((c) => {
    const cardOrders = markDuplicates(
      (bySerial.get(c.cardSerial) || []).map((o) => oxideOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.invoiceTxnId
    );
    // A MultiGameCard isn't dedicated to one game -- it tops up whichever
    // games it was used for, per order.gameName (real DB data).
    const gameNames = [...new Set(cardOrders.map((o) => o.gameName).filter(Boolean))].sort();
    const summary = summarizeOrders(cardOrders);
    // Sum of each order's own real points ledger (see oxideOrderView) --
    // kept separate from the money-based deductedTotal/remaining fields
    // below (which stay 0 for oxide -- those feed the dashboard's shared USD
    // rollups, and points aren't USD) so this never gets summed into that.
    const deductedPointsTotal = cardOrders.reduce((s, o) => s + (o.deductedPoints || 0), 0);
    const id = `oxide:${c.index}`;
    const lastOrderAt = cardOrders.length ? cardOrders[cardOrders.length - 1].createdAt : null;
    // Idle = holding a balance with no order in the last 12h (or never
    // ordered at all) -- a card with 0 points has nothing worth
    // consolidating even if it's been sitting untouched.
    const isIdle = (c.balancePoints || 0) > 0
      && (!lastOrderAt || Date.now() - new Date(lastOrderAt).getTime() > OXIDE_IDLE_MS);
    const mark = mergeCleared[id] || null;
    // Same "counts only until new activity" rule as GoCash's dust-cleared —
    // a mark only holds until the card takes another order.
    const mergeClearedFlag = Boolean(mark?.clearedAt)
      && (!lastOrderAt || new Date(lastOrderAt) <= new Date(mark.clearedAt));
    return {
      id,
      categoryId,
      slotIndex: c.slotIndex,
      cardSerial: c.cardSerial,
      cardPinMasked: c.cardPinMasked,
      name: c.cardSerial || `บัตร #${c.index + 1}`,
      note: "",
      status: c.enabled ? "active" : "closed",
      source: "oxide",
      editable: false,
      gameNames,
      ...summary,
      deductedTotal: 0,
      remaining: 0,
      deductedPointsTotal,
      balancePoints: c.balancePoints,
      balanceUpdatedAt: c.balanceUpdatedAt,
      isIdle,
      mergeCleared: mergeClearedFlag,
      needsMerge: isIdle && !mergeClearedFlag,
      mergeClearedAt: mergeClearedFlag ? mark.clearedAt : null,
      mergeClearedByName: mergeClearedFlag ? mark.clearedByName : null,
      lastOrderAt,
    };
  });
}

// Filters a computed Multi Game Card list down to the "ต้องรวมบัตร"
// consolidation worklist -- same idea as deriveDustCards above.
function deriveOxideMergeCards(oxideCards, categoryId) {
  return oxideCards
    .filter((c) => c.isIdle)
    .map((c) => ({ ...c, categoryId }))
    .sort((a, b) => {
      if (a.needsMerge !== b.needsMerge) return a.needsMerge ? -1 : 1;
      return new Date(a.lastOrderAt || 0) - new Date(b.lastOrderAt || 0);
    });
}

// Full WavePay card+order aggregation, mirroring computeOxideCards above --
// "card" here is one WavePay wallet account, shared across whichever games'
// bots draw from it (see profit-wavepay.js).
async function computeWavepayCards(categoryId) {
  const [accounts, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    wavepay.listAccounts(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listWavepayOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const rawOrders = await wavepay.listOrdersForAccounts(accounts.map((a) => a.account));
  const byAccount = new Map();
  for (const o of rawOrders) {
    if (!byAccount.has(o.account)) byAccount.set(o.account, []);
    byAccount.get(o.account).push(o);
  }
  return accounts.map((a) => {
    const cardOrders = markDuplicates(
      (byAccount.get(a.account) || []).map((o) => wavepayOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.invoiceTxnId
    );
    // Not dedicated to one game -- see profit-wavepay.js's comment on why
    // one account funds several games at once.
    const gameNames = [...new Set(cardOrders.map((o) => o.gameName).filter(Boolean))].sort();
    const summary = summarizeOrders(cardOrders);
    // Sum of each order's own real Kyat ledger -- kept separate from the
    // money-based deductedTotal/remaining fields below (which stay 0 for
    // WavePay, same reasoning as Oxide's points: Kyat isn't THB, so this
    // never gets summed into the dashboard's THB rollups).
    const deductedKsTotal = cardOrders.reduce((s, o) => s + (o.deductedKs || 0), 0);
    return {
      id: `wavepay:${a.account}`,
      categoryId,
      cardSerial: a.account,
      name: a.account,
      note: "",
      status: "active",
      source: "wavepay",
      editable: false,
      gameNames,
      ...summary,
      deductedTotal: 0,
      remaining: 0,
      deductedKsTotal,
      balanceKs: a.lastBalanceKs,
      lastOrderAt: a.lastOrderAt,
    };
  });
}

async function computeU9Cards(categoryId) {
  const [accounts, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    u9.listAccounts(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listU9Overrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const rawOrders = await u9.listOrdersForAccounts(accounts.map((a) => a.account));
  const byAccount = new Map();
  for (const o of rawOrders) {
    if (!byAccount.has(o.account)) byAccount.set(o.account, []);
    byAccount.get(o.account).push(o);
  }
  return accounts.map((a) => {
    const cardOrders = markDuplicates(
      (byAccount.get(a.account) || []).map((o) => u9OrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.invoiceTxnId
    );
    const gameNames = [...new Set(cardOrders.map((o) => o.gameName).filter(Boolean))].sort();
    const summary = summarizeOrders(cardOrders);
    const deductedKsTotal = cardOrders.reduce((s, o) => s + (o.deductedKs || 0), 0);
    return {
      id: `u9:${a.account}`,
      categoryId,
      cardSerial: a.account,
      name: a.account,
      note: "",
      status: "active",
      source: "u9",
      editable: false,
      gameNames,
      ...summary,
      deductedTotal: 0,
      remaining: 0,
      deductedKsTotal,
      balanceKs: a.lastBalanceKs,
      lastOrderAt: a.lastOrderAt,
    };
  });
}

async function computePhoneChannelCards(categoryId, source, feed, listOverrides, orderView, amountTotalKey) {
  const [accounts, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    feed.listAccounts(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    listOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const rawOrders = await feed.listOrdersForAccounts(accounts.map((a) => a.account));
  const byAccount = new Map();
  for (const o of rawOrders) {
    if (!byAccount.has(o.account)) byAccount.set(o.account, []);
    byAccount.get(o.account).push(o);
  }
  return accounts.map((a) => {
    const cardOrders = markDuplicates(
      (byAccount.get(a.account) || []).map((o) => orderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.invoiceTxnId
    );
    const gameNames = [...new Set(cardOrders.map((o) => o.gameName).filter(Boolean))].sort();
    const summary = summarizeOrders(cardOrders);
    const amountField = amountTotalKey.replace(/Total$/, "");
    const deductedSum = cardOrders.reduce((sum, o) => sum + (o[amountField] || 0), 0);
    return {
      id: `${source}:${a.account}`,
      categoryId,
      cardSerial: a.account,
      name: a.account,
      note: "",
      status: "active",
      source,
      editable: false,
      gameNames,
      ...summary,
      deductedTotal: 0,
      remaining: 0,
      [amountTotalKey]: deductedSum,
      lastOrderAt: a.lastOrderAt,
    };
  });
}

async function computeTruemoneyCards(categoryId) {
  return computePhoneChannelCards(categoryId, "truemoney", truemoney, repo.listTruemoneyOverrides, truemoneyOrderView, "deductedThbTotal");
}
async function computeAtomCards(categoryId) {
  return computePhoneChannelCards(categoryId, "atom", atom, repo.listAtomOverrides, atomOrderView, "deductedKsTotal");
}
async function computeSmartsunCards(categoryId) {
  return computePhoneChannelCards(categoryId, "smartsun", smartsun, repo.listSmartsunOverrides, smartsunOrderView, "deductedPhpTotal");
}


// Full DonShop card+order aggregation -- "card" here is one game the API
// has topped up (no prepaid serial / wallet account exists for DonShopIDR).
async function computeDonshopCards(categoryId) {
  const [games, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    donshop.listGames(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listDonshopOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const rawOrders = await donshop.listOrdersForGames(games.map((g) => g.gameName));
  const byGame = new Map();
  for (const o of rawOrders) {
    const key = donshop.gameKey(o.gameName);
    if (!byGame.has(key)) byGame.set(key, []);
    byGame.get(key).push(o);
  }
  return games.map((g) => {
    const cardOrders = markDuplicates(
      (byGame.get(g.gameName) || []).map((o) => donshopOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.saleOrderId || o.invoiceNumber
    );
    const summary = summarizeOrders(cardOrders);
    const deductedIdrTotal = Math.round(cardOrders.reduce((s, o) => s + (o.deductedIdr || 0), 0));
    return {
      id: `donshop:${g.gameName}`,
      categoryId,
      cardSerial: g.gameName,
      name: g.gameName,
      note: "",
      status: "active",
      source: "donshop",
      editable: false,
      gameNames: [g.gameName],
      ...summary,
      deductedTotal: 0,
      remaining: 0,
      deductedIdrTotal,
      lastOrderAt: g.lastOrderAt,
    };
  });
}

// Full Game Point Club card+order aggregation — "card" = one game (no phone /
// prepaid serial; shared MYR wallet across games).
async function computeGamepointCards(categoryId) {
  const [games, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    gamepoint.listGames(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listGamepointOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const rawOrders = await gamepoint.listOrdersForGames(games.map((g) => g.gameName));
  const byGame = new Map();
  for (const o of rawOrders) {
    const key = gamepoint.gameKey(o.gameName);
    if (!byGame.has(key)) byGame.set(key, []);
    byGame.get(key).push(o);
  }
  return games.map((g) => {
    const cardOrders = markDuplicates(
      (byGame.get(g.gameName) || []).map((o) => gamepointOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.saleOrderId || o.referenceNo
    );
    const summary = summarizeOrders(cardOrders);
    const deductedMyrTotal = Math.round(cardOrders.reduce((s, o) => s + (o.deductedMyr || 0), 0) * 100) / 100;
    return {
      id: `gamepoint:${g.gameName}`,
      categoryId,
      cardSerial: g.gameName,
      name: g.gameName,
      note: "",
      status: "active",
      source: "gamepoint",
      editable: false,
      gameNames: [g.gameName],
      ...summary,
      deductedTotal: 0,
      remaining: 0,
      deductedMyrTotal,
      lastOrderAt: g.lastOrderAt,
    };
  });
}

// Full Agen H2H card+order aggregation — "card" = one game (IDR H2H API).
async function computeAgenh2hCards(categoryId) {
  const [games, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    agenh2h.listGames(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listAgenh2hOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const rawOrders = await agenh2h.listOrdersForGames(games.map((g) => g.gameName));
  const byGame = new Map();
  for (const o of rawOrders) {
    const key = agenh2h.gameKey(o.gameName);
    if (!byGame.has(key)) byGame.set(key, []);
    byGame.get(key).push(o);
  }
  return games.map((g) => {
    const cardOrders = markDuplicates(
      (byGame.get(g.gameName) || []).map((o) => agenh2hOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.saleOrderId || o.invoiceNumber || o.refId
    );
    const summary = summarizeOrders(cardOrders);
    const deductedIdrTotal = Math.round(cardOrders.reduce((s, o) => s + (o.deductedIdr || 0), 0));
    return {
      id: `agenh2h:${g.gameName}`,
      categoryId,
      cardSerial: g.gameName,
      name: g.gameName,
      note: "",
      status: "active",
      source: "agenh2h",
      editable: false,
      gameNames: [g.gameName],
      ...summary,
      deductedTotal: 0,
      remaining: 0,
      deductedIdrTotal,
      lastOrderAt: g.lastOrderAt,
    };
  });
}

// Full Codareseller card+order aggregation — "card" = one game (USD reseller API).
async function computeCodaresellerCards(categoryId) {
  const [games, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    codareseller.listGames(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listCodaresellerOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const rawOrders = await codareseller.listOrdersForGames(games.map((g) => g.gameName));
  const byGame = new Map();
  for (const o of rawOrders) {
    const key = codareseller.gameKey(o.gameName);
    if (!byGame.has(key)) byGame.set(key, []);
    byGame.get(key).push(o);
  }
  return games.map((g) => {
    const cardOrders = markDuplicates(
      (byGame.get(g.gameName) || []).map((o) => codaresellerOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.saleOrderId || o.invoiceNumber
    );
    const summary = summarizeOrders(cardOrders);
    const deductedUsdTotal = Math.round(cardOrders.reduce((s, o) => s + (o.deductedUsd || 0), 0) * 100) / 100;
    return {
      id: `codareseller:${g.gameName}`,
      categoryId,
      cardSerial: g.gameName,
      name: g.gameName,
      note: "",
      status: "active",
      source: "codareseller",
      editable: false,
      gameNames: [g.gameName],
      ...summary,
      deductedTotal: 0,
      remaining: 0,
      deductedUsdTotal,
      lastOrderAt: g.lastOrderAt,
    };
  });
}

// Full Netease card+order aggregation — "card" = one game.
async function computeNeteaseCards(categoryId) {
  const [games, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    netease.listGames(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listNeteaseOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const rawOrders = await netease.listOrdersForGames(games.map((g) => g.gameName));
  const byGame = new Map();
  for (const o of rawOrders) {
    const key = netease.gameKey(o.gameName);
    if (!byGame.has(key)) byGame.set(key, []);
    byGame.get(key).push(o);
  }
  return games.map((g) => {
    const cardOrders = markDuplicates(
      (byGame.get(g.gameName) || []).map((o) => neteaseOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.saleOrderId || o.neteaseOrderNo
    );
    const summary = summarizeOrders(cardOrders);
    const deductedUsdTotal = Math.round(cardOrders.reduce((s, o) => s + (o.deductedUsd || 0), 0) * 100) / 100;
    return {
      id: `netease:${g.gameName}`,
      categoryId,
      cardSerial: g.gameName,
      name: g.gameName,
      note: "",
      status: "active",
      source: "netease",
      editable: false,
      gameNames: [g.gameName],
      ...summary,
      deductedTotal: 0,
      remaining: 0,
      deductedUsdTotal,
      lastOrderAt: g.lastOrderAt,
    };
  });
}

// ── Cards within one category ────────────────────────────────────────────
export async function cardsForCategory(categoryId) {
  const category = getCategory(categoryId);
  if (!category) return [];
  const id = category.id;

  if (category.source === "gocash") {
    return computeGocashCards(id);
  }

  if (category.source === "oxide") {
    return computeOxideCards(id);
  }

  if (category.source === "gocash-dust") {
    return deriveDustCards(await computeGocashCards("gocash"), id);
  }

  if (category.source === "oxide-merge") {
    return deriveOxideMergeCards(await computeOxideCards("oxide"), id);
  }

  if (category.source === "wavepay") {
    return computeWavepayCards(id);
  }

  if (category.source === "u9") {
    return computeU9Cards(id);
  }

  if (category.source === "truemoney") {
    return computeTruemoneyCards(id);
  }

  if (category.source === "atom") {
    return computeAtomCards(id);
  }

  if (category.source === "smartsun") {
    return computeSmartsunCards(id);
  }

  if (category.source === "donshop") {
    return computeDonshopCards(id);
  }

  if (category.source === "gamepoint") {
    return computeGamepointCards(id);
  }

  if (category.source === "agenh2h") {
    return computeAgenh2hCards(id);
  }

  if (category.source === "codareseller") {
    return computeCodaresellerCards(id);
  }

  if (category.source === "netease") {
    return computeNeteaseCards(id);
  }

  // Manual channels: also load cards still stored under a renamed legacy id
  // (e.g. unipin → u9) so old entries don't vanish after the Bot/API regroup.
  const loadIds = [id, ...legacyIdsFor(id)];
  const [cardLists, games] = await Promise.all([
    Promise.all(loadIds.map((cid) => repo.listCards(cid))),
    repo.listChannelGames(id),
  ]);
  const cards = cardLists.flat();
  const gameNameById = new Map(games.map((g) => [g.id, g.name]));
  return Promise.all(
    cards.map(async (card) => {
      const orders = markDuplicates(
        (await repo.listOrders(card.id)).map(localOrderView),
        (o) => o.txid
      );
      const summary = summarizeOrders(orders);
      return {
        id: card.id,
        categoryId: id,
        name: card.name,
        note: card.note,
        status: card.status,
        source: "manual",
        editable: true,
        openingBalance: card.openingBalance,
        gameId: card.gameId,
        gameName: card.gameId ? gameNameById.get(card.gameId) || null : null,
        ...summary,
        deductedTotal: card.deductedOverride ?? summary.saleTotal,
        lastOrderAt: orders.length ? orders[orders.length - 1].createdAt : null,
      };
    })
  );
}

// ── Single card + its orders ─────────────────────────────────────────────
export async function cardDetail(categoryId, cardId) {
  const cards = await cardsForCategory(categoryId);
  const card = cards.find((c) => c.id === cardId);
  if (!card) return null;

  let orders;
  if (card.source === "gocash") {
    const cardKey = cardId.split(":").slice(1).join(":");
    const [rows, rates, packCosts, platformPrices, platformFees, overrides] = await Promise.all([
      gocash.listHistoryForCard(cardKey),
      gocashEffectiveRate(),
      repo.getPackCosts(),
      repo.getAllPlatformPrices(),
      repo.getAllPlatformFees(),
      repo.listGocashOverrides(),
    ]);
    const { effective: effectiveRate, usdThb: usdThbRate } = rates;
    orders = markDuplicates(
      rows.map((r) => ({ ...gocashOrderView(r, effectiveRate, packCosts, platformPrices, platformFees, overrides, usdThbRate), game: card.gameName })),
      (o) => o.orderId
    );
  } else if (card.source === "oxide") {
    const [rows, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
      oxide.listOrdersForSerials([card.cardSerial]),
      repo.getPackCosts(),
      repo.getAllPlatformPrices(),
      repo.getAllPlatformFees(),
      repo.listOxideOverrides(),
      ensureUsdThbRate().then((info) => info.rate),
    ]);
    orders = markDuplicates(
      rows.map((r) => oxideOrderView(r, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.invoiceTxnId
    );
  } else if (card.source === "wavepay") {
    const [rows, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
      wavepay.listOrdersForAccounts([card.cardSerial]),
      repo.getPackCosts(),
      repo.getAllPlatformPrices(),
      repo.getAllPlatformFees(),
      repo.listWavepayOverrides(),
      ensureUsdThbRate().then((info) => info.rate),
    ]);
    orders = markDuplicates(
      rows.map((r) => wavepayOrderView(r, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.invoiceTxnId
    );
  } else if (card.source === "u9") {
    const [rows, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
      u9.listOrdersForAccounts([card.cardSerial]),
      repo.getPackCosts(),
      repo.getAllPlatformPrices(),
      repo.getAllPlatformFees(),
      repo.listU9Overrides(),
      ensureUsdThbRate().then((info) => info.rate),
    ]);
    orders = markDuplicates(
      rows.map((r) => u9OrderView(r, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.invoiceTxnId
    );
  } else if (card.source === "truemoney") {
    const [rows, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
      truemoney.listOrdersForAccounts([card.cardSerial]),
      repo.getPackCosts(),
      repo.getAllPlatformPrices(),
      repo.getAllPlatformFees(),
      repo.listTruemoneyOverrides(),
      ensureUsdThbRate().then((info) => info.rate),
    ]);
    orders = markDuplicates(
      rows.map((r) => truemoneyOrderView(r, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.invoiceTxnId
    );
  } else if (card.source === "atom") {
    const [rows, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
      atom.listOrdersForAccounts([card.cardSerial]),
      repo.getPackCosts(),
      repo.getAllPlatformPrices(),
      repo.getAllPlatformFees(),
      repo.listAtomOverrides(),
      ensureUsdThbRate().then((info) => info.rate),
    ]);
    orders = markDuplicates(
      rows.map((r) => atomOrderView(r, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.invoiceTxnId
    );
  } else if (card.source === "smartsun") {
    const [rows, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
      smartsun.listOrdersForAccounts([card.cardSerial]),
      repo.getPackCosts(),
      repo.getAllPlatformPrices(),
      repo.getAllPlatformFees(),
      repo.listSmartsunOverrides(),
      ensureUsdThbRate().then((info) => info.rate),
    ]);
    orders = markDuplicates(
      rows.map((r) => smartsunOrderView(r, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.invoiceTxnId
    );
  } else if (card.source === "donshop") {
    const [rows, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
      donshop.listOrdersForGames([card.cardSerial]),
      repo.getPackCosts(),
      repo.getAllPlatformPrices(),
      repo.getAllPlatformFees(),
      repo.listDonshopOverrides(),
      ensureUsdThbRate().then((info) => info.rate),
    ]);
    orders = markDuplicates(
      rows.map((r) => donshopOrderView(r, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.saleOrderId || o.invoiceNumber
    );
  } else if (card.source === "gamepoint") {
    const [rows, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
      gamepoint.listOrdersForGames([card.cardSerial]),
      repo.getPackCosts(),
      repo.getAllPlatformPrices(),
      repo.getAllPlatformFees(),
      repo.listGamepointOverrides(),
      ensureUsdThbRate().then((info) => info.rate),
    ]);
    orders = markDuplicates(
      rows.map((r) => gamepointOrderView(r, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.saleOrderId || o.referenceNo
    );
  } else if (card.source === "agenh2h") {
    const [rows, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
      agenh2h.listOrdersForGames([card.cardSerial]),
      repo.getPackCosts(),
      repo.getAllPlatformPrices(),
      repo.getAllPlatformFees(),
      repo.listAgenh2hOverrides(),
      ensureUsdThbRate().then((info) => info.rate),
    ]);
    orders = markDuplicates(
      rows.map((r) => agenh2hOrderView(r, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.saleOrderId || o.invoiceNumber || o.refId
    );
  } else if (card.source === "codareseller") {
    const [rows, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
      codareseller.listOrdersForGames([card.cardSerial]),
      repo.getPackCosts(),
      repo.getAllPlatformPrices(),
      repo.getAllPlatformFees(),
      repo.listCodaresellerOverrides(),
      ensureUsdThbRate().then((info) => info.rate),
    ]);
    orders = markDuplicates(
      rows.map((r) => codaresellerOrderView(r, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.saleOrderId || o.invoiceNumber
    );
  } else if (card.source === "netease") {
    const [rows, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
      netease.listOrdersForGames([card.cardSerial]),
      repo.getPackCosts(),
      repo.getAllPlatformPrices(),
      repo.getAllPlatformFees(),
      repo.listNeteaseOverrides(),
      ensureUsdThbRate().then((info) => info.rate),
    ]);
    orders = markDuplicates(
      rows.map((r) => neteaseOrderView(r, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
      (o) => o.saleOrderId || o.neteaseOrderNo
    );
  } else {
    const raw = await repo.listOrders(cardId); // already sorted ascending by createdAt
    let running = card.openingBalance || 0;
    const withLedger = raw.map((o) => {
      const view = localOrderView(o);
      const inBal = running;
      const remaining = running - o.saleAmount;
      running = remaining;
      view.ledger = { in: inBal, out: o.saleAmount, remaining };
      return view;
    });
    orders = markDuplicates(withLedger, (o) => o.txid);
  }
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const dustClearLog = card.source === "gocash" ? await repo.listDustClearLog(cardId) : [];
  const duplicateReviewLog = card.source === "gocash" ? await repo.listDuplicateReviewLog(cardId) : [];
  const mergeClearLog = card.source === "oxide" ? await repo.listOxideMergeClearLog(cardId) : [];
  return { ...card, orders, dustClearLog, duplicateReviewLog, mergeClearLog };
}

// Per-source balance / deducted figures for the dashboard overview cards.
// Uses each card's native unit (USD, points, Ks, etc.) — not mixed into totals.
function sumCardField(cards, key) {
  return cards.reduce((s, c) => s + (Number(c[key]) || 0), 0);
}

function categoryStockFields(cards, source) {
  switch (source) {
    case "gocash":
    case "gocash-dust":
      return {
        stock: { label: "คงเหลือ", value: sumCardField(cards, "remaining"), unit: "usd" },
        deducted: { label: "ยอดตัด", value: sumCardField(cards, "deductedTotal"), unit: "usd" },
      };
    case "oxide":
    case "oxide-merge":
      return {
        stock: { label: "คงเหลือ", value: sumCardField(cards, "balancePoints"), unit: "points" },
      };
    case "wavepay":
      return {
        stock: { label: "คงเหลือ", value: sumCardField(cards, "balanceKs"), unit: "kyat" },
        deducted: { label: "ยอดตัด", value: sumCardField(cards, "deductedKsTotal"), unit: "kyat" },
      };
    case "u9":
      return {
        stock: { label: "คงเหลือ", value: sumCardField(cards, "balanceKs"), unit: "kyat" },
        deducted: { label: "ยอดตัด", value: sumCardField(cards, "deductedKsTotal"), unit: "kyat" },
      };
    case "truemoney":
      return {
        deducted: { label: "ยอดตัด", value: sumCardField(cards, "deductedThbTotal"), unit: "thb" },
      };
    case "atom":
      return {
        deducted: { label: "ยอดตัด", value: sumCardField(cards, "deductedKsTotal"), unit: "kyat" },
      };
    case "smartsun":
      return {
        deducted: { label: "ยอดตัด", value: sumCardField(cards, "deductedPhpTotal"), unit: "php" },
      };
    case "donshop":
      return {
        deducted: { label: "ยอดตัด", value: sumCardField(cards, "deductedIdrTotal"), unit: "idr" },
      };
    case "gamepoint":
      return {
        deducted: { label: "ยอดตัด", value: sumCardField(cards, "deductedMyrTotal"), unit: "myr" },
      };
    case "agenh2h":
      return {
        deducted: { label: "ยอดตัด", value: sumCardField(cards, "deductedIdrTotal"), unit: "idr" },
      };
    case "codareseller":
    case "netease":
      return {
        deducted: { label: "ยอดตัด", value: sumCardField(cards, "deductedUsdTotal"), unit: "usd" },
      };
    default:
      return {};
  }
}

// ── Category summaries + dashboard totals ────────────────────────────────
export async function categorySummaries() {
  const out = [];
  // Computed once and reused for 'gocash-dust'/'oxide-merge' below — each is
  // just a filtered view of these same cards, so this halves the sidebar's
  // per-request cost.
  let gocashCardsThisPass = null;
  let oxideCardsThisPass = null;
  for (const category of CATEGORIES) {
    let cards;
    if (category.source === "gocash") {
      gocashCardsThisPass = gocashCardsThisPass || await computeGocashCards(category.id);
      cards = gocashCardsThisPass;
    } else if (category.source === "gocash-dust") {
      gocashCardsThisPass = gocashCardsThisPass || await computeGocashCards("gocash");
      cards = deriveDustCards(gocashCardsThisPass, category.id);
    } else if (category.source === "oxide") {
      oxideCardsThisPass = oxideCardsThisPass || await computeOxideCards(category.id);
      cards = oxideCardsThisPass;
    } else if (category.source === "oxide-merge") {
      oxideCardsThisPass = oxideCardsThisPass || await computeOxideCards("oxide");
      cards = deriveOxideMergeCards(oxideCardsThisPass, category.id);
    } else {
      cards = await cardsForCategory(category.id);
    }
    const cardSummary = summarizeOrders(
      cards.map((c) => ({ saleAmount: c.saleTotal, cost: c.costTotal, profit: c.profitTotal, isDuplicate: false }))
    );
    out.push({
      ...category,
      cardCount: cards.length,
      saleTotal: cardSummary.saleTotal,
      costTotal: cardSummary.costTotal,
      profitTotal: cardSummary.profitTotal,
      profitPct: cardSummary.profitPct,
      deductedTotal: cards.reduce((s, c) => s + c.deductedTotal, 0),
      remainingTotal: cards.reduce((s, c) => s + (c.remaining ?? 0), 0),
      duplicateCardCount: cards.filter((c) => c.duplicateCount > 0 && !c.duplicateReviewed).length,
      ...categoryStockFields(cards, category.source),
    });
  }
  return out;
}

export async function dashboardSummary() {
  const allCategories = await categorySummaries();
  // gocash-dust is a filtered view of the 'gocash' category's own cards, not
  // a separate source of money — drop it here so its totals aren't counted
  // twice in the rollups below. It (and Oxide, different currency) still
  // shows up in the per-category table returned as `categories` — just not
  // added into these sums.
  const rollupCategories = allCategories.filter((c) => !c.excludeFromTotals);
  const totalOf = (list, key) => list.reduce((s, c) => s + c[key], 0);
  const bot = rollupCategories.filter((c) => c.group === "bot");
  const api = rollupCategories.filter((c) => c.group === "api");

  const rollup = (list) => {
    const saleTotal = totalOf(list, "saleTotal");
    const profitTotal = totalOf(list, "profitTotal");
    return {
      cardCount: totalOf(list, "cardCount"),
      saleTotal,
      costTotal: totalOf(list, "costTotal"),
      profitTotal,
      profitPct: saleTotal > 0 ? (profitTotal / saleTotal) * 100 : 0,
      deductedTotal: totalOf(list, "deductedTotal"),
      remainingTotal: totalOf(list, "remainingTotal"),
      duplicateCardCount: totalOf(list, "duplicateCardCount"),
    };
  };

  return {
    totals: rollup(rollupCategories),
    bot: rollup(bot),
    api: rollup(api),
    categories: allCategories,
  };
}

// Flat GoCash history (newest first) so the category page can list every DB row.
export async function gocashHistoryFeed(cards = null) {
  const [rows, cardList, rates, packCosts, platformPrices, platformFees, overrides] = await Promise.all([
    gocash.getAllRows(),
    cards ? Promise.resolve(cards) : cardsForCategory("gocash"),
    gocashEffectiveRate(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listGocashOverrides(),
  ]);
  const { effective: effectiveRate, usdThb: usdThbRate } = rates;
  const byCard = new Map(cardList.map((c) => [c.id, c]));
  const dupIds = new Set();
  const seen = new Set();
  for (const row of rows) {
    if (row.orderId == null) continue;
    if (seen.has(row.orderId)) dupIds.add(row.id);
    else seen.add(row.orderId);
  }
  const newestFirst = [...rows].reverse();
  return newestFirst.map((row) => {
    const card = byCard.get(`gocash:${gocash.cardKey(row.cardSerial, row.slotIndex)}`);
    const view = gocashOrderView(row, effectiveRate, packCosts, platformPrices, platformFees, overrides, usdThbRate);
    return {
      ...view,
      game: card?.gameName || null,
      cardId: card?.id || null,
      cardName: card?.name || (row.slotIndex == null ? "-" : `Slot ${row.slotIndex}`),
      slotIndex: row.slotIndex,
      cardSerial: row.cardSerial,
      isDuplicate: dupIds.has(row.id),
      deducted: row.deducted,
      oldBalance: row.oldBalance,
      newBalance: row.newBalance,
    };
  });
}

// Flat Multi Game Card (oxide) history (newest first) -- same idea as
// gocashHistoryFeed above, sale/cost computed the same way (see
// oxideOrderView), just with the flat feed's own card lookup joined in.
export async function oxideHistoryFeed() {
  const [cards, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    oxide.listCards(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listOxideOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const bySerial = new Map(cards.map((c) => [c.cardSerial, c]));
  const orders = await oxide.listOrdersForSerials(cards.map((c) => c.cardSerial));
  const views = markDuplicates(
    orders.map((o) => oxideOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
    (o) => o.invoiceTxnId
  );
  return views
    .map((view) => {
      const card = bySerial.get(view.cardSerial);
      return {
        ...view,
        cardId: card ? `oxide:${card.index}` : null,
        cardName: view.cardSerial || (card?.slotIndex != null ? `Slot ${card.slotIndex}` : "-"),
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Flat WavePay history (newest first) -- same idea as oxideHistoryFeed
// above, sale/cost computed the same way (see wavepayOrderView).
export async function wavepayHistoryFeed() {
  const [accounts, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    wavepay.listAccounts(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listWavepayOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const orders = await wavepay.listOrdersForAccounts(accounts.map((a) => a.account));
  const views = markDuplicates(
    orders.map((o) => wavepayOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
    (o) => o.invoiceTxnId
  );
  return views
    .map((view) => ({
      ...view,
      cardId: `wavepay:${view.account}`,
      cardName: view.account,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function u9HistoryFeed() {
  const [accounts, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    u9.listAccounts(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listU9Overrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const orders = await u9.listOrdersForAccounts(accounts.map((a) => a.account));
  const views = markDuplicates(
    orders.map((o) => u9OrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
    (o) => o.invoiceTxnId
  );
  return views
    .map((view) => ({
      ...view,
      cardId: `u9:${view.account}`,
      cardName: view.account,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function phoneChannelHistoryFeed(source, feed, listOverrides, orderView) {
  const [accounts, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    feed.listAccounts(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    listOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const orders = await feed.listOrdersForAccounts(accounts.map((a) => a.account));
  const views = markDuplicates(
    orders.map((o) => orderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
    (o) => o.invoiceTxnId
  );
  return views
    .map((view) => ({
      ...view,
      cardId: `${source}:${view.account}`,
      cardName: view.account,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function truemoneyHistoryFeed() {
  return phoneChannelHistoryFeed("truemoney", truemoney, repo.listTruemoneyOverrides, truemoneyOrderView);
}
export async function atomHistoryFeed() {
  return phoneChannelHistoryFeed("atom", atom, repo.listAtomOverrides, atomOrderView);
}
export async function smartsunHistoryFeed() {
  return phoneChannelHistoryFeed("smartsun", smartsun, repo.listSmartsunOverrides, smartsunOrderView);
}

// Flat DonShop history (newest first) -- same idea as wavepayHistoryFeed.
export async function donshopHistoryFeed() {
  const [games, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    donshop.listGames(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listDonshopOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const orders = await donshop.listOrdersForGames(games.map((g) => g.gameName));
  const views = markDuplicates(
    orders.map((o) => donshopOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
    (o) => o.saleOrderId || o.invoiceNumber
  );
  return views
    .map((view) => ({
      ...view,
      cardId: `donshop:${view.gameName || "unknown"}`,
      cardName: view.gameName || "unknown",
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Flat Game Point Club history (newest first) — same idea as donshopHistoryFeed.
export async function gamepointHistoryFeed() {
  const [games, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    gamepoint.listGames(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listGamepointOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const orders = await gamepoint.listOrdersForGames(games.map((g) => g.gameName));
  const views = markDuplicates(
    orders.map((o) => gamepointOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
    (o) => o.saleOrderId || o.referenceNo
  );
  return views
    .map((view) => ({
      ...view,
      cardId: `gamepoint:${view.gameName || "unknown"}`,
      cardName: view.gameName || "unknown",
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Flat Agen H2H history (newest first).
export async function agenh2hHistoryFeed() {
  const [games, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    agenh2h.listGames(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listAgenh2hOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const orders = await agenh2h.listOrdersForGames(games.map((g) => g.gameName));
  const views = markDuplicates(
    orders.map((o) => agenh2hOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
    (o) => o.saleOrderId || o.invoiceNumber || o.refId
  );
  return views
    .map((view) => ({
      ...view,
      cardId: `agenh2h:${view.gameName || "unknown"}`,
      cardName: view.gameName || "unknown",
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Flat Codareseller history (newest first).
export async function codaresellerHistoryFeed() {
  const [games, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    codareseller.listGames(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listCodaresellerOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const orders = await codareseller.listOrdersForGames(games.map((g) => g.gameName));
  const views = markDuplicates(
    orders.map((o) => codaresellerOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
    (o) => o.saleOrderId || o.invoiceNumber
  );
  return views
    .map((view) => ({
      ...view,
      cardId: `codareseller:${view.gameName || "unknown"}`,
      cardName: view.gameName || "unknown",
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Flat Netease history (newest first).
export async function neteaseHistoryFeed() {
  const [games, packCosts, platformPrices, platformFees, overrides, usdThbRate] = await Promise.all([
    netease.listGames(),
    repo.getPackCosts(),
    repo.getAllPlatformPrices(),
    repo.getAllPlatformFees(),
    repo.listNeteaseOverrides(),
    ensureUsdThbRate().then((info) => info.rate),
  ]);
  const orders = await netease.listOrdersForGames(games.map((g) => g.gameName));
  const views = markDuplicates(
    orders.map((o) => neteaseOrderView(o, packCosts, platformPrices, platformFees, overrides, usdThbRate)),
    (o) => o.saleOrderId || o.neteaseOrderNo
  );
  return views
    .map((view) => ({
      ...view,
      cardId: `netease:${view.gameName || "unknown"}`,
      cardName: view.gameName || "unknown",
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// GoCash's cards are 100% dedicated to this one game — sky_gocash_history
// carries no game column of its own, so this is a fixed label, not a guess.
const GOCASH_GAME_NAME = "Sky: Children of the Light";

// One row per distinct (source, pack_name) ever seen across every card
// system, namespaced by source so two different games reusing a generic
// pack name (e.g. "PREMIUM") never collide. Shared base for both the cost
// list (one true cost per pack) and the per-platform sale-price list (same
// packs, priced differently per resale platform).
async function listKnownPacks() {
  const byKey = new Map();
  const bump = (source, game, packName) => {
    if (!packName) return;
    const key = `${source}:${packName}`;
    if (!byKey.has(key)) byKey.set(key, { source, game, packName, orderCount: 0 });
    byKey.get(key).orderCount += 1;
  };

  const gocashRows = await gocash.getAllRows();
  for (const r of gocashRows) bump("gocash", GOCASH_GAME_NAME, r.packName);

  const oxideCards = await oxide.listCards();
  const oxideOrders = await oxide.listOrdersForSerials(oxideCards.map((c) => c.cardSerial));
  for (const o of oxideOrders) bump("oxide", o.gameName || "Oxide", o.packName);

  const wavepayOrders = await wavepay.getAllRows();
  for (const o of wavepayOrders) bump("wavepay", o.gameName || "Wavepay", o.packName);

  const u9Orders = await u9.getAllRows();
  for (const o of u9Orders) bump("u9", o.gameName || "U9", o.packName);

  const truemoneyOrders = await truemoney.getAllRows();
  for (const o of truemoneyOrders) bump("truemoney", o.gameName || "TrueMoney", o.packName);

  const atomOrders = await atom.getAllRows();
  for (const o of atomOrders) bump("atom", o.gameName || "ATOM", o.packName);

  const smartsunOrders = await smartsun.getAllRows();
  for (const o of smartsunOrders) bump("smartsun", o.gameName || "Smart-Sun", o.packName);

  const donshopOrders = await donshop.getAllRows();
  for (const o of donshopOrders) bump("donshop", o.gameName || "Donshop", o.packName);

  const gamepointOrders = await gamepoint.getAllRows();
  for (const o of gamepointOrders) bump("gamepoint", o.gameName || "Gamepoint", o.packName);

  const agenh2hOrders = await agenh2h.getAllRows();
  for (const o of agenh2hOrders) bump("agenh2h", o.gameName || "Agenh2h", o.packName);

  const codaresellerOrders = await codareseller.getAllRows();
  for (const o of codaresellerOrders) bump("codareseller", o.gameName || "Codareseller", o.packName);

  const neteaseOrders = await netease.getAllRows();
  for (const o of neteaseOrders) bump("netease", o.gameName || "Netease", o.packName);

  return [...byKey.values()];
}

// Lets the team set a cost once per pack instead of touching every
// individual order. For GoCash this is a fallback below the per-order
// override but above the rate formula -- see gocashOrderView's cost
// priority comment.
export async function packCostSummary() {
  const [known, packCosts] = await Promise.all([listKnownPacks(), repo.getPackCosts()]);
  return known
    .map((p) => ({ ...p, cost: packCosts[`${p.source}:${p.packName}`] ?? null }))
    .sort((a, b) => b.orderCount - a.orderCount);
}

// Reference price list for one resale platform (Kaleoz, USDT Russia, ...).
// For GoCash orders this also feeds the sale-price fallback in
// gocashOrderView -- once an order's platform is known (from codashop_orders
// or a manual tag), its sale price is pulled straight from here instead of
// always being typed in by hand.
//
// orderCount here is scoped to *this* platform (how many orders actually
// sold through it), not the pack's total across every source -- otherwise
// every platform's page would show the same number and there'd be no way to
// tell how much each platform actually sold. Oxide has no platform tagging
// yet, so its packs always show 0 here (accurate: there's no data saying
// which platform they went through), unlike packCostSummary's orderCount
// which stays the untagged grand total since cost isn't platform-specific.
export async function platformPackPrices(platform) {
  const [known, prices, gocashRows] = await Promise.all([listKnownPacks(), repo.getPlatformPrices(platform), gocash.getAllRows()]);
  const orderCountByPack = {};
  for (const r of gocashRows) {
    if (r.platform !== platform || !r.packName) continue;
    const key = `gocash:${r.packName}`;
    orderCountByPack[key] = (orderCountByPack[key] || 0) + 1;
  }
  return known
    .map((p) => {
      const key = `${p.source}:${p.packName}`;
      return { ...p, orderCount: orderCountByPack[key] || 0, price: prices[key] ?? null };
    })
    .sort((a, b) => b.orderCount - a.orderCount);
}

// Small overview across every platform at once -- how many of the known
// packs each one has priced, so the team can tell at a glance which
// platform (Kaleoz, USDT Russia, ...) still needs filling in. Also surfaces
// platforms nobody has priced a single pack for yet, as long as any
// completed codashop order (any payment method) has been tagged with them.
export async function platformSummary() {
  const [known, counts, detectedList] = await Promise.all([
    listKnownPacks(),
    repo.getPlatformPriceCounts(),
    listDetectedSalePlatforms(),
  ]);
  const totalPacks = known.length;
  const pricedCountByPlatform = new Map();
  for (const p of counts) {
    const key = normalizeSalePlatform(p.platform) || p.platform;
    pricedCountByPlatform.set(key, (pricedCountByPlatform.get(key) || 0) + p.pricedCount);
  }
  const detected = new Set(detectedList);
  for (const platform of detected) {
    if (!pricedCountByPlatform.has(platform)) pricedCountByPlatform.set(platform, 0);
  }
  const platforms = [...pricedCountByPlatform.entries()]
    .map(([platform, pricedCount]) => ({
      platform,
      pricedCount,
      missingCount: totalPacks - pricedCount,
      autoDetected: detected.has(platform),
    }))
    .sort((a, b) => a.platform.localeCompare(b.platform));
  return { totalPacks, platforms };
}

