// Fills a person did by hand, across every channel, and the wallet each one
// probably came out of. Pure.
//
// A hand fill leaves two traces that nobody connects today:
//  1. an order the bot did not pay for (status "manual", or "completed" with no
//     bot payment evidence for its channel), and
//  2. a drop in some wallet between two bot readings ("ยอดหาย").
// Same channel + same amount + overlapping time = a likely pair. Nothing here
// is written anywhere; a person confirms before it becomes a ledger entry.
import { toUnits, fromUnits } from "./inventory-ledger.js";
import { sheetCents } from "./usdcodashop-sheet.js";
import { kyat } from "./wavepay-inventory.js";
import { dsUsed } from "./donshop-inventory.js";

// Fixed channel -> wallet-check provider. Razer / Netease methods are learned at run time
// from orders that have their purchase receipts, so no name is guessed here.
export const MANUAL_METHOD_PROVIDER = Object.freeze({
  WavePay: "wavepay", GarenaShells: "garena-shell", GamePointClub: "gamepoint", PlsbuyMYR: "plsbuy", DonShopIDR: "donshop",
});
export const MANUAL_REASONS = Object.freeze({
  manual: "สถานะ manual (คนเติมเอง)",
  "bot-failed": "completed แต่บอทรายงานว่าเติมไม่สำเร็จ",
  "not-charged": "completed แต่บอทหยุดเพราะยอดไม่พอ (ไม่ได้ตัดเงิน)",
  "no-bot": "completed แต่บอทไม่ได้ทำคิวนี้",
  "no-receipt": "completed แต่ไม่มีใบเสร็จการซื้อของบอท",
});
// A person fills during [created, updated]; allow the clock a little slack after it.
export const MANUAL_MATCH_SLACK_MS = 10 * 60 * 1000;

const iso = value => (value == null ? null : new Date(value).toISOString());

/** First number in a price text: "Ks11,000" -> 11000.00, "MYR 10.50" -> 10.50. Unknown stays null. */
export function quotedAmount(text) {
  const match = /(\d[\d,]*(?:\.\d+)?)/.exec(String(text ?? ""));
  if (!match) return null;
  const cents = sheetCents(match[1].replaceAll(",", ""));
  return cents === null || cents <= 0n ? null : fromUnits(cents * 100n);
}

/** Expected wallet amount of a hand-filled order, in its channel's wallet currency where known. */
export function expectedAmount(row, provider) {
  if (provider === "donshop") { const used = dsUsed(row); if (used != null && sheetCents(used) > 0n) return fromUnits(sheetCents(used) * 100n); }
  if (provider === "wavepay") { const mmk = kyat(row.pack_price); return mmk == null || sheetCents(mmk) <= 0n ? null : fromUnits(sheetCents(mmk) * 100n); }
  return quotedAmount(row.pack_price);
}

/**
 * @param {object} row codashop_orders projection (see the server query)
 * @param {Record<string,string>} methods payment_method -> provider (fixed + learned)
 */
export function manualCandidate(row, methods) {
  const provider = methods[row.payment_method] ?? null;
  const reason = row.status === "manual" ? "manual" : row.reason ?? null;
  if (!reason) return null;
  return {
    id: String(row.id), ref: String(row.source_base || row.source_order_id || `#${row.id}`),
    method: String(row.payment_method ?? ""), provider, status: String(row.status), reason, reasonText: MANUAL_REASONS[reason],
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at ?? row.created_at),
    amount: expectedAmount(row, provider), game: String(row.game_name ?? "").slice(0, 120), pack: String(row.pack_name ?? "").slice(0, 160),
    // Closed by the stale-queue quarantine script, not necessarily filled by a person.
    quarantined: row.quarantined === true,
  };
}

const overlaps = (gap, c) => Date.parse(gap.from) <= Date.parse(c.updatedAt) + MANUAL_MATCH_SLACK_MS && Date.parse(gap.to) >= Date.parse(c.createdAt);

/**
 * Pair hand-filled orders with unexplained drops of the same channel.
 * @param {object[]} candidates from manualCandidate
 * @param {Record<string, {wallets: object[]}>} reports provider -> createInventoryCheck report
 * @param {Set<string>} recorded order refs already recorded as hand use in the ledger
 * @param {Set<string>} unavailable providers whose wallet check could not run
 */
export function matchManualFills(candidates, reports, recorded = new Set(), unavailable = new Set()) {
  const matches = new Map(candidates.map(c => [c, []]));
  const orphanGaps = [];
  for (const [provider, report] of Object.entries(reports)) {
    for (const wallet of report?.wallets ?? []) {
      for (const gap of wallet.gaps ?? []) {
        if (gap.kind !== "between" || gap.direction !== "out" || gap.likely === "refunded") continue;
        const loss = toUnits(gap.amount);
        // An order already recorded in the ledger is explained; it cannot claim another drop.
        const near = candidates.filter(c => c.provider === provider && !recorded.has(c.ref) && overlaps(gap, c));
        const exact = near.filter(c => c.amount != null && toUnits(c.amount) === loss);
        const priced = near.filter(c => c.amount != null);
        const together = exact.length ? [] : near.length > 1 && priced.length === near.length
          && near.reduce((n, c) => n + toUnits(c.amount), 0n) === loss ? near : [];
        const found = exact.length ? exact : together;
        const place = { walletKey: wallet.key, label: wallet.label, currency: wallet.currency, amount: gap.amount, from: gap.from, to: gap.to,
          together: together.length ? together.map(c => c.ref) : [], alternatives: exact.length > 1 ? exact.map(c => c.ref) : [] };
        for (const c of found) matches.get(c).push(place);
        if (!found.length) orphanGaps.push({ provider, walletKey: wallet.key, label: wallet.label, currency: wallet.currency,
          amount: gap.amount, from: gap.from, to: gap.to, likely: gap.likely ?? null, nearby: near.map(c => c.ref) });
      }
    }
  }
  const rows = candidates.map(c => {
    const places = matches.get(c);
    const wallets = new Set(places.map(p => p.walletKey));
    const verdict = recorded.has(c.ref) ? "recorded"
      : !c.provider ? "no-check"
      : unavailable.has(c.provider) ? "check-failed"
      : places.length === 1 && !places[0].alternatives.length ? "matched"
      : places.length ? "ambiguous" : "unmatched";
    return { ...c, verdict, places, walletCount: wallets.size };
  });
  const order = { unmatched: 0, ambiguous: 1, "check-failed": 2, matched: 3, "no-check": 4, recorded: 5 };
  rows.sort((a, b) => order[a.verdict] - order[b.verdict] || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const count = verdict => rows.filter(r => r.verdict === verdict).length;
  return {
    candidates: rows,
    summary: { total: rows.length, matched: count("matched"), ambiguous: count("ambiguous"), unmatched: count("unmatched"),
      noCheck: count("no-check"), checkFailed: count("check-failed"), recorded: count("recorded"), orphanGaps: orphanGaps.length },
    orphanGaps: orphanGaps.sort((a, b) => b.to.localeCompare(a.to)),
  };
}
