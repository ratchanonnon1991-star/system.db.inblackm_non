// Pack Update: what PG2 changed since the last import (new packs, new
// prices, packs it stopped selling), checked by the bot and by a person
// before it goes into GameInfo. There is no PG2 API yet, so only PG2's side
// is made up: every GameInfo game is listed with its own name, image and
// priority, and its own packs and prices are the "ราคาเดิม". The same game
// always gets the same changes, so the page reads the same on every visit.

export const PACK_UPDATE_PRIORITIES = {
  1: { label: "ด่วน", color: "#d90005" },
  2: { label: "สูง", color: "#f97316" },
  3: { label: "ปกติ", color: "#0ea5e9" },
  4: { label: "ต่ำ", color: "#a1a1aa" },
};

// Listed removed → changed → new: the ones that need a decision come first.
export const PACK_UPDATE_TYPES = {
  removed: { label: "ถูกลบจาก PG2", tone: "bad", order: 0 },
  changed: { label: "ราคาเปลี่ยน", tone: "warn", order: 1 },
  new: { label: "ใหม่", tone: "info", order: 2 },
};

const UNITS = ["Diamonds", "Gems", "Crystals", "Coins", "Tokens", "Gold"];
const LADDER = [60, 120, 300, 500, 680, 980, 1280, 1980, 2580];

function hash(text) {
  let h = 2166136261;
  for (const char of String(text)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

function random(seed) {
  let h = hash(seed);
  return () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return h / 4294967296;
  };
}

const priceOf = (value) => Number(String(value ?? "").replace(/[^\d.]/g, "")) || 0;
const roundPrice = (value) => Math.max(1, Math.round(value));

/** The packs of a GameInfo pack tree as Pack Update reads them: id, name, price, in order. */
export function gameinfoPackUpdateSource(currencies) {
  return (currencies || [])
    .flatMap((currency) => (currency.categories || []).flatMap((category) => category.packs || []))
    .filter((pack) => String(pack.name || "").trim() || String(pack.price || "").trim())
    .map((pack) => ({ id: pack.id, name: pack.name || "", price: pack.price || "" }));
}

// New packs PG2 "added": bigger versions of the game's largest pack
// ("6480 Diamonds" → "12,960 Diamonds"), or a plain ladder for a game with none.
function newPackLabels(real, count, rnd, unitSeed) {
  const last = real[real.length - 1];
  const match = last ? /^([\d,.]+)\s*(.*)$/.exec(String(last.name).trim()) : null;
  const amount = match ? Number(match[1].replace(/,/g, "")) : 0;
  const lastPrice = priceOf(last?.price);
  if (amount > 0 && lastPrice > 0) {
    return Array.from({ length: count }, (_, index) => {
      const factor = index + 2;
      return { label: `${(amount * factor).toLocaleString("en-US")} ${match[2]}`.trim(), price: roundPrice(lastPrice * factor * (0.92 + rnd() * 0.06)) };
    });
  }
  if (last) {
    return Array.from({ length: count }, (_, index) => ({ label: `${last.name} (ใหม่ ${index + 1})`, price: roundPrice((lastPrice || 100) * (index + 2)) }));
  }
  const unit = UNITS[hash(unitSeed) % UNITS.length];
  const rate = 0.25 + rnd() * 0.35;
  return LADDER.slice(0, count).map((value) => ({ label: `${value.toLocaleString("en-US")} ${unit}`, price: Math.max(9, Math.round((value * rate) / 10) * 10 - 1) }));
}

function mockChanges(game, real) {
  const rnd = random(`pu:${game.gameId}:${real.length}`);
  const out = [];
  const pack = (type, label, old, pg2, sourceId = null) => {
    const base = { id: `${game.gameId}:${out.length}`, sourceId, type, label, old, pg2, web: pg2, bot: null, human: false, checkedBy: null, checkedAt: null, editedBy: null };
    if (type === "removed") return { ...base, web: old };
    // About one in eight is typed in wrong: a changed price left at the old
    // one, or a new pack's price off by a step.
    if (rnd() < 0.13) {
      const step = Math.max(1, Math.round(pg2 * (0.05 + rnd() * 0.1)));
      return { ...base, web: type === "changed" ? old : pg2 + (rnd() < 0.5 ? -step : step) };
    }
    return base;
  };
  for (const item of real) {
    const roll = rnd();
    const price = priceOf(item.price);
    if (real.length > 3 && roll < 0.06) out.push(pack("removed", item.name || "-", price || null, null, item.id));
    else if (price > 0 && roll < 0.2) {
      const move = 0.03 + rnd() * 0.09;
      out.push(pack("changed", item.name || "-", price, roundPrice(price * (rnd() < 0.65 ? 1 + move : 1 - move)), item.id));
    }
  }
  let added = real.length ? Math.floor(rnd() * 3) : 3 + Math.floor(rnd() * 5);
  if (!out.length && !added) added = 1;
  for (const item of newPackLabels(real, added, rnd, game.name)) out.push(pack("new", item.label, null, item.price));
  return out;
}

/**
 * Every GameInfo game, each with PG2's (made-up) changes to its real packs.
 * `packsByGame` is `{ [gameId]: [{ id, name, price }] }` in the editor's order.
 */
export function mockGameinfoPackUpdates(rows, packsByGame = {}) {
  return (rows || []).map((row) => {
    const real = packsByGame[row.id] || [];
    const stars = Number(row.priority) || 0;
    const game = {
      key: String(row.id),
      gameId: row.id,
      name: row.game || `เกม #${row.id}`,
      image: row.image || "",
      // ★★★ ด่วน · ★★ สูง · ★ ปกติ · none ต่ำ
      priority: stars >= 3 ? 1 : stars === 2 ? 2 : stars === 1 ? 3 : 4,
      packTotal: real.length,
    };
    const packs = mockChanges(game, real);
    return { ...game, packs, newCount: packs.filter((pack) => pack.type === "new").length };
  });
}

/** What the bot finds: PG2 stopped selling it, the web price matches PG2, or not. */
export function packUpdateBotResult(pack) {
  if (pack.type === "removed") return "gone";
  return pack.web === pack.pg2 ? "ok" : "bad";
}

export function packUpdateNeedsWork(pack) {
  return pack.bot === "bad" || (pack.type === "removed" && !pack.human);
}

export function summarizePackUpdate(packs, user = "") {
  const summary = { total: 0, ok: 0, bad: 0, gone: 0, wait: 0, human: 0, self: 0, new: 0, changed: 0, removed: 0 };
  for (const pack of packs) {
    summary.total += 1;
    summary[pack.bot || "wait"] += 1;
    summary[pack.type] += 1;
    if (pack.human) summary.human += 1;
    if (user && pack.editedBy === user) summary.self += 1;
  }
  return summary;
}

/**
 * The rules before an import: the bot has checked every pack, no price is
 * left wrong, a person has checked every pack (and confirmed each removal),
 * and whoever imports did not change a price in this round.
 */
export function packUpdateGate(packs, user = "") {
  const s = summarizePackUpdate(packs, user);
  return [
    { ok: s.wait === 0, label: "บอทตรวจราคาครบทุกแพ็ก", why: s.wait ? `เหลือ ${s.wait} แพ็ก` : "" },
    { ok: s.bad === 0, label: "ไม่มีราคาไม่ตรงค้างอยู่", why: s.bad ? `ไม่ตรง ${s.bad} แพ็ก` : "" },
    { ok: s.human === s.total, label: "คนตรวจครบ (รวมยืนยันปิดขายแพ็กที่ถูกลบ)", why: s.human < s.total ? `เหลือ ${s.total - s.human} แพ็ก` : "" },
    { ok: s.self === 0, label: "คนกดนำเข้าไม่ได้เป็นคนแก้ราคาในรอบนี้", why: s.self ? `${user} แก้ราคาไว้ ${s.self} แพ็ก — ให้อีกคนเป็นคนกดนำเข้า` : "" },
  ];
}

// What a person or the bot did, for the history page.
export const PACK_UPDATE_LOG_ACTIONS = {
  check: { label: "ตรวจแล้ว", tone: "ok" },
  close: { label: "ยืนยันปิดขาย", tone: "warn" },
  uncheck: { label: "ยกเลิกการตรวจ", tone: "plain" },
  price: { label: "แก้ราคา", tone: "info" },
  bot: { label: "บอทตรวจ", tone: "plain" },
  import: { label: "นำเข้าคลัง", tone: "bad" },
};

const SAVED_PACK_FIELDS = ["bot", "human", "checkedBy", "checkedAt", "web", "editedBy"];

/** The check state of every pack someone or the bot has touched, keyed by pack id. */
export function packUpdateSavedState(games) {
  const out = {};
  for (const game of games || []) {
    for (const pack of game.packs) {
      if (!pack.bot && !pack.human && !pack.editedBy) continue;
      out[pack.id] = Object.fromEntries(SAVED_PACK_FIELDS.map((field) => [field, pack[field] ?? null]));
    }
  }
  return out;
}

/** The games with saved check state put back on their packs (unknown ids are ignored). */
export function applyPackUpdateSavedState(games, saved) {
  if (!saved || typeof saved !== "object") return games;
  return games.map((game) => ({
    ...game,
    packs: game.packs.map((pack) => {
      const state = saved[pack.id];
      if (!state || typeof state !== "object") return pack;
      const next = { ...pack };
      for (const field of SAVED_PACK_FIELDS) if (field in state) next[field] = state[field];
      next.human = Boolean(next.human);
      return next;
    }),
  }));
}
