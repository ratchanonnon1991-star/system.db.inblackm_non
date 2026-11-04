// The accounting workbooks ("ข้อมูลบัญชี M-YYYY" folders on Drive: 1.1 สั่งซื้อสินค้า,
// 1.2 แลกเงิน, 1.3 ใช้จ่ายทั่วไป, 1.4 Cash Flow / Multi Game Card, 1.5 …) read into
// the system. Every tab of every file is kept row by row so it can be looked
// up here; the three Stock wallet tabs of 1.2 (Bybit Inblack Gaming, BITKUB
// INBLACK, Bitazza Inblack) also become wallet entries.
// The sheets keep logins next to e-mails and card PINs / passwords in their
// own columns: those cells are dropped before anything is stored.
// Pure: the importer and the tests share it.
import { fromWalletUnits, toWalletUnits } from "@/lib/stock-wallets";

export const ACCOUNT_SHEET_SOURCE = "account-sheet";
export const ACCOUNT_SHEET_ACTOR = "ยกมาจากชีตข้อมูลบัญชี";
export const REMOVED_CELL = "(ลบข้อมูลลับออก)";

const squash = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

/** "ข้อมูลบัญชี 10-2026" → "2026-10"; null when the folder is not a month. */
export function sheetPeriod(folderName) {
  const match = /(\d{1,2})-(\d{4})\s*$/.exec(squash(folderName));
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12) return null;
  return `${match[2]}-${match[1].padStart(2, "0")}`;
}

/** "1.2 บัญชีแลกเงิน 10_2026.xlsx" → "1.2 บัญชีแลกเงิน": the same workbook across months. */
export function sheetFileKind(fileName) {
  return squash(String(fileName).replace(/\.xlsx$/i, "").replace(/\s*\d{1,2}_\d{4}$/, "")) || squash(fileName);
}

/** Excel day serial → "YYYY-MM-DD" (only plausible years), else null. */
export function excelDate(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 36526 || n > 55153) return null; // 2000-01-01 … 2050-12-31
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);
}

/**
 * The sheets' time column → minutes after midnight, or null. They hold a day
 * fraction (0.59 → 14:09), "hour.minute" typed as a number (9.4 → 9:40,
 * 10.19 → 10:19) or text ("21:51:").
 */
export function sheetMinutes(value) {
  const text = squash(value);
  if (!text) return null;
  const clock = /^(\d{1,2})[:.](\d{1,2})(?::\d{0,2})?$/.exec(text);
  const n = Number(text);
  if (Number.isFinite(n) && n >= 0 && n < 1 && !/^\d{1,2}[:]/.test(text)) return Math.round(n * 1440) % 1440;
  if (!clock) return null;
  const hours = Number(clock[1]);
  let minutes = Number(clock[2]);
  if (text.includes(".") && clock[2].length === 1) minutes *= 10; // 9.4 is 9:40
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

const EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
const SECRET_HEADER = /^(pin|pass|password|passwords|รหัสผ่าน|otp|2fa|seed phrase|private key)$/i;
const NUMBER = /^-?[\d,]*\.?\d+(e-?\d+)?$/i;
const LOGIN_LIKE = /^(?=.*[A-Za-z])(?=.*\d)\S{6,}$/;
const EMAIL_THEN_WORD = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)\s+(\S+)/g;

/**
 * rows: [[text, …], …] in sheet order → { rows, removed }. Drops a login typed
 * right after an e-mail (a non-number without spaces) or after one in the same
 * cell, and everything below a PIN / Password / OTP header.
 */
export function scrubSheetRows(rows) {
  const secretCols = new Set();
  let removed = 0;
  const out = rows.map((row) => {
    const cells = row.map((cell) => squash(cell));
    for (let col = 0; col < cells.length; col += 1) {
      if (SECRET_HEADER.test(cells[col])) {
        secretCols.add(col);
        continue;
      }
      if (secretCols.has(col) && cells[col]) {
        cells[col] = REMOVED_CELL;
        removed += 1;
      }
    }
    // An e-mail and its password typed in one cell ("x@gmail.com Pass123"): the e-mail stays.
    for (let col = 0; col < cells.length; col += 1) {
      const kept = cells[col].replace(EMAIL_THEN_WORD, (whole, email, word) => (LOGIN_LIKE.test(word) ? `${email} ${REMOVED_CELL}` : whole));
      if (kept !== cells[col]) {
        cells[col] = kept;
        removed += 1;
      }
    }
    // Header rows also hold an account's login typed beside its name ("Hero5713", "Ayetun786#").
    if (cells.some((cell) => /^(date|วันที่)$/i.test(cell))) {
      for (let col = 0; col < cells.length; col += 1) {
        if (LOGIN_LIKE.test(cells[col]) && !EMAIL.test(cells[col])) {
          cells[col] = REMOVED_CELL;
          removed += 1;
        }
      }
    }
    for (let col = 0; col < cells.length - 1; col += 1) {
      const next = cells[col + 1];
      if (EMAIL.test(cells[col]) && next && next !== REMOVED_CELL && !NUMBER.test(next) && !/\s/.test(next)) {
        cells[col + 1] = REMOVED_CELL;
        removed += 1;
      }
    }
    return cells;
  });
  return { rows: out, removed };
}

/**
 * Date and time columns (a header cell "Date" / "วันที่…" / "time" / "เวลา")
 * hold serial numbers in an .xlsx: shown as 2026-10-01 and 14:12 instead.
 */
export function readableSheetRows(rows) {
  let dateCols = new Set();
  let timeCols = new Set();
  return rows.map((row) => {
    const isHeader = row.some((cell) => /^(date|วันที่)/i.test(cell)) && row.filter((cell) => cell && !NUMBER.test(cell)).length >= 2;
    if (isHeader) {
      dateCols = new Set(row.flatMap((cell, col) => (/^(date|วันที่)/i.test(cell) ? [col] : [])));
      timeCols = new Set(row.flatMap((cell, col) => (/^(time|เวลา)$/i.test(cell) ? [col] : [])));
      return row;
    }
    return row.map((cell, col) => {
      if (dateCols.has(col)) return excelDate(cell) || cell;
      if (timeCols.has(col) && NUMBER.test(cell) && Number(cell) < 1) {
        const minutes = sheetMinutes(cell);
        return minutes == null ? cell : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      }
      return cell;
    });
  });
}

// ---- wallet tabs --------------------------------------------------------------------------

const units = (value) => {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || String(value ?? "").trim() === "") return null;
  return toWalletUnits(n.toFixed(8));
};

/*
 * Which tab feeds which wallet, and how its columns read. Layouts:
 *   exchange  Bybit / Bitazza / Binance: "<CUR> ที่ได้ / ที่ใช้ / FEE / ที่ใข้ (รวม)" then the balance
 *   bitkub    BITKUB: THB เข้า / ออก / คงเหลือ and USDT เข้า (manual) / ออก / FEE / คงเหลือ
 *   ledger    one in, out (and fee) and balance column per currency, named in `currencies`
 * `mentions` is how other tabs name this wallet, to pair a transfer's two sides.
 */
const PHP_LIKE = (cur, balance = `${cur} คงเหลือ`) => ({
  layout: "ledger", currencies: { [cur]: { in: [`${cur} ที่ได้รับ`], out: [`${cur} ที่จ่าย`], balance: [balance] } },
  desc: ["TOP UP NUMBER"], note: ["หมายเหตุ 1"],
});
export const WALLET_SHEETS = [
  { code: "bitazza", tabs: ["Bitazza Inblack"], layout: "exchange", mentions: /bitazza/i },
  { code: "bitkub", tabs: ["BITKUB INBLACK"], layout: "bitkub", mentions: /bitkub(?!\s*(p'?aek|p'?tos|songkran))/i },
  { code: "bybit", tabs: ["Bybit Inblack Gaming"], layout: "exchange", mentions: /bybit(?!\s*p'?aek)/i },
  { code: "bitkub-ptos", tabs: ["BITKUB Ptos", "BITKUB PTos"], layout: "bitkub", mentions: /bitkub\s*p'?tos/i },
  { code: "bitkub-songkran", tabs: ["BITKUB Songkran"], layout: "bitkub", mentions: /songkran/i },
  { code: "bybit-paek", tabs: ["Bybit PAek"], layout: "exchange", mentions: /bybit\s*p'?aek/i },
  { code: "tnt-vincent", tabs: ["TNT Vincent"], ...PHP_LIKE("PHP") },
  { code: "tnt-emalyn", tabs: ["TNT Emalyn"], ...PHP_LIKE("PHP") },
  { code: "tnt-hero", tabs: ["TNT Hero"], ...PHP_LIKE("PHP") },
  { code: "tnt-jake", tabs: ["TNT Jake"], ...PHP_LIKE("PHP") },
  { code: "php-emalyn", tabs: ["PHP Emalyn"], ...PHP_LIKE("PHP") },
  { code: "idr-amen", tabs: ["IDR Amen"], ...PHP_LIKE("IDR", "PHP คงเหลือ") }, // the sheet calls its IDR balance "PHP คงเหลือ"
  { code: "xl-amen", tabs: ["XL Amen"], ...PHP_LIKE("IDR", "PHP คงเหลือ") },
  { code: "zelle", tabs: ["Zelle ( USD )"], layout: "ledger", currencies: { USD: { in: ["USD ที่โอน"], out: ["USD ที่ใช้"], balance: ["USD คงเหลือ"] } }, desc: ["Gocash ที่สั่ง"] },
  { code: "jpy-exchange", tabs: ["JPY Exchange"], layout: "ledger", currencies: {
    USD: { in: ["USD ที่โอน"], out: ["USD ที่ใช้"], balance: ["USD คงเหลือ"] },
    JPY: { in: ["JPY ที่ได้"], out: ["JPY ที่ใช้"], balance: ["JPY คงเหลือ"] },
  } },
  { code: "amaten", tabs: ["Amaten ( JPY )"], layout: "ledger", currencies: { JPY: { in: ["JPY ที่เติม"], out: ["JPY ที่ใช้"], balance: ["JPY คงเหลือ"] } }, skip: ["Code Bitcash"] },
  { code: "myr-plsbuy", tabs: ["MYR ( Plsbuy )"], layout: "ledger", currencies: { MYR: { in: ["MYR ที่ได้รับ"], out: ["MYR ที่จ่าย"], balance: ["MYR คงเหลือ"] } }, desc: ["TOP UP MAIL"] },
  // Google UAH's "UAH ที่จ่าย" is the USDT cost of the top-up; the UAH spent is "UAH ที่ได้ชำระ".
  { code: "google-uah", tabs: ["Google UAH"], layout: "ledger", currencies: { UAH: { in: ["UAH ที่ได้รับ"], out: ["UAH ที่ได้ชำระ"], balance: ["UAH คงเหลือ"] } }, desc: ["TOP UP MAIL"] },
];
const SHEET_BY_TAB = new Map(WALLET_SHEETS.flatMap((spec) => spec.tabs.map((tab) => [squash(tab).toLowerCase(), spec])));
const SHEET_BY_CODE = new Map(WALLET_SHEETS.map((spec) => [spec.code, spec]));
/** The wallet a tab of 1.2 could feed (whether or not it is imported), or null. */
export const walletSheetForTab = (fileName, tab) =>
  /^1\.2\b/.test(String(fileName).trim()) ? SHEET_BY_TAB.get(squash(tab).toLowerCase()) || null : null;
/** The wallet a tab of 1.2 feeds, among `codes` (default: every wallet sheet), or null. */
export const walletCodeForTab = (fileName, tab, codes = null) => {
  const code = walletSheetForTab(fileName, tab)?.code || null;
  return code && (!codes || codes.includes(code)) ? code : null;
};
export const WALLET_TABS = Object.fromEntries(WALLET_SHEETS.slice(0, 3).map((spec) => [spec.code, spec.tabs[0]]));

const OPENING_WORDS = new Set(["ย้ายยอด", "ยอดยกมา", "ยกยอดมา"]);
const isDateLabel = (cell) => /^(date|วันที่)$/i.test(squash(cell));

/** Header labels → the columns one wallet tab needs. */
function walletColumns(spec, header) {
  const cells = header.map(squash);
  const find = (labels, from = 0) => {
    for (const label of labels) {
      const exact = cells.findIndex((cell, col) => col >= from && cell === label);
      if (exact >= 0) return exact;
    }
    for (const label of labels) {
      const loose = cells.findIndex((cell, col) => col >= from && cell.toLowerCase() === label.toLowerCase());
      if (loose >= 0) return loose;
    }
    return -1;
  };
  const date = cells.findIndex(isDateLabel);
  const base = { labels: cells, date, time: find(["time", "TIME", "เวลา"]), status: find(["สถานะ"]), note: -1, order: -1, desc: -1, skip: [], currencies: {} };
  if (spec.layout === "bitkub") {
    return {
      ...base, desc: find(["รายการใช้จ่าย"]), order: find(["Order"]), note: find(["หมายเหตุ 1"]),
      currencies: {
        THB: { in: find(["BITKUB ( THB เข้า )"]), out: find(["BITKUB ( THB ออก )"]), fee: -1, balance: find(["BITKUB ( THB คงเหลือ)", "BITKUB ( THB คงเหลือ"]) },
        USDT: { in: find(["USDT เข้า ( manual )"]), out: find(["USDT ออก"]), fee: find(["USDT FEE"]), balance: find(["USDT คงเหลือ"]) },
      },
    };
  }
  if (spec.layout === "exchange") {
    const currencies = {};
    for (const currency of ["USDT", "USDC", "BTC"]) {
      const total = find([`${currency} ที่ใข้ (รวม)`]);
      const cols = { in: find([`${currency} ที่ได้`]), out: find([`${currency} ที่ใช้`]), fee: find([`${currency} FEE`]), balance: total < 0 ? -1 : total + 1 };
      if (cols.in >= 0 || cols.out >= 0) currencies[currency] = cols;
    }
    return { ...base, desc: find(["MMK In"]), note: find(["หมายเหตุ 1"]), currencies };
  }
  const currencies = {};
  for (const [currency, labels] of Object.entries(spec.currencies)) {
    currencies[currency] = { in: find(labels.in), out: find(labels.out), fee: labels.fee ? find(labels.fee) : -1, balance: find(labels.balance) };
  }
  return { ...base, desc: spec.desc ? find(spec.desc) : -1, note: spec.note ? find(spec.note) : -1, skip: (spec.skip || []).map((label) => find([label])), currencies };
}

const usedColumns = (cols) => new Set([cols.date, cols.time, cols.status, cols.desc, ...cols.skip,
  ...Object.values(cols.currencies).flatMap((c) => [c.in, c.out, c.fee, c.balance])]);

/**
 * The row's other named columns, to show where the money went and its proof:
 * Order, หมายเหตุ, Account / Amount 2, rate, balance before / after a top-up,
 * picture links. [{ label, value }]; zeros, formula errors and dropped cells left out.
 */
export function rowDetails(cells, cols) {
  const used = usedColumns(cols);
  const out = [];
  cells.forEach((cell, col) => {
    const label = squash(cols.labels?.[col]);
    const value = squash(cell);
    // Formula columns (totals, the sheet's own rate maths) repeat what the entry already shows.
    if (used.has(col) || !label || !value || /^check|\(รวม\)|สูตร|USDT RATE|fee 0\.25/i.test(label) || value === REMOVED_CELL) return;
    if (/^#(DIV|REF|N\/A|VALUE)/i.test(value) || (NUMBER.test(value) && Number(value) === 0) || value === "-") return;
    out.push({ label, value: value.slice(0, 300) });
  });
  return out.slice(0, 14);
}

/** Text of the row that no column is mapped to: the ledger tabs' unnamed description. */
function looseText(cells, cols) {
  const used = new Set([...usedColumns(cols), cols.note, cols.order]);
  return cells
    .map((cell, col) => (used.has(col) ? "" : squash(cell)))
    .filter((cell) => cell && !NUMBER.test(cell) && !/^https?:/i.test(cell) && !/^#(DIV|REF|N\/A|VALUE)/i.test(cell) && cell !== REMOVED_CELL)
    .slice(0, 3)
    .join(" · ");
}

/**
 * One wallet tab of one month → { records, problems }. A record is a sheet row
 * with money on it: { rowNo, date, minutes, desc, order, status, note,
 * opening, moves: { CUR: { in, out, fee } }, balances: { CUR: units } }.
 * The carried balance ("ย้ายยอด" / "ยอดยกมา", or the tab's first row with a
 * balance and nothing named) is opening: true. A row dated outside the file's
 * month is marked slipped (an old row copied along, or a typo).
 */
export function parseWalletTab(codeOrSpec, rows, period) {
  const spec = typeof codeOrSpec === "string" ? SHEET_BY_CODE.get(codeOrSpec) : codeOrSpec;
  if (!spec) throw new Error(`ไม่รู้จักกระเป๋า ${codeOrSpec}`);
  const records = [];
  const problems = [];
  let cols = null;
  let lastDate = null;
  const firstDay = `${period}-01`;
  const inMonth = (date) => {
    const offset = (Date.parse(date) - Date.parse(firstDay)) / 86400000;
    return offset >= -10 && offset <= 45;
  };
  rows.forEach((cells, index) => {
    const rowNo = index + 1;
    if (cells.some(isDateLabel)) {
      // A repeated header sometimes leaves a label out (Jan Bybit drops "USDT ที่ได้"): keep the earlier column.
      const next = walletColumns(spec, cells);
      if (cols) {
        next.labels = next.labels.map((label, col) => label || cols.labels[col] || "");
        for (const field of ["date", "time", "desc", "order", "status", "note"]) if (next[field] < 0 && cols[field] >= 0) next[field] = cols[field];
        for (const [currency, prev] of Object.entries(cols.currencies)) {
          next.currencies[currency] = next.currencies[currency] || { ...prev };
          for (const field of ["in", "out", "fee", "balance"]) if (next.currencies[currency][field] < 0) next.currencies[currency][field] = prev[field];
        }
      }
      cols = next;
      return;
    }
    if (!cols) return;
    // Bybit-style tabs name a few columns on the row under the header ("Account 1", "Amount 1", "Order").
    if (cells.some((cell) => /^Account [12]$/.test(squash(cell)))) {
      cols = { ...cols, labels: cols.labels.map((label, col) => label || squash(cells[col])) };
      return;
    }
    const get = (col) => (col >= 0 ? squash(cells[col]) : "");
    let date = excelDate(get(cols.date)) || null;
    let slip = null;
    // A date far outside the file's month is a slip (late-August rows typed as 4 July): use the row above's.
    if (date && !inMonth(date)) {
      slip = { rowNo, sheetDate: date, reason: `วันที่ ${date} อยู่นอกเดือนของไฟล์ ใช้ ${lastDate || firstDay} แทน` };
      date = lastDate || firstDay;
    }
    if (date) lastDate = date;
    const moves = {};
    const balances = {};
    for (const [currency, c] of Object.entries(cols.currencies)) {
      const move = { in: units(get(c.in)) ?? 0n, out: units(get(c.out)) ?? 0n, fee: units(get(c.fee)) ?? 0n };
      if (move.in < 0n || move.out < 0n || move.fee < 0n) problems.push({ rowNo, reason: `${currency} ติดลบในช่องเข้า/ออก` });
      if (move.in > 0n || move.out > 0n || move.fee > 0n) moves[currency] = move;
      const balance = units(get(c.balance));
      if (balance !== null) balances[currency] = balance;
    }
    let desc = get(cols.desc);
    if (spec.layout === "ledger" && cols.desc < 0) desc = looseText(cells, cols);
    const named = cells.some((cell) => OPENING_WORDS.has(squash(cell)));
    // The ledger tabs carry last months' rows along under their old dates: only the file's own month counts.
    if (slip && spec.layout === "ledger" && !named) return;
    const hasMoves = Object.keys(moves).length > 0;
    const hasBalance = Object.keys(balances).length > 0;
    const ledger = spec.layout === "ledger";
    const opening = named || (!records.length && hasBalance && (ledger ? !hasMoves : !desc || !hasMoves));
    // A ledger tab that starts straight on a money row: its balance less that row is what was carried in.
    if (ledger && !opening && !records.length && hasMoves && hasBalance) {
      const carried = Object.fromEntries(Object.entries(balances).map(([currency, balance]) => {
        const move = moves[currency] || { in: 0n, out: 0n, fee: 0n };
        return [currency, balance - move.in + move.out + move.fee];
      }));
      records.push({ rowNo, desc: "", order: "", status: "", note: "", date: firstDay, minutes: 0, opening: true, moves: {}, balances: carried, details: [] });
    }
    if (!opening && !hasMoves) return;
    if (slip && !opening) problems.push({ ...slip, desc });
    const base = { rowNo, desc, order: get(cols.order), status: get(cols.status), note: get(cols.note), ...(slip ? { slipped: true, sheetDate: slip.sheetDate } : {}) };
    records.push({ ...base, date: opening ? firstDay : date || lastDate || firstDay, minutes: opening ? 0 : sheetMinutes(get(cols.time)),
      opening, moves: opening ? {} : moves, balances, details: opening ? [] : rowDetails(cells, cols) });
  });
  return { records, problems };
}

const mentions = (code, text) => Boolean(SHEET_BY_CODE.get(code)?.mentions?.test(text || ""));
const BANGKOK = "+07:00";
const stamp = (date, minutes) =>
  `${date}T${String(Math.floor((minutes || 0) / 60)).padStart(2, "0")}:${String((minutes || 0) % 60).padStart(2, "0")}:00${BANGKOK}`;

/**
 * Wallet tabs of every month → the entries to store, oldest first, and how the
 * sheet and the system compare. `tabs`: [{ code, period, tab, records }].
 * Each entry: { kind, title, note, status, occurredAt, sourceRef, details,
 * sheet: { period, tab, rowNo }, legs: [{ walletCode, currency, amount (BigInt,
 * signed), fee (BigInt) }] }.
 *   in only            deposit
 *   out (+fee) only    payment
 *   out + in, 2 coins  exchange in one wallet
 *   out of A matching an in of B (same coin and amount, a day and a half apart
 *   at most, one side naming the other wallet) → one transfer
 * A month's carried balance that differs from the running total, and the last
 * month's closing balance, become corrections, so every wallet ends where its
 * sheet ends. `checks` holds, per wallet, month and currency, the sheet's and
 * the system's opening and closing balance and the rows where the sheet's own
 * balance column stops matching the rows above it.
 */
export function planWalletEntries(tabs) {
  const entries = [];
  const mismatches = [];
  const checks = [];
  const running = {};
  const key = (code, currency) => `${code}:${currency}`;
  const add = (code, currency, amount) => {
    running[key(code, currency)] = (running[key(code, currency)] ?? 0n) + amount;
  };
  const closing = {};
  const adjust = (code, currency, diff, when, note, sourceRef, sheet) => {
    entries.push({ kind: "adjust", title: "", note, status: "done", occurredAt: when, sourceRef, details: [], sheet, legs: [{ walletCode: code, currency, amount: diff, fee: 0n }] });
    add(code, currency, diff);
  };
  const tolerance = (currency) => (currency === "BTC" ? 1000n : 1000000n); // 0.00001 BTC, 0.01 otherwise

  // Each month's file covers from its first own row to the next file's first own
  // row: a file runs a few days into the next month (June's to 3 July, July's
  // starts on the 4th) and may repeat the last days of the one before.
  const DAY = 86400000;
  const startOf = (t) => {
    const from = Date.parse(`${t.period}-01`) - 3 * DAY;
    const first = t.records.find((record) => !record.opening && !record.slipped && Date.parse(record.date) >= from)?.date;
    return first && Date.parse(first) - Date.parse(`${t.period}-01`) <= 10 * DAY ? first : `${t.period}-01`;
  };
  const sameWallet = (code) => tabs.filter((t) => t.code === code).sort((a, b) => a.period.localeCompare(b.period));
  // A row dated in an earlier year is an old row copied along: dropped.
  let copies = 0;
  const yearStart = (code) => Date.parse(`${sameWallet(code)[0].period}-01`) - 10 * DAY;
  const isCopy = (t, record) => record.slipped && !record.opening && Date.parse(record.sheetDate) < yearStart(t.code);
  let overlap = 0;
  for (const t of tabs) {
    const { code, period, tab, records: all } = t;
    const list = sameWallet(code);
    const at = list.indexOf(t);
    const from = at > 0 ? startOf(t) : null;
    const until = at < list.length - 1 ? startOf(list[at + 1]) : null;
    const kept = all.filter((record) => !isCopy(t, record));
    copies += all.length - kept.length;
    const records = kept.filter((record) => record.opening || ((!from || record.date >= from) && (!until || record.date < until)));
    overlap += kept.length - records.length;
    let minutes = 0;
    const lastBalances = {};
    let lastWhen = stamp(`${period}-01`, 0);
    const monthCheck = {};
    const checkOf = (currency) => (monthCheck[currency] ||= { code, period, tab, currency, sheetOpen: null, systemOpen: null, sheetClose: null, systemClose: null, rows: 0, drifts: [], driftBase: 0n });
    for (const record of records) {
      if (record.minutes != null) minutes = record.minutes;
      const when = stamp(record.date, record.opening ? 0 : minutes);
      lastWhen = when > lastWhen ? when : lastWhen;
      const ref = `${ACCOUNT_SHEET_SOURCE}:${period}:${code}:${record.rowNo}`;
      const sheet = { period, tab, rowNo: record.rowNo };
      const where = `ชีต ${period} · ${tab} แถว ${record.rowNo}`;
      if (record.opening) {
        for (const [currency, balance] of Object.entries(record.balances)) {
          const check = checkOf(currency);
          const before = running[key(code, currency)];
          check.sheetOpen = fromWalletUnits(balance);
          check.systemOpen = before === undefined ? null : fromWalletUnits(before);
          check.driftBase = 0n;
          const diff = balance - (before ?? 0n);
          if (diff === 0n) continue;
          if (before !== undefined) mismatches.push({ code, period, currency, rowNo: record.rowNo, sheet: fromWalletUnits(balance), computed: fromWalletUnits(before) });
          adjust(code, currency, diff, when,
            before === undefined ? `ยอดยกมาตามชีต (${where})` : `ยอดยกมาในชีตต่างจากยอดที่คำนวณ ${fromWalletUnits(before)} (${where})`,
            `${ref}:${currency}`, sheet);
        }
        Object.assign(lastBalances, record.balances);
        continue;
      }
      Object.assign(lastBalances, record.balances);
      const extra = [record.order && `Order ${record.order}`, record.note, record.status && record.status !== "เรียบร้อย" && `สถานะในชีต: ${record.status}`]
        .filter(Boolean).join(" · ");
      const outs = Object.entries(record.moves).filter(([, m]) => m.out > 0n || (m.fee > 0n && m.in === 0n));
      const ins = Object.entries(record.moves).filter(([, m]) => m.in > 0n);
      const base = { title: (record.desc || "รายการจากชีต").slice(0, 200), note: extra, status: "done", occurredAt: when, sourceRef: ref, code, desc: record.desc,
        details: record.details || [], sheet };
      if (outs.length === 1 && ins.length === 1 && outs[0][0] !== ins[0][0] && outs[0][1].in === 0n && ins[0][1].out === 0n) {
        const [[fromCur, fromMove], [toCur, toMove]] = [outs[0], ins[0]];
        entries.push({ ...base, kind: "exchange", legs: [
          { walletCode: code, currency: fromCur, amount: -(fromMove.out + fromMove.fee), fee: fromMove.fee },
          { walletCode: code, currency: toCur, amount: toMove.in - toMove.fee, fee: toMove.fee },
        ] });
      } else {
        for (const [currency, move] of Object.entries(record.moves)) {
          const suffix = Object.keys(record.moves).length > 1 ? `:${currency}` : "";
          if (move.in > 0n) {
            entries.push({ ...base, sourceRef: `${ref}${suffix}${move.out > 0n ? ":in" : ""}`, kind: "deposit", amountIn: move.in,
              legs: [{ walletCode: code, currency, amount: move.in - (move.out > 0n ? 0n : move.fee), fee: move.out > 0n ? 0n : move.fee }] });
          }
          if (move.out > 0n || (move.fee > 0n && move.in === 0n)) {
            entries.push({ ...base, sourceRef: `${ref}${suffix}${move.in > 0n ? ":out" : ""}`, kind: "payment", amountOut: move.out,
              legs: [{ walletCode: code, currency, amount: -(move.out + move.fee), fee: move.fee }] });
          }
        }
      }
      for (const [currency, move] of Object.entries(record.moves)) {
        add(code, currency, move.in - move.out - move.fee);
        checkOf(currency).rows += 1;
      }
      // Where the sheet's own balance column stops following its rows.
      for (const [currency, balance] of Object.entries(record.balances)) {
        if (!record.moves[currency]) continue;
        const check = checkOf(currency);
        const now = running[key(code, currency)] ?? 0n;
        const diff = balance - now;
        const step = diff - check.driftBase;
        if (step > tolerance(currency) || -step > tolerance(currency)) {
          if (check.drifts.length < 30) check.drifts.push({ rowNo: record.rowNo, desc: record.desc, sheet: fromWalletUnits(balance), system: fromWalletUnits(now), step: fromWalletUnits(step) });
          check.driftBase = diff;
        }
      }
    }
    for (const [currency, balance] of Object.entries(lastBalances)) {
      const check = checkOf(currency);
      check.sheetClose = fromWalletUnits(balance);
      check.systemClose = fromWalletUnits(running[key(code, currency)] ?? 0n);
    }
    for (const check of Object.values(monthCheck)) {
      delete check.driftBase;
      checks.push(check);
    }
    closing[code] = { period, balances: lastBalances, when: lastWhen, tab };
  }

  // The newest month's closing balance per wallet is what the sheet says now.
  for (const [code, { period, balances, when, tab }] of Object.entries(closing)) {
    for (const [currency, balance] of Object.entries(balances)) {
      const diff = balance - (running[key(code, currency)] ?? 0n);
      if (diff === 0n) continue;
      mismatches.push({ code, period, currency, rowNo: "ท้ายชีต", sheet: fromWalletUnits(balance), computed: fromWalletUnits(running[key(code, currency)] ?? 0n) });
      adjust(code, currency, diff, when, `ปรับให้ตรงยอดคงเหลือล่าสุดในชีต ${period} · ${tab} (คำนวณได้ ${fromWalletUnits(running[key(code, currency)] ?? 0n)})`,
        `${ACCOUNT_SHEET_SOURCE}:${period}:${code}:closing:${currency}`, { period, tab, rowNo: null });
    }
  }

  // Pair a payment out of one wallet with the deposit it became in another.
  const deposits = entries.filter((entry) => entry.kind === "deposit" && entry.legs[0].fee === 0n);
  const used = new Set();
  for (const payment of entries) {
    if (payment.kind !== "payment") continue;
    const leg = payment.legs[0];
    const match = deposits.find((deposit) => {
      if (used.has(deposit) || deposit.code === payment.code) return false;
      const to = deposit.legs[0];
      if (to.currency !== leg.currency || to.amount !== payment.amountOut) return false;
      if (Math.abs(Date.parse(deposit.occurredAt) - Date.parse(payment.occurredAt)) > 36 * 3600 * 1000) return false;
      return mentions(deposit.code, payment.desc) || mentions(payment.code, deposit.desc);
    });
    if (!match) continue;
    used.add(match);
    payment.kind = "transfer";
    payment.receivedAt = { ...match.sheet, title: match.title };
    payment.note = [payment.note, match.note && `รับเข้า: ${match.note}`].filter(Boolean).join(" · ");
    payment.details = [...payment.details, ...match.details.map((item) => ({ ...item, label: `รับเข้า · ${item.label}` }))];
    payment.legs = [leg, { ...match.legs[0] }];
  }

  const out = entries
    .filter((entry) => !used.has(entry))
    .map(({ kind, title, note, status, occurredAt, sourceRef, legs, details, sheet, receivedAt }) => ({
      kind, title: kind === "adjust" ? "" : title, note: note.slice(0, 500), status, occurredAt, sourceRef, legs, details: details || [], sheet: sheet || null, receivedAt: receivedAt || null,
    }))
    .map((entry, order) => ({ ...entry, order }))
    .sort((a, b) => (a.occurredAt === b.occurredAt ? a.order - b.order : a.occurredAt < b.occurredAt ? -1 : 1))
    .map(({ order, ...entry }) => entry);
  const totals = Object.fromEntries(Object.entries(running).map(([k, v]) => [k, fromWalletUnits(v)]));
  return { entries: out, mismatches, totals, overlap, copies, checks };
}

// ---- where a payment went: the supplier's own tab -----------------------------------------------

const SUPPLIER_USDT = /^USDT ที่(ได้รับ|จ่าย|คำนวน)$/;
/** "Order (Miles)" → "miles"; "Order STOCK(YAYA)" → "yaya"; a tab without a name in brackets → null. */
export const supplierName = (tab) => (squash(tab).match(/\(([^)]+)\)\s*$/)?.[1] || "").trim().toLowerCase() || null;

/**
 * A supplier tab of 1.2 ("Order (Miles)", "ITunes (Panghou)", …: a "USDT ที่ได้รับ" column,
 * its name in brackets) → the rows where it received USDT: [{ period, tab, rowNo, date, amount }].
 * Not a supplier tab → [].
 */
export function supplierReceipts(fileName, tab, rows, period) {
  if (!/^1\.2\b/.test(String(fileName).trim()) || walletSheetForTab(fileName, tab) || !supplierName(tab)) return [];
  const out = [];
  let dateCol = -1;
  let usdtCol = -1;
  rows.forEach((cells, index) => {
    if (cells.some(isDateLabel)) {
      dateCol = cells.findIndex(isDateLabel);
      usdtCol = cells.findIndex((cell) => SUPPLIER_USDT.test(squash(cell)));
      return;
    }
    if (dateCol < 0 || usdtCol < 0) return;
    const date = excelDate(squash(cells[dateCol])) || (/^\d{4}-\d{2}-\d{2}$/.test(squash(cells[dateCol])) ? squash(cells[dateCol]) : null);
    const amount = units(squash(cells[usdtCol]));
    if (date && amount && amount > 0n) out.push({ period, tab, rowNo: index + 1, date, amount });
  });
  return out;
}

/**
 * Ties each USDT payment to the supplier row that received it: same amount (fee
 * left out), at most 3 days apart, and the payment names the supplier ("ITunes
 * Miles" → Order (Miles)). The closest date wins; a row is used once. Sets
 * entry.receivedAt = { period, tab, rowNo, title } on the entries it ties.
 */
export function linkSupplierReceipts(entries, receipts) {
  const used = new Set();
  const DAYS = 3 * 86400000;
  let linked = 0;
  for (const entry of entries) {
    if (entry.kind !== "payment" || entry.receivedAt) continue;
    const leg = entry.legs[0];
    if (leg?.currency !== "USDT") continue;
    const paid = -(leg.amount) - leg.fee;
    const desc = String(entry.title || "").toLowerCase();
    const at = Date.parse(entry.occurredAt);
    let best = null;
    for (const receipt of receipts) {
      if (used.has(receipt) || receipt.amount !== paid || !desc.includes(supplierName(receipt.tab))) continue;
      const gap = Math.abs(Date.parse(`${receipt.date}T12:00:00+07:00`) - at);
      if (gap <= DAYS && (!best || gap < best.gap)) best = { receipt, gap };
    }
    if (!best) continue;
    used.add(best.receipt);
    const { period, tab, rowNo } = best.receipt;
    entry.receivedAt = { period, tab, rowNo, title: tab };
    linked += 1;
  }
  return linked;
}

// ---- what the web shows ---------------------------------------------------------------------

export const WALLET_PAGE = { href: "/stock/wallets", label: "Stock → กระเป๋าเงิน" };

/**
 * Tabs kept ([{ period, fileKind, tab, rowCount, walletCode }]) → one line per
 * workbook tab across months: { fileKind, tab, periods, rows, page } where
 * `page` is the web page that already shows that data (null: only the kept rows).
 */
export function accountSheetCoverage(tabs) {
  const lines = new Map();
  for (const t of tabs) {
    const key = `${t.fileKind}\u0000${squash(t.tab).toLowerCase()}`;
    const line = lines.get(key) || { fileKind: t.fileKind, tab: squash(t.tab), periods: [], rows: 0, page: null };
    line.periods.push(t.period);
    line.rows += t.rowCount;
    if (t.walletCode) line.page = WALLET_PAGE;
    lines.set(key, line);
  }
  return [...lines.values()]
    .map((line) => ({ ...line, periods: [...new Set(line.periods)].sort() }))
    .sort((a, b) => a.fileKind.localeCompare(b.fileKind, "th") || a.tab.localeCompare(b.tab, "th"));
}
