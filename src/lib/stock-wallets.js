// Money wallets behind Stock purchases: where the money for an order came from.
//   Bitazza (USDT)            receives the Russia side's deposits
//   BITKUB (THB, USDT)        the main wallet, money is moved here from Bitazza
//   Bybit (USDT, USDC, BTC)   pays for goods; topped up from BITKUB when short
// Nothing is stored as a running total: every deposit, move, exchange,
// payment and refund is an entry with one or two legs (wallet, currency,
// signed amount, fee), and a balance is the sum of its legs.
// Amounts carry up to 8 decimals (BTC), so sums run on scaled BigInt.
// A correction (ปรับยอด) counts at once and must say why. Corrections typed
// while approval was required may still be awaiting it: those stay out of any
// balance until someone approves or rejects them.
// Each entry may also carry the sheet's columns: ช่องทาง, ชื่อบัญชีปลายทาง,
// ผู้ขาย, ผู้ซื้อ and ยอดเครดิต. They are notes only and never touch a balance.
// Pure: the same rules run in the API and the tests.

export const WALLET_DECIMALS = 8;
const SCALE = 10n ** BigInt(WALLET_DECIMALS);

/** Wallet groups, in the order the wallets page shows them. */
export const WALLET_GROUPS = [
  { code: "main", label: "กระเป๋าหลัก Stock", hint: "Bitazza รับเงิน → BITKUB เก็บ → Bybit จ่ายค่าสินค้า" },
  { code: "crypto", label: "คริปโตบัญชีอื่น", hint: "BITKUB / Bybit ของแต่ละคน" },
  { code: "payout", label: "กระเป๋าเติมเงินต่างประเทศ", hint: "PHP · IDR ที่ใช้เติมให้ลูกค้า" },
  { code: "foreign", label: "สกุลต่างประเทศ / เครดิตซัพพลายเออร์", hint: "USD · JPY · MYR · UAH" },
];

const W = (code, name, currencies, group, role) => ({ code, name, currencies, group, role });
export const DEFAULT_WALLETS = [
  W("bitazza", "Bitazza", ["USDT"], "main", "รับเงินจากฝั่ง Russia เวลา deposit มา"),
  W("bitkub", "BITKUB", ["THB", "USDT"], "main", "กระเป๋าเก็บเงินหลัก"),
  W("bybit", "Bybit Inblack Gaming", ["USDT", "USDC", "BTC"], "main", "ใช้จ่ายค่าสินค้า · เงินไม่พอให้ดึงจาก BITKUB"),
  W("bitkub-ptos", "BITKUB PTos", ["THB", "USDT"], "crypto", "BITKUB ของพี่โต"),
  W("bitkub-songkran", "BITKUB Songkran", ["THB", "USDT"], "crypto", "BITKUB Songkran"),
  W("bybit-paek", "Bybit PAek", ["USDT"], "crypto", "Bybit ของพี่เอก"),
  W("tnt-vincent", "TNT Vincent", ["PHP"], "payout", "TNT ฟิลิปปินส์"),
  W("tnt-emalyn", "TNT Emalyn", ["PHP"], "payout", "TNT ฟิลิปปินส์ (ถึง พ.ค.)"),
  W("tnt-hero", "TNT Hero", ["PHP"], "payout", "TNT ฟิลิปปินส์ (ม.ค.)"),
  W("tnt-jake", "TNT Jake", ["PHP"], "payout", "TNT ฟิลิปปินส์"),
  W("php-emalyn", "PHP Emalyn", ["PHP"], "payout", "PHP ฟิลิปปินส์ (ตั้งแต่ มิ.ย.)"),
  W("idr-amen", "IDR Amen", ["IDR"], "payout", "IDR อินโดนีเซีย"),
  W("xl-amen", "XL Amen", ["IDR"], "payout", "XL อินโดนีเซีย (ก.พ.)"),
  W("zelle", "Zelle (USD)", ["USD"], "foreign", "USD ที่โอนไปใช้สั่ง Gocash"),
  W("jpy-exchange", "JPY Exchange", ["USD", "JPY"], "foreign", "แลก USD เป็น JPY"),
  W("amaten", "Amaten (JPY)", ["JPY"], "foreign", "เครดิต JPY ที่ Amaten"),
  W("myr-plsbuy", "MYR (Plsbuy)", ["MYR"], "foreign", "เครดิต MYR ที่ Plsbuy"),
  W("google-uah", "Google UAH", ["UAH"], "foreign", "เครดิต UAH"),
].map((wallet, index) => ({ ...wallet, sortOrder: index + 1 }));

export const WALLET_ENTRY_KINDS = ["deposit", "transfer", "exchange", "payment", "refund", "adjust"];
export const WALLET_ENTRY_LABELS = {
  deposit: "ฝากเข้า",
  transfer: "ย้ายเงิน",
  exchange: "แลกสกุล",
  payment: "จ่ายค่าสินค้า",
  refund: "ได้เงินคืน",
  adjust: "ปรับยอด",
};
export const WALLET_PAYMENT_STATUSES = ["pending", "done"];
export const WALLET_PAYMENT_STATUS_LABELS = { pending: "รอสินค้า", done: "เรียบร้อย" };
export const WALLET_ENTRY_STATUSES = ["pending", "done", "awaiting_approval", "rejected"];
export const WALLET_REVIEW_LABELS = { awaiting_approval: "รออนุมัติ", rejected: "ไม่อนุมัติ" };
/** Entries whose legs count in a balance. */
export const WALLET_COUNTED = "e.status NOT IN ('awaiting_approval', 'rejected')";

const CURRENCY = /^[A-Z]{3,5}$/;
const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** "1,054.123456789" → 105412345679n (scaled by 1e8, rounded half-up); null when not a number. */
export function toWalletUnits(value) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (!match[2] && !match[3])) return null;
  const frac = (match[3] || "").padEnd(WALLET_DECIMALS + 1, "0");
  let units = BigInt(match[2] || "0") * SCALE + BigInt(frac.slice(0, WALLET_DECIMALS));
  if (Number(frac[WALLET_DECIMALS]) >= 5) units += 1n;
  return match[1] ? -units : units;
}

/** 105412345679n → "1054.12345679" (trailing zeros dropped). */
export function fromWalletUnits(units) {
  const value = BigInt(units);
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(WALLET_DECIMALS, "0").replace(/0+$/, "");
  return `${sign}${whole}${frac ? `.${frac}` : ""}`;
}

/** A positive amount as a string with at most 8 decimals, "" when blank, null when not a number > 0. */
export function normalizeWalletAmount(value, { allowZero = false } = {}) {
  if (String(value ?? "").trim() === "") return "";
  const units = toWalletUnits(value);
  if (units === null || units < 0n || (!allowZero && units === 0n)) return null;
  return fromWalletUnits(units);
}

export const walletKey = (walletId, currency) => `${walletId}:${currency}`;

/**
 * An entry as typed → { entry, legs } to store, or { error } in Thai.
 * `wallets` are [{ id, name, currencies }]; `balances` maps walletKey → units (BigInt).
 * Legs carry a signed amount and the fee charged on that leg; the fee always
 * leaves the paying side (for a deposit, the side it lands on).
 *   deposit   to + amount − fee
 *   transfer  from − (amount + fee), to + amount          same currency, two wallets
 *   exchange  from − (amount + fee), to + amountTo        one wallet, two currencies
 *   payment   from − (amount + fee)
 *   refund    to + amount
 *   adjust    to ± amount, a reason required
 */
export function validateWalletEntry(input, wallets = [], balances = {}) {
  const kind = input?.kind;
  if (!WALLET_ENTRY_KINDS.includes(kind)) return { error: "ประเภทรายการไม่ถูกต้อง" };
  const byId = new Map(wallets.map((wallet) => [Number(wallet.id), wallet]));
  const title = clean(input.title, 200);
  const note = clean(input.note, 500);
  const txid = clean(input.txid, 200);
  const channel = clean(input.channel, 100);
  const destinationAccount = clean(input.destinationAccount, 200);
  const seller = clean(input.seller, 120);
  const buyer = clean(input.buyer, 120);
  const credit = normalizeWalletAmount(input.credit, { allowZero: true });
  if (credit === null) return { error: "ยอดเครดิตต้องเป็นตัวเลข 0 ขึ้นไป" };
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) return { error: "เวลาใบเสร็จไม่ถูกต้อง" };

  const side = (prefix, label) => {
    const wallet = byId.get(Number(input[`${prefix}WalletId`]));
    if (!wallet) return { error: `เลือกกระเป๋า${label}` };
    const currency = clean(input[`${prefix}Currency`], 5).toUpperCase();
    if (!CURRENCY.test(currency) || !wallet.currencies.includes(currency)) return { error: `${wallet.name} ไม่มีสกุล ${currency || "ที่เลือก"}` };
    return { wallet, currency };
  };
  const amount = kind === "adjust" ? toWalletUnits(input.amount) : toWalletUnits(normalizeWalletAmount(input.amount) ?? "x");
  if (amount === null || amount === 0n) return { error: kind === "adjust" ? "ยอดที่ปรับต้องเป็นตัวเลขที่ไม่ใช่ 0" : "ใส่ยอดมากกว่า 0" };
  const feeText = normalizeWalletAmount(input.fee, { allowZero: true });
  if (feeText === null) return { error: "ค่า fee ต้องเป็นตัวเลข 0 ขึ้นไป" };
  const fee = feeText === "" ? 0n : toWalletUnits(feeText);
  if (kind === "adjust" && !note) return { error: "ปรับยอดต้องใส่เหตุผล" };
  if (kind === "payment" && !title) return { error: "ใส่ชื่อรายการสินค้า" };

  const legs = [];
  if (["transfer", "exchange", "payment"].includes(kind)) {
    const from = side("from", "ที่จ่ายออก");
    if (from.error) return from;
    legs.push({ walletId: from.wallet.id, currency: from.currency, amount: -(amount + fee), fee });
  }
  if (["deposit", "transfer", "exchange", "refund", "adjust"].includes(kind)) {
    const to = side("to", "ที่รับเข้า");
    if (to.error) return to;
    let lands = amount;
    if (kind === "exchange") {
      const got = toWalletUnits(normalizeWalletAmount(input.amountTo) ?? "x");
      if (got === null || got === 0n) return { error: "ใส่ยอดที่ได้หลังแลก" };
      lands = got;
    }
    if (kind === "deposit") lands = amount - fee;
    if (kind === "deposit" && lands <= 0n) return { error: "ค่า fee มากกว่ายอดที่ฝาก" };
    legs.push({ walletId: to.wallet.id, currency: to.currency, amount: lands, fee: kind === "deposit" ? fee : 0n });
  }
  if (kind === "transfer") {
    if (legs[0].walletId === legs[1].walletId) return { error: "ย้ายเงินต้องเป็นคนละกระเป๋า" };
    if (legs[0].currency !== legs[1].currency) return { error: "ย้ายเงินต้องเป็นสกุลเดียวกัน ถ้าเปลี่ยนสกุลให้ใช้แลกสกุล" };
  }
  if (kind === "exchange") {
    if (legs[0].walletId !== legs[1].walletId) return { error: "แลกสกุลทำในกระเป๋าเดียวกัน" };
    if (legs[0].currency === legs[1].currency) return { error: "แลกสกุลต้องเป็นคนละสกุล" };
  }

  for (const leg of legs) {
    if (leg.amount >= 0n) continue;
    const left = BigInt(balances[walletKey(leg.walletId, leg.currency)] ?? 0n);
    if (left + leg.amount < 0n) {
      const wallet = byId.get(Number(leg.walletId));
      const hint = wallet?.code === "bybit" ? " — ย้ายเงินจาก BITKUB เข้ามาก่อน" : "";
      return { error: `${wallet?.name || "กระเป๋า"} ${leg.currency} เหลือ ${fromWalletUnits(left)} ไม่พอจ่าย ${fromWalletUnits(-leg.amount)}${hint}` };
    }
  }

  const status = kind === "payment" ? (WALLET_PAYMENT_STATUSES.includes(input.status) ? input.status : "pending")
    : "done";
  return { entry: { kind, title, note, txid, channel, destinationAccount, seller, buyer, credit, occurredAt: occurredAt.toISOString(), status }, legs };
}

/**
 * Approving or rejecting a correction left awaiting approval → { status } or
 * { error } in Thai. A rejection says why. `entry` is { kind, status }.
 */
export function reviewWalletAdjust(entry, decision, actor, note = "") {
  if (entry?.kind !== "adjust" || entry.status !== "awaiting_approval") return { error: "รายการนี้ไม่ได้รออนุมัติ" };
  if (!["approve", "reject"].includes(decision)) return { error: "เลือกอนุมัติหรือไม่อนุมัติ" };
  const reason = clean(note, 500);
  if (decision === "reject" && !reason) return { error: "ใส่เหตุผลที่ไม่อนุมัติ" };
  return { status: decision === "approve" ? "done" : "rejected", note: reason };
}

/** Legs ({ walletId, currency, amount }) → { walletKey: units } summed. */
export function sumWalletLegs(legs) {
  const totals = {};
  for (const leg of legs || []) {
    const key = walletKey(leg.walletId, leg.currency);
    totals[key] = (totals[key] ?? 0n) + toWalletUnits(leg.amount);
  }
  return totals;
}

// ---- checking a wallet against its sheet ------------------------------------------------------

/** What a person checked: the numbers of one wallet-month-currency. */
export const walletCheckSignature = (check) =>
  [check.sheetOpen, check.systemOpen, check.sheetClose, check.systemClose, check.rows, (check.drifts || []).length].join("|");

/**
 * One month of one wallet and currency → its state for the page:
 *   ok       the system's carried and closing balances are within 0.01 of the sheet's, no row breaks the sheet's own balance
 *   diff     something differs: the person has to look
 *   checked  someone looked and signed it off (for these numbers)
 *   stale    someone signed it off, but the numbers have changed since
 */
export function walletCheckState(check) {
  if (check.checkedAt) return check.checkedStale ? "stale" : "checked";
  // Within 0.01: the sheets' formulas leave float dust that nobody can correct.
  const near = (a, b) => a == null || b == null || (() => { const d = toWalletUnits(a) - toWalletUnits(b); return d <= 1000000n && d >= -1000000n; })();
  return near(check.sheetOpen, check.systemOpen) && near(check.sheetClose, check.systemClose) && !(check.drifts || []).length ? "ok" : "diff";
}
export const WALLET_CHECK_LABELS = { ok: "ตรงกับชีต", diff: "ต้องตรวจ", checked: "ตรวจแล้ว", stale: "ตัวเลขเปลี่ยนหลังตรวจ" };

// ---- changing a done payment back needs a second person ----------------------------------------

/**
 * A payment not tied to an order: pending → done straight away; done → pending
 * only as a request that someone else confirms. → { status } to set now,
 * { request } to store, or { error } in Thai.
 */
export function walletStatusChange(entry, to, actor, reason = "") {
  if (entry?.kind !== "payment" || entry.orderId) return { error: "แก้สถานะได้เฉพาะรายการจ่ายที่ไม่ได้ผูกใบสั่งซื้อ" };
  if (!WALLET_PAYMENT_STATUSES.includes(to) || to === entry.status) return { error: "สถานะไม่ถูกต้อง" };
  if (entry.statusRequest) return { error: "มีคำขอเปลี่ยนสถานะค้างอยู่ ให้อีกคนยืนยันหรือยกเลิกก่อน" };
  if (entry.status === "done") {
    const why = clean(reason, 500);
    if (!why) return { error: "ใส่เหตุผลที่ขอเปลี่ยนจากเรียบร้อยกลับเป็นรอสินค้า" };
    if (!actor?.id) return { error: "ต้องเข้าสู่ระบบก่อน" };
    return { request: { to, byId: actor.id, by: clean(actor.name, 255), reason: why } };
  }
  return { status: to };
}

/**
 * Answering a status request: "approve" / "reject" by someone other than who
 * asked, "cancel" by who asked. → { status } (null: unchanged) or { error }.
 */
export function walletStatusDecision(entry, decision, actor) {
  const request = entry?.statusRequest;
  if (!request) return { error: "ไม่มีคำขอเปลี่ยนสถานะ" };
  if (!actor?.id) return { error: "ต้องเข้าสู่ระบบก่อน" };
  const own = Number(actor.id) === Number(request.byId);
  if (decision === "cancel") return own ? { status: null } : { error: "ยกเลิกได้เฉพาะคนที่ขอ" };
  if (!["approve", "reject"].includes(decision)) return { error: "เลือกยืนยันหรือไม่ยืนยัน" };
  if (own) return { error: "ต้องให้อีกคนเป็นคนยืนยัน ไม่ใช่คนที่ขอ" };
  return { status: decision === "approve" ? request.to : null };
}
