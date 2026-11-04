// group: which section of the Topup Inventory home the card sits in (TOPUP_INVENTORY_GROUPS).
// currencies: the wallet currencies a card is found by. logo: file in public/topup-inventory,
// darkLogo when it is drawn for a black tile. icon: the lucide name the home draws without a logo.
export const TOPUP_INVENTORY_PROVIDERS = [
  { key: "reservations", group: "tools", icon: "reserve", name: "จองช่องทาง", description: "จองบัญชีที่จะใช้เติม แล้วเลือกพร้อมกรอกยอดที่ตัดในหน้าออเดอร์ inblackm (เว็บ · Russia · MarketPlace) คนอื่นเห็นว่าใครจองอะไร", ready: true },
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
  { key: "moniepoint", group: "wallet", icon: "bank", logo: "moniepoint.png", name: "Moniepoint", description: "พื้นที่สำหรับจัดการ Inventory ของ Moniepoint", ready: false },
];

// hue: the colour of a section's cards. feature: tools are drawn as wide cards.
export const TOPUP_INVENTORY_GROUPS = [
  { key: "tools", title: "เครื่องมือรวม", hue: "red", feature: true },
  { key: "asia", title: "MYR และ IDR", hue: "blue" },
  { key: "cards", title: "เกมและการ์ด", hue: "violet" },
  { key: "wallet", title: "กระเป๋าเงินดิจิทัล", hue: "teal" },
];

export const TOPUP_INVENTORY_CURRENCIES = ["MYR", "IDR", "SGD", "CAD", "USD", "MMK"];

export const topupInventoryPath = (lang) => `/projectm/${lang}/topup-inventory`;
export const ituneInventoryPath = (lang) => `${topupInventoryPath(lang)}/itune`;

/** Whether a card is found by the home's search box and currency filter ("all" for every currency). */
export function topupInventoryMatch(provider, query = "", currency = "all") {
  if (currency !== "all" && !(provider.currencies || []).includes(currency)) return false;
  const words = String(query).trim().toLowerCase();
  if (!words) return true;
  return `${provider.name} ${provider.description} ${(provider.currencies || []).join(" ")}`.toLowerCase().includes(words);
}
