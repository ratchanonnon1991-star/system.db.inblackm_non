// Unifies local (Postgres-backed) cards/orders with the live GoCash/Oxide
// slots into one shape the API/frontend can render without caring where the
// data came from.
import * as repo from "@/server/profit-repository";
import * as gocash from "@/server/profit-gocash";
import * as oxide from "@/server/profit-oxide";
import { CATEGORIES, getCategory } from "@/server/profit-categories";

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

// packCosts/overrides: bulk-fetched once per request (see computeGocashCards /
// cardDetail / gocashHistoryFeed) and passed down so a page rendering
// hundreds of GoCash rows only ever hits Postgres once for each, not once per
// row.
function gocashOrderView(row, packCosts, overrides) {
  const override = overrides[row.id] || null;
  const sale = override?.saleAmount || 0;
  const hasCostOverride = override != null && override.cost !== undefined && override.cost !== null;
  const packCost = row.packName != null ? packCosts[`gocash:${row.packName}`] : undefined;
  const cost = hasCostOverride ? override.cost : (packCost ?? 0);
  return {
    id: `gocash:${row.id}`,
    historyId: row.id,
    txid: row.orderId ? `#${row.orderId}` : `hist-${row.id}`,
    orderId: row.orderId,
    packName: row.packName,
    saleAmount: sale,
    cost,
    costFromPack: !hasCostOverride && packCost != null,
    profit: sale - cost,
    profitPct: profitPct(sale, cost),
    note: "",
    createdAt: row.createdAt,
    source: "gocash",
    editable: true,
    ledger: { in: row.oldBalance, out: row.deducted, remaining: row.newBalance },
  };
}

function summarizeOrders(orders) {
  const saleTotal = orders.reduce((s, o) => s + o.saleAmount, 0);
  const costTotal = orders.reduce((s, o) => s + o.cost, 0);
  const profitTotal = saleTotal - costTotal;
  const duplicateCount = orders.filter((o) => o.isDuplicate).length;
  return {
    orderCount: orders.length,
    saleTotal,
    costTotal,
    profitTotal,
    profitPct: profitPct(saleTotal, costTotal),
    duplicateCount,
  };
}

// Full GoCash card+order aggregation — the expensive part (joins every
// history row into its card, marks duplicates, sums totals). Factored out
// so categorySummaries() can compute it once per request and hand the same
// result to both 'gocash' and 'gocash-dust' instead of doing it twice.
async function computeGocashCards(categoryId) {
  const [cardRows, packCosts, overrides, dustCleared] = await Promise.all([
    gocash.listCards(),
    repo.getPackCosts(),
    repo.listGocashOverrides(),
    repo.listDustCleared(),
  ]);
  return cardRows.map((row) => {
    const orders = markDuplicates(
      row.rows.map((r) => gocashOrderView(r, packCosts, overrides)),
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
      ...summary,
      deductedTotal: row.deductedTotal,
      remaining: row.remaining,
      faceValue: gocash.FACE_VALUE,
      isDust,
      dustCleared: dustClearedFlag,
      needsDustClear: isDust && !dustClearedFlag,
      dustClearedAt: dustClearedFlag ? mark.clearedAt : null,
      dustClearedByName: dustClearedFlag ? mark.clearedByName : null,
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

// ── Cards within one category ────────────────────────────────────────────
export async function cardsForCategory(categoryId) {
  const category = getCategory(categoryId);
  if (!category) return [];

  if (category.source === "gocash") {
    return computeGocashCards(categoryId);
  }

  if (category.source === "oxide") {
    const cards = await oxide.listCards();
    const orders = await oxide.listOrdersForSerials(cards.map((c) => c.cardSerial));
    const bySerial = new Map();
    for (const o of orders) {
      if (!bySerial.has(o.cardSerial)) bySerial.set(o.cardSerial, []);
      bySerial.get(o.cardSerial).push(o);
    }
    return cards.map((c) => {
      const cardOrders = bySerial.get(c.cardSerial) || [];
      return {
        id: `oxide:${c.index}`,
        categoryId,
        slotIndex: c.slotIndex,
        cardSerial: c.cardSerial,
        cardPinMasked: c.cardPinMasked,
        name: c.cardSerial || `บัตร #${c.index + 1}`,
        note: "",
        status: c.enabled ? "active" : "closed",
        source: "oxide",
        editable: false,
        orderCount: cardOrders.length,
        saleTotal: 0,
        costTotal: 0,
        profitTotal: 0,
        profitPct: 0,
        deductedTotal: 0,
        duplicateCount: 0,
        remaining: 0,
        balancePoints: c.balancePoints,
        balanceUpdatedAt: c.balanceUpdatedAt,
        lastOrderAt: cardOrders.length ? cardOrders[cardOrders.length - 1].createdAt : null,
      };
    });
  }

  if (category.source === "gocash-dust") {
    return deriveDustCards(await computeGocashCards("gocash"), categoryId);
  }

  const cards = await repo.listCards(categoryId);
  return Promise.all(
    cards.map(async (card) => {
      const orders = markDuplicates(
        (await repo.listOrders(card.id)).map(localOrderView),
        (o) => o.txid
      );
      const summary = summarizeOrders(orders);
      return {
        id: card.id,
        categoryId,
        name: card.name,
        note: card.note,
        status: card.status,
        source: "manual",
        editable: true,
        openingBalance: card.openingBalance,
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
    const [rows, packCosts, overrides] = await Promise.all([
      gocash.listHistoryForCard(cardKey),
      repo.getPackCosts(),
      repo.listGocashOverrides(),
    ]);
    orders = markDuplicates(rows.map((r) => gocashOrderView(r, packCosts, overrides)), (o) => o.orderId);
  } else if (card.source === "oxide") {
    const rows = await oxide.listOrdersForSerials([card.cardSerial]);
    orders = rows.map((r) => ({
      id: `oxide-order:${r.id}`,
      txid: `#${r.id}`,
      packName: r.packName,
      priceUsdApprox: r.priceUsdApprox,
      createdAt: r.createdAt,
      source: "oxide",
    }));
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
  return { ...card, orders, dustClearLog };
}

// ── Category summaries + dashboard totals ────────────────────────────────
export async function categorySummaries() {
  const out = [];
  // Computed once and reused for 'gocash-dust' below — it's just a filtered
  // view of these same cards, so this halves the sidebar's per-request cost.
  let gocashCardsThisPass = null;
  for (const category of CATEGORIES) {
    let cards;
    if (category.source === "gocash") {
      gocashCardsThisPass = gocashCardsThisPass || await computeGocashCards(category.id);
      cards = gocashCardsThisPass;
    } else if (category.source === "gocash-dust") {
      gocashCardsThisPass = gocashCardsThisPass || await computeGocashCards("gocash");
      cards = deriveDustCards(gocashCardsThisPass, category.id);
    } else {
      cards = await cardsForCategory(category.id);
    }
    const cardSummary = summarizeOrders(cards.map((c) => ({ saleAmount: c.saleTotal, cost: c.costTotal, isDuplicate: false })));
    out.push({
      ...category,
      cardCount: cards.length,
      saleTotal: cardSummary.saleTotal,
      costTotal: cardSummary.costTotal,
      profitTotal: cardSummary.profitTotal,
      profitPct: cardSummary.profitPct,
      deductedTotal: cards.reduce((s, c) => s + c.deductedTotal, 0),
      remainingTotal: cards.reduce((s, c) => s + (c.remaining ?? 0), 0),
      duplicateCardCount: cards.filter((c) => c.duplicateCount > 0).length,
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
  const human = rollupCategories.filter((c) => c.group === "human");
  const bot = rollupCategories.filter((c) => c.group === "bot");

  const rollup = (list) => ({
    cardCount: totalOf(list, "cardCount"),
    saleTotal: totalOf(list, "saleTotal"),
    costTotal: totalOf(list, "costTotal"),
    profitTotal: totalOf(list, "profitTotal"),
    profitPct: profitPct(totalOf(list, "saleTotal"), totalOf(list, "costTotal")),
    deductedTotal: totalOf(list, "deductedTotal"),
    remainingTotal: totalOf(list, "remainingTotal"),
    duplicateCardCount: totalOf(list, "duplicateCardCount"),
  });

  return {
    totals: rollup(rollupCategories),
    human: rollup(human),
    bot: rollup(bot),
    categories: allCategories,
  };
}

// Flat GoCash history (newest first) so the category page can list every DB row.
export async function gocashHistoryFeed(cards = null) {
  const [rows, cardList, packCosts, overrides] = await Promise.all([
    gocash.getAllRows(),
    cards ? Promise.resolve(cards) : cardsForCategory("gocash"),
    repo.getPackCosts(),
    repo.listGocashOverrides(),
  ]);
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
    const view = gocashOrderView(row, packCosts, overrides);
    return {
      ...view,
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

  return [...byKey.values()];
}

// Lets the team set a cost once per pack instead of touching every
// individual order.
export async function packCostSummary() {
  const [known, packCosts] = await Promise.all([listKnownPacks(), repo.getPackCosts()]);
  return known
    .map((p) => ({ ...p, cost: packCosts[`${p.source}:${p.packName}`] ?? null }))
    .sort((a, b) => b.orderCount - a.orderCount);
}

// Reference price list for one resale platform (Kaleoz, USDT Russia, ...) —
// staff read this while typing the sale price into an actual order by hand;
// nothing here writes back into orders automatically, since no order record
// says which platform it was sold through.
export async function platformPackPrices(platform) {
  const [known, prices] = await Promise.all([listKnownPacks(), repo.getPlatformPrices(platform)]);
  return known
    .map((p) => ({ ...p, price: prices[`${p.source}:${p.packName}`] ?? null }))
    .sort((a, b) => b.orderCount - a.orderCount);
}

// Small overview across every platform at once -- how many of the known
// packs each one has priced, so the team can tell at a glance which
// platform (Kaleoz, USDT Russia, ...) still needs filling in.
export async function platformSummary() {
  const [known, counts] = await Promise.all([listKnownPacks(), repo.getPlatformPriceCounts()]);
  const totalPacks = known.length;
  return {
    totalPacks,
    platforms: counts.map((p) => ({ ...p, missingCount: totalPacks - p.pricedCount })),
  };
}
