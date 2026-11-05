// group: which section of the Topup Inventory home the card sits in (TOPUP_INVENTORY_GROUPS).
// currencies: the wallet currencies a card is found by. logo: file in public/topup-inventory,
// darkLogo when it is drawn for a black tile. icon: the lucide name the home draws without a logo.
export const TOPUP_INVENTORY_PROVIDERS = [
  { key: "reservations", group: "tools", icon: "reserve", name: "จองช่องทาง", description: "จองบัญชีที่จะใช้เติม แล้วเลือกพร้อมกรอกยอดที่ตัดในหน้าออเดอร์ inblackm (เว็บ · Russia · MarketPlace) คนอื่นเห็นว่าใครจองอะไร", ready: true },
  { key: "staff-links", group: "tools", icon: "users", name: "จับคู่พนักงาน", description: "จับคู่ User ID พนักงาน inblackm กับบัญชี tools เพื่อให้เลือกเมล iTune และบันทึกยอดจากช่องทางที่จองได้ในหน้าออเดอร์ (Super Admin)", ready: true },
  { key: "ledger", group: "tools", icon: "up", name: "ยกยอดเติมมือ", description: "เลือกบัญชีที่ใช้เติม ใส่หรือวางเลขออเดอร์กับยอดที่ตัด ระบบหักยอดให้ ใช้แทนการยกยอดในชีท Center", ready: true },
  { key: "channels", group: "tools", icon: "list", name: "ยอดเติมมือรายบัญชี", description: "สรุปยอดที่ยกจากหน้ายกยอด แยกตามบัญชีและกลุ่ม (Moniepoint, iTunes, Bitcash, Laos Telecom ฯลฯ) พร้อมรายการของแต่ละบัญชี", ready: true },
  { key: "alerts", group: "tools", icon: "bell", name: "แจ้งเตือนสต็อก", description: "ตั้งยอดเป้าหมายของแต่ละบัญชี ระบบส่ง Telegram เมื่อยอดคงเหลือต่ำกว่าครึ่งของยอดที่ตั้งไว้", ready: true },
  { key: "gamepoint", group: "asia", icon: "pad", currencies: ["MYR"], logo: "gamepoint.png", fullLogo: true, name: "Gamepoint", description: "ยอดตัด MYR จากผลบอทและ ledger พร้อมต้นทุน กำไร และยอดคงเหลือคำนวณแยกจากยอดที่บันทึก", ready: true },
  { key: "plsbuy", group: "asia", icon: "wallet", currencies: ["MYR"], logo: "plsbuy.png", name: "Plsbuy", description: "ประวัติ Plsbuy ยอด MYR ออก ต้นทุน กำไร และยอดอ้างอิงจากชีท", ready: true },
  { key: "donshop", group: "asia", icon: "wallet", currencies: ["IDR"], logo: "donshop.png", name: "Donshop", description: "ประวัติ Donshop ทุกสถานะ ยอด IDR ออก ต้นทุน กำไร และยอดคงเหลือหลังออเดอร์สำเร็จล่าสุด", ready: true },
  { key: "agenh2h", group: "asia", icon: "coins", currencies: ["IDR"], logo: "agenh2h.png", name: "AgenH2H", description: "ประวัติ AgenH2H ทุกสถานะ ยอด IDR ออก ต้นทุน กำไร และยอดคงเหลือหลังออเดอร์สำเร็จล่าสุด", ready: true },
  { key: "razer", group: "cards", icon: "coins", currencies: ["SGD", "CAD"], logo: "razer.png", darkLogo: true, name: "Razer Gold", description: "บัญชี Razer ทุกสกุลจาก Razer Stock และชีตที่นำเข้า พร้อม Gold / Silver ประวัติบอท และยอดเติมมือ แยกสกุลเงิน", ready: true },
  { key: "netease", group: "cards", icon: "pad", logo: "netease.png", name: "Netease", description: "Netease Pay และ Credit ตามชีท พร้อมยอดบอท ยอดออก ต้นทุน กำไร และประวัติรายการ", ready: true },
  { key: "garena-shell", group: "cards", icon: "shell", logo: "garena-shell.png", name: "Garena Shell", description: "สองบัญชี Shell พร้อมยอดบอท ประวัติออเดอร์ ต้นทุน และกำไร แยกยอดอ้างอิงจากชีท", ready: true },
  { key: "itune", group: "cards", icon: "music", logo: "itune.svg", name: "iTune", description: "จัดการเมล สกุลเงิน ยอดคงเหลือ และการจองเมลสำหรับเติมเกม", ready: true },
  { key: "usdcodashop", group: "cards", icon: "usd", currencies: ["USD"], logo: "usdcodashop.png", name: "USDCodashop", description: "จัดการบัญชี USD ผู้ลงรายการ ยอดปัจจุบัน ใช้ไป และคงเหลือ", ready: true },
  { key: "multigamecard", group: "cards", icon: "cards", logo: "multigamecard.png", darkLogo: true, name: "Multigamecard", description: "ยอดบัตรแยก Serial พร้อมประวัติ Bot และบันทึกรายการ Manual ยอดเข้า ใช้ไป และคงเหลือ", ready: true },
  { key: "wavepay", group: "wallet", icon: "phone", currencies: ["MMK"], logo: "wavepay.png", name: "WavePay", description: "ยอดคงเหลือ MMK แยกตามเบอร์ พร้อมออเดอร์ ต้นทุน และกำไรของแต่ละเบอร์", ready: true },
  { key: "moniepoint", group: "wallet", icon: "bank", currencies: ["NGN"], logo: "moniepoint.png", name: "Moniepoint", description: "บัญชี Moniepoint NP / SLY (NGN) ยอดใช้และรายการของแต่ละบัญชี จากชีตที่นำเข้า หน้ายกยอด และหน้าออเดอร์ inblackm", ready: true },
  // sheet: pages made only of imported sheet accounts, all drawn by one page (topup-inventory/[channel]).
  ...[
    ["u9", "wallet", "phone", ["MMK"], "U9", "กระเป๋า U9 (MMK) ทั้งฝั่งซิมและฝั่งไอดี"],
    ["atom", "wallet", "phone", ["MMK"], "ATOM", "กระเป๋า ATOM (MMK)"],
    ["mmk-bank", "wallet", "bank", ["MMK"], "ธนาคาร MMK", "KBZ, KBZpay, YOMA, CB, AYA และ OR RB (MMK)"],
    ["gcash", "wallet", "phone", [], "GCash", "GCash NP / RB (PHP)"],
    ["maya", "wallet", "phone", [], "Maya", "Maya NP (PHP)"],
    ["coins-ph", "wallet", "wallet", [], "Coins.ph", "Coins.ph NP / SLY (PHP)"],
    ["true-wallet", "wallet", "wallet", [], "True Wallet", "True Wallet (THB)"],
    ["tevau", "wallet", "cards", ["USD"], "Tevau", "บัตร Tevau (USD)"],
    ["etherfi", "wallet", "cards", ["USD"], "Ether.fi", "บัตร Ether.fi (JPY / USD)"],
    ["youtrip", "wallet", "cards", [], "Youtrip", "บัตร Youtrip (JPY)"],
    ["tnt", "cards", "phone", [], "TNT", "TNT load (PHP)"],
    ["ais-dtac", "cards", "phone", [], "AIS / DTAC", "เติมเงินมือถือ AIS และ DTAC (THB)"],
    ["bitcash", "cards", "cards", [], "Bitcash", "Bitcash inblackbot / inblackbc / Bitcash (JPY)"],
    ["xsolla", "cards", "coins", ["USD"], "Xsolla Gold", "Xsolla Gold Old / NP / Sup NP (USD)"],
    ["mycard", "cards", "cards", [], "MyCard", "MyCard NP (TWD)"],
    ["smile-one", "cards", "pad", ["USD"], "Smile One", "Smile One และ Smilecode"],
    ["unipin", "cards", "cards", ["IDR"], "Unipin", "Unipin IDR และ PHP"],
    ["easy-card", "cards", "cards", [], "Easy Card", "Easy Card RB / KAN (THB)"],
    ["google-play", "cards", "pad", ["MYR"], "Google Play", "Google JPY / MYR"],
    ["psn", "cards", "pad", ["USD"], "PSN", "PSN USD / UK / DE / UAE"],
    ["xbox", "cards", "pad", ["USD"], "Xbox", "Xbox USD / BRL"],
    ["others", "cards", "list", [], "บัญชีอื่นจากชีต", "บัญชีจากชีตที่ยังไม่มีหน้าของตัวเอง เช่น Skrill, SEAGM, BRI, LAOTELECOM"],
  ].map(([key, group, icon, currencies, name, description]) => ({ key, group, icon, currencies, name, description, ready: true, sheet: true })),
];

// Which page an imported sheet account belongs to; the first rule that names it wins. Stock lots,
// game card pools and Roblox wallets stay on the central reservations page only (never imported).
const CHANNEL_RULES = [
  ["netease", /net\s*ease/i], ["moniepoint", /moniepoint/i], ["wavepay", /wave\s*pay/i], ["itune", /^itunes/i],
  ["gamepoint", /gamepoint/i], ["plsbuy", /plsbuy/i], ["donshop", /donshop/i], ["agenh2h", /agenh2h/i],
  ["usdcodashop", /codashop/i], ["multigamecard", /multi\s*game/i],
  ["u9", /^u9\b/i], ["atom", /^atom\b/i], ["mmk-bank", /kbz|yoma|cb bank|^aya\b|^or rb/i],
  ["gcash", /g-?cash/i], ["maya", /maya/i], ["coins-ph", /coins\.ph/i], ["true-wallet", /true\s*wallet/i],
  ["tevau", /tevau/i], ["etherfi", /ether\.?fi/i], ["youtrip", /youtrip/i], ["tnt", /\btnt\b/i], ["ais-dtac", /\b(ais|dtac)\b/i],
  ["bitcash", /bitcash/i], ["xsolla", /xsolla/i], ["mycard", /my\s*card/i], ["smile-one", /smile\s*one|smilecode/i],
  ["unipin", /unipin/i], ["easy-card", /easy\s*card/i], ["google-play", /google/i], ["psn", /\bpsn\b/i], ["xbox", /xbox/i],
];
const CENTRAL_ONLY = /STOCK|GAME CARD|Roblox/i;
export const INVENTORY_CHANNEL_KEYS = new Set(["razer", "garena-shell", "others", ...CHANNEL_RULES.map(([key]) => key)]);

/** The Topup Inventory page of a ledger account ({ label, category, currency, provider }), or null. */
export function inventoryChannelOf(account) {
  if (CENTRAL_ONLY.test(account.category ?? "")) return null;
  if (account.provider === "razer") return "razer";
  if (account.currency === "SHELL") return "garena-shell";
  return CHANNEL_RULES.find(([, rule]) => rule.test(account.label ?? ""))?.[0] ?? "others";
}

// hue: the colour of a section's cards. feature: tools are drawn as wide cards.
export const TOPUP_INVENTORY_GROUPS = [
  { key: "tools", title: "เครื่องมือรวม", hue: "red", feature: true },
  { key: "asia", title: "MYR และ IDR", hue: "blue" },
  { key: "cards", title: "เกมและการ์ด", hue: "violet" },
  { key: "wallet", title: "กระเป๋าเงินดิจิทัล", hue: "teal" },
];

export const TOPUP_INVENTORY_CURRENCIES = ["MYR", "IDR", "SGD", "CAD", "USD", "MMK", "NGN"];

export const topupInventoryPath = (lang) => `/projectm/${lang}/topup-inventory`;
export const ituneInventoryPath = (lang) => `${topupInventoryPath(lang)}/itune`;

/** Whether a card is found by the home's search box and currency filter ("all" for every currency). */
export function topupInventoryMatch(provider, query = "", currency = "all") {
  if (currency !== "all" && !(provider.currencies || []).includes(currency)) return false;
  const words = String(query).trim().toLowerCase();
  if (!words) return true;
  return `${provider.name} ${provider.description} ${(provider.currencies || []).join(" ")}`.toLowerCase().includes(words);
}
