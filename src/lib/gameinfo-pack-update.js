// Pack Update: what PG2 changed since the last import (new packs, new
// prices, packs it stopped selling), checked by the bot and by a person
// before it goes into GameInfo. There is no PG2 API yet, so the changes are
// made up here: the games are GameInfo's own (name, image), a few new ones
// are added, and every pack figure is invented. The same game always gets
// the same changes, so the server render and the browser agree.

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
const LADDER = [60, 120, 300, 500, 680, 980, 1280, 1980, 2580, 3280, 4280, 6480, 8080, 9980, 12960, 16480];
const SMALL = [30, 90, 250, 420, 800, 1500];
// Games PG2 has that GameInfo does not yet.
const NEW_GAMES = [
  ["Starfall Odyssey", 12, 2], ["Mecha Rush", 6, 3], ["Dragon Lore M", 9, 2], ["Neon Drift", 3, 4],
  ["Kingdom Tactics", 8, 3], ["Pixel Knights", 10, 2], ["Shadow Hunter X", 14, 1], ["Thunder Squad", 9, 1],
];

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

function mockPacks(game, newCount, existing) {
  const rnd = random(`${game.pg}:${game.name}`);
  const unit = UNITS[hash(game.name) % UNITS.length];
  const rate = 0.25 + rnd() * 0.35;
  let index = 0;
  const make = (amount, type) => {
    const pg2 = Math.max(9, Math.round((amount * rate) / 10) * 10 - 1);
    const step = Math.max(10, Math.round(pg2 * (0.05 + rnd() * 0.15)));
    const base = { id: `${game.pg}:${index++}`, type, label: `${amount.toLocaleString("en-US")} ${unit}`, bot: null, human: false, checkedBy: null, checkedAt: null, editedBy: null };
    if (type === "removed") return { ...base, old: pg2, pg2: null, web: pg2 };
    const old = type === "changed" ? pg2 + (rnd() < 0.7 ? -step : step) : null;
    // About one in eight is typed in wrong: a changed price left at the old
    // one, or a new pack's price off by a step.
    const wrong = rnd() < 0.13;
    return { ...base, old, pg2, web: wrong ? (type === "changed" ? old : pg2 + (rnd() < 0.5 ? -step : step)) : pg2 };
  };
  const removed = existing ? Math.floor(rnd() * 3) : 0;
  const changed = existing ? 1 + Math.floor(rnd() * 3) : 0;
  return [
    ...SMALL.slice(0, removed).map((amount) => make(amount, "removed")),
    ...SMALL.slice(removed, removed + changed).map((amount) => make(amount, "changed")),
    ...LADDER.slice(0, newCount).map((amount) => make(amount, "new")),
  ];
}

/**
 * The pending updates for these GameInfo rows: about one game in three
 * (up to `limit`), each with GameInfo's name and image, plus the new games.
 */
export function mockGameinfoPackUpdates(rows, { limit = 14 } = {}) {
  const picked = [...(rows || [])]
    .filter((row) => hash(`pu:${row.id}`) % 3 === 0)
    .sort((a, b) => a.id - b.id)
    .slice(0, limit)
    .map((row) => {
      const rnd = random(`pu-row:${row.id}`);
      const stars = Number(row.priority) || 0;
      return {
        pg: String(100 + Number(row.id)),
        gameId: row.id,
        name: row.game || `เกม #${row.id}`,
        image: row.image || "",
        newCount: 1 + Math.floor(rnd() * 11),
        // A ★★★ game's update is urgent; the rest spread over สูง–ต่ำ.
        priority: stars >= 3 ? 1 : 2 + Math.floor(rnd() * 3),
      };
    });
  const fresh = NEW_GAMES.map(([name, newCount, priority], index) => ({
    pg: String(412 + index * 3),
    gameId: null,
    name,
    image: "",
    newCount,
    priority,
  }));
  return [...picked, ...fresh].map((game) => ({ ...game, packs: mockPacks(game, game.newCount, Boolean(game.gameId)) }));
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
