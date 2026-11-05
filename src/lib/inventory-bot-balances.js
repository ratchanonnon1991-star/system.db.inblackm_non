// Pure: put the balances the bots read (the same readers as the stock alerts) next to the
// registry accounts of the reservation page. Only a match that is exact and unique counts.
import { waveLedgerPhone } from "./wavepay-inventory.js";

const compact = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, "");
// "( MYR ) gamepoint" and "Gamepoint" name the same wallet once the currency prefix is gone.
const bare = (s) => compact(s).replace(/^\([a-z]{2,6}\)/, "");

/**
 * @param accounts  { id, accountKey, provider, label, currency }
 * @param channels  loadAlertBalances().channels: { key, provider, label, currency, balance, balanceAt }
 * @returns Map accountId -> { balance, balanceAt, source }
 */
export function matchBotBalances(accounts, channels) {
  const out = new Map(), usable = channels.filter((c) => c.balance != null);
  const byKey = new Map(usable.map((c) => [c.key, c]));
  const phones = usable.filter((c) => c.provider === "wavepay").map((c) => c.key.slice("wavepay:".length));
  for (const a of accounts) {
    let hit = byKey.get(a.accountKey) ?? null; // razer:<zone>:<email> is the same key on both sides
    if (!hit && a.provider === "wavepay") {
      const phone = waveLedgerPhone(a.label, phones);
      hit = phone ? byKey.get(`wavepay:${phone}`) : null;
    }
    if (!hit) {
      const same = usable.filter((c) => c.provider !== "wavepay" && c.provider !== "razer"
        && String(c.currency).toUpperCase() === String(a.currency).toUpperCase()
        && (compact(c.label) === compact(a.label) || bare(c.label) === bare(a.label)));
      hit = same.length === 1 ? same[0] : null;
    }
    if (hit) out.set(a.id, { balance: hit.balance, balanceAt: hit.balanceAt, source: hit.provider });
  }
  return out;
}
