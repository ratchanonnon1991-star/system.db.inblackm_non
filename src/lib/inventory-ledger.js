// Shared rules for the provider-agnostic inventory ledger. Pure: no database,
// network or clock access, so the same rules run in the API and the tests.
//
// Model: a balance snapshot (read from a provider, or typed once a day where a
// provider has no balance API) is the anchor. The first snapshot is the
// account's opening balance. Between two snapshots, bot spending (read from the
// bot database, never copied here) plus the movements in this ledger should
// explain the change; whatever they do not explain is shown as unexplained.

export const LEDGER_KINDS = Object.freeze(["deposit", "use", "adjust_in", "adjust_out", "reversal"]);
export const LEDGER_DIRECTION = Object.freeze({ deposit: 1, use: -1, adjust_in: 1, adjust_out: -1 });
export const SNAPSHOT_SOURCES = Object.freeze(["api", "manual"]);
export const ACCOUNT_STATUSES = Object.freeze(["active", "disabled"]);
// reference: amount × the account's fixed THB rate.
// deposit_average: amount × (THB paid ÷ units bought) over priced deposits so far.
export const COST_METHODS = Object.freeze(["reference", "deposit_average"]);

// Amounts are exact decimals with up to 4 places (IDR, MMK and card points have
// none; USD/SGD/MYR have 2). Stored as NUMERIC, handled as scaled BigInt.
export const AMOUNT_SCALE = 4;
const SCALE = 10n ** BigInt(AMOUNT_SCALE);
// Rates need more places: 1 IDR is about 0.0021 THB.
export const RATE_SCALE = 8;
const RATE = 10n ** BigInt(RATE_SCALE);

export const ledgerError = (message, status = 400) => Object.assign(new Error(message), { status });

export function toUnits(value, { allowZero = false, field = "ยอด" } = {}) {
  const text = String(value ?? "").trim().replaceAll(",", "");
  if (!/^\d{1,16}(?:\.\d{1,4})?$/.test(text)) {
    throw ledgerError(`${field}ต้องเป็นตัวเลขไม่ติดลบ ไม่เกิน 16 หลัก และทศนิยมไม่เกิน 4 ตำแหน่ง`);
  }
  const [whole, fraction = ""] = text.split(".");
  const units = BigInt(whole) * SCALE + BigInt(fraction.padEnd(AMOUNT_SCALE, "0"));
  if (!allowZero && units === 0n) throw ledgerError(`${field}ต้องมากกว่า 0`);
  return units;
}

export function fromUnits(units) {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  return `${negative ? "-" : ""}${abs / SCALE}.${String(abs % SCALE).padStart(AMOUNT_SCALE, "0")}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value, max) => String(value ?? "").trim().slice(0, max);

function requestId(body) {
  const id = String(body?.requestId ?? "").trim().toLowerCase();
  if (!UUID.test(id)) throw ledgerError("รหัสคำขอไม่ถูกต้อง");
  return id;
}

// When the fill really happened, if recorded later. The server bounds it.
function optionalTime(value) {
  if (value == null || String(value).trim() === "") return null;
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) throw ledgerError("เวลาที่ทำรายการไม่ถูกต้อง");
  return at.toISOString();
}

function optionalThb(value, field) {
  if (value == null || String(value).trim() === "") return null; // blank is unknown, not zero
  const units = toUnits(value, { allowZero: true, field });
  if (units % (SCALE / 100n) !== 0n) throw ledgerError(`${field}มีทศนิยมได้ไม่เกิน 2 ตำแหน่ง`);
  return fromUnits(units);
}

/** A stable key per funding source, e.g. "razer:<uuid>", "mgc:<serial>", "gamepoint:main". */
export function accountKey(provider, ref) {
  const p = text(provider, 40).toLowerCase();
  const r = text(ref, 160);
  if (!/^[a-z][a-z0-9_-]{1,39}$/.test(p) || !r) throw ledgerError("ระบุผู้ให้บริการและรหัสบัญชีให้ถูกต้อง");
  return `${p}:${r}`;
}

export function accountInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw ledgerError("รูปแบบข้อมูลไม่ถูกต้อง");
  const currency = text(body.currency, 10).toUpperCase();
  if (!/^[A-Z]{2,10}$/.test(currency)) throw ledgerError("สกุลเงินต้องเป็นตัวอักษรภาษาอังกฤษ 2–10 ตัว เช่น MYR, SGD, POINTS");
  const label = text(body.label, 120);
  if (!label) throw ledgerError("กรุณาระบุชื่อบัญชี");
  const rate = body.referenceRateThb == null || String(body.referenceRateThb).trim() === ""
    ? null : rateText(body.referenceRateThb);
  const costMethod = String(body.costMethod ?? "reference");
  if (!COST_METHODS.includes(costMethod)) throw ledgerError("วิธีคิดต้นทุนไม่ถูกต้อง");
  return {
    key: accountKey(body.provider, body.ref), provider: text(body.provider, 40).toLowerCase(),
    label, currency, referenceRateThb: rate, costMethod,
    // The workbook / group the account belongs to (e.g. "1.2 UID ( MMK )"), only for grouping on screen.
    category: text(body.category, 120) || null,
    // Only used when the account is first registered; later changes are an admin action.
    status: body.status === "disabled" ? "disabled" : "active",
  };
}

function rateUnits(value) {
  const text = String(value ?? "").trim().replaceAll(",", "");
  if (!/^\d{1,8}(?:\.\d{1,8})?$/.test(text)) throw ledgerError("อัตราอ้างอิงต้องเป็นตัวเลขบวก ทศนิยมไม่เกิน 8 ตำแหน่ง");
  const [whole, fraction = ""] = text.split(".");
  const units = BigInt(whole) * RATE + BigInt(fraction.padEnd(RATE_SCALE, "0"));
  if (units === 0n) throw ledgerError("อัตราอ้างอิงต้องมากกว่า 0");
  return units;
}
const rateText = value => { const u = rateUnits(value); return `${u / RATE}.${String(u % RATE).padStart(RATE_SCALE, "0")}`; };

export function entryInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw ledgerError("รูปแบบข้อมูลไม่ถูกต้อง");
  const kind = String(body.kind ?? "");
  if (!LEDGER_KINDS.includes(kind)) throw ledgerError("ประเภทรายการไม่ถูกต้อง");
  const note = text(body.note, 500);
  if (!note) throw ledgerError("กรุณาระบุหมายเหตุอ้างอิง");
  const input = { requestId: requestId(body), kind, note, occurredAt: optionalTime(body.occurredAt) };
  if (kind === "reversal") {
    const target = String(body.reversesEntryId ?? "").trim();
    if (!/^\d{1,18}$/.test(target)) throw ledgerError("ระบุรายการที่ต้องการกลับรายการให้ถูกต้อง");
    return { ...input, reversesEntryId: target };
  }
  const accountId = String(body.accountId ?? "").trim();
  if (!/^\d{1,18}$/.test(accountId)) throw ledgerError("ระบุบัญชีให้ถูกต้อง");
  const orderRef = text(body.orderRef, 120) || null;
  if (kind === "use" && !orderRef) throw ledgerError("รายการใช้ต้องระบุเลขออเดอร์");
  return {
    ...input, accountId,
    amount: fromUnits(toUnits(body.amount)),
    orderRef,
    // Provider receipt / transaction number, when the person has one.
    invoice: text(body.invoice, 200) || null,
    // use: explicit THB cost (else reference rate); deposit: THB paid for the lot.
    thbAmount: optionalThb(body.thbAmount, "ยอดบาท"),
    saleThb: kind === "use" ? optionalThb(body.saleThb, "ราคาขาย") : null,
  };
}

export const LEDGER_MAX_BATCH = 200;

/**
 * Rows typed or pasted on the debit page for one account. Each row carries its own
 * request id from the browser, so a retried save never records a row twice.
 */
export function debitBatchInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw ledgerError("รูปแบบข้อมูลไม่ถูกต้อง");
  const accountId = String(body.accountId ?? "").trim();
  if (!/^\d{1,18}$/.test(accountId)) throw ledgerError("กรุณาเลือกบัญชี");
  if (!Array.isArray(body.rows) || !body.rows.length) throw ledgerError("ยังไม่มีรายการ");
  if (body.rows.length > LEDGER_MAX_BATCH) throw ledgerError(`บันทึกได้ครั้งละไม่เกิน ${LEDGER_MAX_BATCH} รายการ`);
  return { accountId, rows: body.rows.map(r => ({ ...r, kind: "use", accountId, note: text(r?.note, 500) || "ยกยอด" })) };
}

/**
 * Split pasted sheet text into rows: "order<TAB>amount[<TAB>invoice]" per line, or
 * "order amount" separated by spaces. Thousands separators are removed; blank lines skipped.
 */
export function parseDebitPaste(textValue) {
  const rows = [];
  for (const raw of String(textValue ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.includes("\t") ? line.split("\t").map(c => c.trim()) : line.split(/\s+/);
    const [orderRef = "", amount = "", invoice = ""] = cells;
    // "Ks5,000" / "1 000" -> "5000" / "1000"
    rows.push({ orderRef, amount: amount.replace(/[,\s]/g, "").replace(/^[^\d.]+/, ""), invoice });
  }
  return rows;
}

export function snapshotInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw ledgerError("รูปแบบข้อมูลไม่ถูกต้อง");
  const accountId = String(body.accountId ?? "").trim();
  if (!/^\d{1,18}$/.test(accountId)) throw ledgerError("ระบุบัญชีให้ถูกต้อง");
  const source = String(body.source ?? "manual");
  if (!SNAPSHOT_SOURCES.includes(source)) throw ledgerError("แหล่งยอดคงเหลือไม่ถูกต้อง");
  const observedAt = new Date(body.observedAt ?? NaN);
  if (!Number.isFinite(observedAt.getTime())) throw ledgerError("เวลาของยอดคงเหลือไม่ถูกต้อง");
  return {
    requestId: body.requestId == null ? null : requestId(body),
    accountId, source,
    balance: fromUnits(toUnits(body.balance, { allowZero: true, field: "ยอดคงเหลือ" })),
    observedAt: observedAt.toISOString(),
  };
}

/** Signed effect of one stored ledger row on the account balance. */
export function entryEffect(entry) {
  const amount = toUnits(entry.amount);
  return BigInt(entry.direction) * amount;
}

const toSatang = (numerator, denominator) => {
  // half-up rounding of a non-negative ratio, in satang
  const satang = (numerator * 2n + denominator) / (denominator * 2n);
  return `${satang / 100n}.${String(satang % 100n).padStart(2, "0")}`;
};

/**
 * THB cost of a "use". An entered cost always wins. Otherwise the account's
 * method decides: a fixed reference rate, or the average price of priced
 * deposits recorded before it. Unknown stays null -- never a silent zero.
 *
 * @param {{amount:string, thbAmount?:string|null}} entry
 * @param {{costMethod?:string, referenceRateThb?:string|null}} account
 * @param {{amount:string, thb:string}|null} depositTotals priced deposits up to the use
 */
export function costOfUse(entry, account, depositTotals = null) {
  if (entry.thbAmount != null) return { thb: entry.thbAmount, basis: "entered" };
  const amount = toUnits(entry.amount);
  if ((account?.costMethod ?? "reference") === "deposit_average") {
    const bought = depositTotals ? toUnits(depositTotals.amount, { allowZero: true }) : 0n;
    if (bought === 0n) return { thb: null, basis: null };
    const paid = toUnits(depositTotals.thb, { allowZero: true });
    // amount/SCALE × (paid/SCALE) / (bought/SCALE) THB, ×100 for satang
    return { thb: toSatang(amount * paid * 100n, bought * SCALE), basis: "deposit_average" };
  }
  if (!account?.referenceRateThb) return { thb: null, basis: null };
  return { thb: toSatang(amount * rateUnits(account.referenceRateThb) * 100n, SCALE * RATE), basis: "reference" };
}

export function profitThb(saleThb, costThb) {
  if (saleThb == null || costThb == null) return null;
  const diff = toUnits(saleThb, { allowZero: true }) - toUnits(costThb, { allowZero: true });
  const text = fromUnits(diff);
  return text.slice(0, text.length - (AMOUNT_SCALE - 2));
}

/**
 * Compare consecutive balance snapshots with what the movements between them
 * explain. A movement belongs to the half-open window (previous, next].
 *
 * @param {{ snapshots: {balance:string, observedAt:string, source?:string}[],
 *           movements: {source:string, occurredAt:string, effect:bigint|string, ref?:string}[],
 *           tolerance?: string }} input
 */
export function reconcile({ snapshots, movements, tolerance = "0" }) {
  const tol = toUnits(tolerance, { allowZero: true, field: "ค่าคลาดเคลื่อน" });
  const snaps = [...snapshots]
    .map(s => ({ ...s, at: Date.parse(s.observedAt), units: toUnits(s.balance, { allowZero: true }) }))
    .sort((a, b) => a.at - b.at); // stable: equal times keep the caller's order
  if (snaps.some(s => !Number.isFinite(s.at))) throw ledgerError("มียอดคงเหลือที่ไม่มีเวลา ไม่สามารถกระทบยอดได้");
  const moves = movements.map(m => ({
    ...m, at: Date.parse(m.occurredAt),
    // unknown: a movement happened but its size is not known (e.g. a completed fill that logged no debit)
    units: m.unknown ? 0n : typeof m.effect === "bigint" ? m.effect : BigInt(String(m.effect)),
  }));
  const unplaced = moves.filter(m => !Number.isFinite(m.at));
  if (unplaced.length) throw ledgerError("มีรายการที่ไม่มีเวลา ไม่สามารถกระทบยอดได้");

  const segments = [];
  for (let i = 1; i < snaps.length; i++) {
    const from = snaps[i - 1], to = snaps[i];
    const inside = moves.filter(m => m.at > from.at && m.at <= to.at);
    const bySource = {};
    for (const m of inside) bySource[m.source] = (bySource[m.source] ?? 0n) + m.units;
    const explained = inside.reduce((sum, m) => sum + m.units, 0n);
    const expected = from.units + explained;
    const unexplained = to.units - expected;
    segments.push({
      from: from.observedAt, to: to.observedAt,
      // Optional labels of the two observations, e.g. "before K1" / "after K1".
      fromTag: from.tag ?? null, toTag: to.tag ?? null,
      refs: [...new Set(inside.map(m => m.ref).filter(Boolean).map(String))],
      openingBalance: fromUnits(from.units), closingBalance: fromUnits(to.units),
      expectedBalance: fromUnits(expected),
      bySource: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, fromUnits(v)])),
      movementCount: inside.length,
      unexplained: fromUnits(unexplained),
      // A window holding a movement of unknown size cannot be judged either way.
      status: inside.some(m => m.unknown) ? "unverifiable" : (unexplained < 0n ? -unexplained : unexplained) <= tol ? "match" : "mismatch",
    });
  }
  const last = snaps.at(-1);
  const after = last ? moves.filter(m => m.at > last.at) : moves;
  // The same order spent by a bot and also recorded by a person is counted twice.
  const refsBy = source => new Set(moves.filter(m => m.source === source && m.ref).map(m => String(m.ref)));
  const botRefs = refsBy("bot");
  const doubleCounted = [...refsBy("manual_use")].filter(ref => botRefs.has(ref)).sort();
  return {
    segments,
    mismatches: segments.filter(s => s.status === "mismatch").length,
    unverifiable: segments.filter(s => s.status === "unverifiable").length,
    doubleCounted,
    // Movements after the latest snapshot are not yet verifiable.
    pendingSinceLastSnapshot: fromUnits(after.reduce((sum, m) => sum + m.units, 0n)),
    estimatedBalance: last ? fromUnits(last.units + after.reduce((sum, m) => sum + m.units, 0n)) : null,
  };
}
