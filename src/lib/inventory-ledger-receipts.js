// Provider-agnostic receipt chain. Pure.
//
// A bot receipt may record the wallet balance before it, after it, and how
// much it took. Consecutive receipts on one wallet must chain: whatever the
// balance did between them was done by someone other than the bot (a top-up,
// a fill by hand, a failed purchase that still took money). Inside one receipt,
// before - taken must equal after, or the bot's own numbers disagree.
import { toUnits, fromUnits } from "./inventory-ledger.js";
import { sheetCents } from "./usdcodashop-sheet.js";

export const BEFORE_TAG = "ก่อนซื้อ ", AFTER_TAG = "หลังซื้อ ";
const money = c => fromUnits(c * 100n); // cents -> ledger text (4 places)
const time = value => (value == null || value === "" ? NaN : new Date(value).getTime());
// A negative reading is kept (and reported) instead of silently becoming "unknown".
function cents(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text.startsWith("-")) return sheetCents(text);
  const abs = sheetCents(text.slice(1));
  return abs === null ? null : -abs;
}

/**
 * @param {{ ref:string, startAt:any, endAt?:any, before?:string|null, after?:string|null, spent?:string|null }[]} receipts
 *   `spent` is what the provider reported taking; when absent, before - after is used.
 * @param {{ at:string, status:string, ref:string }[]} hints rows that did not complete
 */
export function receiptEvidence(receipts, hints = []) {
  const snapshots = [], botMovements = [], problems = [];
  let unobserved = 0, previousEnd = -Infinity;
  // Stable: receipts at the same instant keep the loader's order (by row id).
  const ordered = [...receipts].sort((a, b) => time(a.startAt) - time(b.startAt));
  for (const r of ordered) {
    const ref = String(r.ref);
    const start = time(r.startAt);
    if (!Number.isFinite(start)) { problems.push({ ref, problem: "ไม่มีเวลาซื้อ" }); continue; }
    // The "after" reading must sort after the "before" one even when both share a timestamp.
    let end = time(r.endAt ?? r.startAt);
    if (!Number.isFinite(end) || end <= start) end = start + 1;
    if (start < previousEnd) problems.push({ ref, problem: "ซื้อซ้อนเวลากับรายการก่อนหน้า" });
    previousEnd = Math.max(previousEnd, end);

    const before = cents(r.before), after = cents(r.after), reported = cents(r.spent);
    for (const [value, name] of [[before, "ยอดก่อน"], [after, "ยอดหลัง"]]) if (value !== null && value < 0n) problems.push({ ref, problem: `${name}ติดลบ` });
    // Reported amount wins, so a receipt whose balances disagree with it shows as a mismatch.
    const spent = reported ?? (before !== null && after !== null && before >= after ? before - after : null);
    if (before !== null && before >= 0n) snapshots.push({ balance: money(before), observedAt: new Date(start).toISOString(), tag: BEFORE_TAG + ref });
    if (spent !== null && spent > 0n) botMovements.push({ occurredAt: new Date(end).toISOString(), amount: money(spent), ref });
    // The bot did take something, we just do not know how much: the window around it cannot be judged.
    if (spent === null) botMovements.push({ occurredAt: new Date(end).toISOString(), amount: null, unknown: true, ref });
    if (after !== null && after >= 0n) snapshots.push({ balance: money(after), observedAt: new Date(end).toISOString(), tag: AFTER_TAG + ref });
    if (spent === null) problems.push({ ref, problem: "ไม่ทราบยอดที่ตัด" });
    else if (spent < 0n) problems.push({ ref, problem: "ยอดที่ตัดติดลบ" });
    if (before === null && after === null) unobserved++;
  }
  const cleanHints = hints.filter(h => Number.isFinite(time(h.at)))
    .map(h => ({ at: new Date(time(h.at)).toISOString(), status: String(h.status ?? ""), ref: String(h.ref ?? ""),
      // what the bot quoted for it; lets a drop of exactly this much be named "charged but not completed"
      amount: cents(h.amount) === null || cents(h.amount) <= 0n ? null : money(cents(h.amount)) }));
  const starts = ordered.map(r => time(r.startAt)).filter(Number.isFinite);
  return { snapshots, botMovements, problems, hints: cleanHints, unobserved, receipts: ordered.length, starts };
}

/** Bot-only movements in the shape `reconcile` takes. */
export const botEffects = botMovements => botMovements.map(m => ({ source: "bot", occurredAt: m.occurredAt, ref: m.ref,
  unknown: Boolean(m.unknown), effect: m.unknown ? 0n : -toUnits(m.amount) }));

const segmentKind = s => (s.fromTag?.startsWith(BEFORE_TAG) && s.toTag?.startsWith(AFTER_TAG)
  && s.fromTag.slice(BEFORE_TAG.length) === s.toTag.slice(AFTER_TAG.length) ? "receipt" : "between");

/**
 * The gaps worth a person's attention: windows between two observations where
 * the balance moved and nothing recorded explains it. Two patterns are named
 * (the same rules as the Donshop page): `charged` -- a drop equal to one
 * unfinished order's quote, or to all of them together; `refunded` -- a drop
 * the very next window gives back exactly (shown once, not as loss + top-up).
 */
export function receiptGaps(result, hints = []) {
  const segments = result.segments.map((s, index) => ({ ...s, index, kind: segmentKind(s) }));
  const gaps = segments.filter(s => s.status === "mismatch").map(s => {
    const from = Date.parse(s.from), to = Date.parse(s.to);
    const negative = s.unexplained.startsWith("-");
    return {
      index: s.index, from: s.from, to: s.to, fromTag: s.fromTag, toTag: s.toTag,
      // inside one receipt = the bot's own numbers disagree; otherwise = outside activity
      kind: s.kind, direction: negative ? "out" : "in",
      amount: negative ? s.unexplained.slice(1) : s.unexplained,
      explainedBy: s.bySource, likely: null, suspects: [],
      hints: hints.filter(h => { const at = Date.parse(h.at); return at >= from && at <= to; }),
    };
  });
  for (const g of gaps) {
    if (g.kind !== "between" || g.direction !== "out" || !g.hints.length) continue;
    const loss = toUnits(g.amount);
    const one = g.hints.find(h => h.amount != null && toUnits(h.amount) === loss);
    const all = g.hints.length > 1 && g.hints.every(h => h.amount != null)
      && g.hints.reduce((n, h) => n + toUnits(h.amount), 0n) === loss;
    if (one || all) Object.assign(g, { likely: "charged", suspects: one ? [one] : g.hints });
  }
  // "next window" skips the inside of a receipt, which is checked on its own.
  const nextBetween = index => segments.find(s => s.index > index && s.kind === "between")?.index;
  const merged = new Set();
  for (const g of gaps) {
    if (g.kind !== "between" || g.direction !== "out" || merged.has(g)) continue;
    const back = gaps.find(b => b.index === nextBetween(g.index) && b.direction === "in" && b.amount === g.amount);
    if (back) { merged.add(back); Object.assign(g, { likely: "refunded", wasLikely: g.likely, refundedAt: back.to }); }
  }
  return gaps.filter(g => !merged.has(g)).map(({ index: _index, ...g }) => g);
}

const sumAmounts = list => fromUnits(list.filter(m => !m.unknown).reduce((n, m) => n + toUnits(m.amount), 0n));

/**
 * One wallet's check, ready to show. `since` hides context rows a loader read
 * from before the range (to order the chain) from gaps and totals.
 */
export function summarizeWallet(wallet, evidence, result, { since = null } = {}) {
  const after = since == null ? () => true : at => Date.parse(at) >= Date.parse(since);
  const receipts = since == null ? evidence.receipts : evidence.starts.filter(t => t >= Date.parse(since)).length;
  const botSpent = sumAmounts(evidence.botMovements.filter(m => after(m.occurredAt)));
  if (wallet.uncheckable) {
    return { key: wallet.key, label: wallet.label, currency: wallet.currency, registered: false, receipts,
      uncheckable: wallet.uncheckable, botSpent, gaps: [], problems: [], doubleCounted: [],
      unobserved: evidence.unobserved, firstBalance: null, lastBalance: null, unexplainedIn: null, unexplainedOut: null,
      receiptMismatches: 0, charged: 0, refunded: 0 };
  }
  const gaps = receiptGaps(result, evidence.hints).filter(g => after(g.to));
  // A refunded drop is not money lost; it is listed but left out of the totals.
  const total = direction => fromUnits(gaps.filter(g => g.direction === direction && g.kind === "between" && g.likely !== "refunded")
    .reduce((n, g) => n + toUnits(g.amount, { allowZero: true }), 0n));
  const shown = evidence.snapshots.filter(s => after(s.observedAt));
  return {
    key: wallet.key, label: wallet.label, currency: wallet.currency, registered: result.registered ?? false,
    receipts, unobserved: evidence.unobserved, uncheckable: null, botSpent,
    firstBalance: shown[0]?.balance ?? null,
    lastBalance: shown.at(-1)?.balance ?? null,
    // Between receipts: money arrived (top-up?) or left (hand use? failed buy?) with nothing recorded.
    unexplainedIn: total("in"), unexplainedOut: total("out"),
    receiptMismatches: gaps.filter(g => g.kind === "receipt").length,
    unverifiable: result.unverifiable ?? 0,
    charged: gaps.filter(g => g.likely === "charged").length,
    refunded: gaps.filter(g => g.likely === "refunded").length,
    doubleCounted: result.doubleCounted ?? [],
    gaps, problems: evidence.problems.filter(p => p.at == null || after(p.at)),
  };
}
