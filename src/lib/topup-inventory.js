export const TOPUP_INVENTORY_PROVIDERS = [
  { key: "itune", name: "iTune", description: "จัดการเมล สกุลเงิน ยอดคงเหลือ และการจองเมลสำหรับเติมเกม", ready: true },
  { key: "moniepoint", name: "Moniepoint", description: "พื้นที่สำหรับจัดการ Inventory ของ Moniepoint", ready: false },
  { key: "wavepay", name: "WavePay", description: "ยอดคงเหลือ MMK แยกตามเบอร์ พร้อมออเดอร์ ต้นทุน และกำไรของแต่ละเบอร์", ready: true },
  { key: "usdcodashop", name: "USDCodashop", description: "จัดการบัญชี USD ผู้ลงรายการ ยอดปัจจุบัน ใช้ไป และคงเหลือ", ready: true },
];

export const topupInventoryPath = (lang) => `/projectm/${lang}/topup-inventory`;
export const ituneInventoryPath = (lang) => `${topupInventoryPath(lang)}/itune`;
