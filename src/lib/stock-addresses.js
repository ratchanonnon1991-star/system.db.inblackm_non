// Where crypto goes when someone withdraws from Bybit (or another exchange): a saved
// address per recipient (a supplier, or one of our own wallets) with its coin, chain and
// memo, so the person paying copies them instead of typing. A new address only becomes
// usable once a second person has checked it against the recipient's own message.
// Pure: the API, the pages and the tests share it.

const BASE58 = "1-9A-HJ-NP-Za-km-z";
const EVM = /^0x[0-9a-fA-F]{40}$/;

/** Common chains, by the name Bybit shows: suggestions and a format hint, not a limit. */
export const ADDRESS_CHAINS = [
  { code: "TRC20", label: "TRC20 (Tron)", pattern: new RegExp(`^T[${BASE58}]{33}$`), hint: "ขึ้นต้นด้วย T ยาว 34 ตัว" },
  { code: "ERC20", label: "ERC20 (Ethereum)", pattern: EVM, hint: "ขึ้นต้นด้วย 0x ยาว 42 ตัว" },
  { code: "BEP20", label: "BSC (BEP20)", pattern: EVM, hint: "ขึ้นต้นด้วย 0x ยาว 42 ตัว" },
  { code: "ARBITRUM", label: "Arbitrum One", pattern: EVM, hint: "ขึ้นต้นด้วย 0x ยาว 42 ตัว" },
  { code: "POLYGON", label: "Polygon PoS", pattern: EVM, hint: "ขึ้นต้นด้วย 0x ยาว 42 ตัว" },
  { code: "OPTIMISM", label: "OP Mainnet", pattern: EVM, hint: "ขึ้นต้นด้วย 0x ยาว 42 ตัว" },
  { code: "BASE", label: "Base Mainnet", pattern: EVM, hint: "ขึ้นต้นด้วย 0x ยาว 42 ตัว" },
  { code: "AVAXC", label: "AVAX C-Chain", pattern: EVM, hint: "ขึ้นต้นด้วย 0x ยาว 42 ตัว" },
  { code: "SOL", label: "SOL (Solana)", pattern: new RegExp(`^[${BASE58}]{32,44}$`), hint: "ตัวอักษร 32–44 ตัว ไม่มี 0 O I l" },
  { code: "TON", label: "TON", pattern: /^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$|^-?\d:[0-9a-fA-F]{64}$/, hint: "ขึ้นต้นด้วย EQ หรือ UQ ยาว 48 ตัว", memo: true },
  { code: "BTC", label: "BTC (Bitcoin)", pattern: new RegExp(`^(bc1[02-9ac-hj-np-z]{11,71}|[13][${BASE58}]{25,34})$`), hint: "ขึ้นต้นด้วย bc1, 1 หรือ 3" },
  { code: "BYBIT_UID", label: "Bybit UID (โอนภายใน Bybit)", pattern: /^\d{6,12}$/, hint: "ตัวเลข UID ของบัญชี Bybit ปลายทาง" },
];
export const ADDRESS_STATUS_LABELS = { pending: "รออีกคนยืนยัน", confirmed: "ยืนยันแล้ว", retired: "เลิกใช้" };

const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
export const chainOf = (code) => ADDRESS_CHAINS.find((chain) => chain.code === code || chain.label.toLowerCase() === String(code || "").trim().toLowerCase()) || null;

/**
 * A new address as typed → { address: { recipient, coin, chain, address, memo, note }, warning }
 * or { error } in Thai. Spaces and line breaks pasted with the address are removed.
 * Money goes from Bybit to many other apps, so any chain name and address is accepted;
 * for a chain the list knows, an address that does not look like it only gives a warning.
 */
export function validateCryptoAddress(input) {
  const recipient = clean(input?.recipient, 120);
  if (!recipient) return { error: "ใส่ชื่อผู้รับ เช่น YAYA หรือ Bybit Inblack Gaming" };
  const coin = clean(input?.coin, 10).toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(coin)) return { error: "ใส่เหรียญ เช่น USDT, USDC, BTC" };
  const typedChain = clean(input?.chain, 40);
  if (!typedChain) return { error: "ใส่ chain ให้ตรงกับที่ผู้รับบอก เช่น TRC20, BSC (BEP20), SOL" };
  const known = chainOf(typedChain);
  const address = String(input?.address ?? "").replace(/\s+/g, "");
  if (!address) return { error: "ใส่ address" };
  if (address.length > 200) return { error: "address ยาวเกิน 200 ตัว" };
  const memo = String(input?.memo ?? "").replace(/\s+/g, "").slice(0, 120);
  const warning = known && !known.pattern.test(address)
    ? `address นี้ไม่เหมือนรูปแบบปกติของ ${known.label} (${known.hint}) ตรวจกับผู้รับอีกครั้งว่าเลือก chain ถูก`
    : "";
  return { address: { recipient, coin, chain: known ? known.code : typedChain, address, memo, note: clean(input?.note, 500) }, warning };
}

/**
 * Confirming or retiring a saved address → { status } or { error } in Thai.
 * Only someone other than who added it may confirm it; anyone may retire it, with a reason.
 * `entry`: { status, createdById }.
 */
export function addressDecision(entry, action, actor, reason = "") {
  if (!actor?.id) return { error: "ต้องเข้าสู่ระบบก่อน" };
  if (!entry || entry.status === "retired") return { error: "address นี้เลิกใช้แล้ว" };
  if (action === "confirm") {
    if (entry.status !== "pending") return { error: "address นี้ยืนยันแล้ว" };
    if (Number(entry.createdById) === Number(actor.id)) return { error: "ต้องให้อีกคนยืนยัน ไม่ใช่คนที่เพิ่ม address" };
    return { status: "confirmed" };
  }
  if (action === "retire") {
    if (!clean(reason, 500)) return { error: "ใส่เหตุผลที่เลิกใช้ เช่น ผู้รับเปลี่ยน address" };
    return { status: "retired" };
  }
  return { error: "เลือกยืนยันหรือเลิกใช้" };
}

/** "TQn9…" → ["TQn9", "Y2bS", …]: groups of 4 for reading against the exchange's screen. */
export const addressGroups = (address) => String(address || "").match(/.{1,4}/g) || [];

/** The saved addresses for a recipient and coin, usable (confirmed) first. */
export function addressesFor(list, { recipient = "", coin = "" } = {}) {
  const name = clean(recipient, 120).toLowerCase();
  const order = { confirmed: 0, pending: 1, retired: 2 };
  return (list || [])
    .filter((entry) => entry.status !== "retired")
    .filter((entry) => !name || entry.recipient.toLowerCase() === name || name.includes(entry.recipient.toLowerCase()) || entry.recipient.toLowerCase().includes(name))
    .filter((entry) => !coin || entry.coin === String(coin).toUpperCase())
    .sort((a, b) => order[a.status] - order[b.status] || a.recipient.localeCompare(b.recipient));
}
