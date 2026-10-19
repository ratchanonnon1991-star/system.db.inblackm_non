export const TOPUP_INVENTORY_PROVIDERS = [
  { key: "netease", name: "Netease", description: "Netease Pay และ Credit ตามชีท พร้อมยอดบอท ยอดออก ต้นทุน กำไร และประวัติรายการ", ready: true },
  { key: "garena-shell", name: "Garena Shell", description: "สองบัญชี Shell พร้อมยอดบอท ประวัติออเดอร์ ต้นทุน และกำไร แยกยอดอ้างอิงจากชีท", ready: true },
  { key: "itune", name: "iTune", description: "จัดการเมล สกุลเงิน ยอดคงเหลือ และการจองเมลสำหรับเติมเกม", ready: true },
  { key: "moniepoint", name: "Moniepoint", description: "พื้นที่สำหรับจัดการ Inventory ของ Moniepoint", ready: false },
  { key: "wavepay", name: "WavePay", description: "ยอดคงเหลือ MMK แยกตามเบอร์ พร้อมออเดอร์ ต้นทุน และกำไรของแต่ละเบอร์", ready: true },
  { key: "usdcodashop", name: "USDCodashop", description: "จัดการบัญชี USD ผู้ลงรายการ ยอดปัจจุบัน ใช้ไป และคงเหลือ", ready: true },
  { key: "multigamecard", name: "Multigamecard", description: "ยอดบัตรแยก Serial พร้อมประวัติ Bot และบันทึกรายการ Manual ยอดเข้า ใช้ไป และคงเหลือ", ready: true },
];

export const topupInventoryPath = (lang) => `/projectm/${lang}/topup-inventory`;
export const ituneInventoryPath = (lang) => `${topupInventoryPath(lang)}/itune`;
