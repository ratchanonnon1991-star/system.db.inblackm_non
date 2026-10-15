export const TOPUP_INVENTORY_PROVIDERS = [
  { key: "itune", name: "iTune", description: "จัดการเมล สกุลเงิน ยอดคงเหลือ และการจองเมลสำหรับเติมเกม", ready: true },
  { key: "moniepoint", name: "Moniepoint", description: "พื้นที่สำหรับจัดการ Inventory ของ Moniepoint", ready: false },
  { key: "usdcodashop", name: "USDCodashop", description: "พื้นที่สำหรับจัดการ Inventory ของ USDCodashop", ready: false },
];

export const topupInventoryPath = (lang) => `/projectm/${lang}/topup-inventory`;
export const ituneInventoryPath = (lang) => `${topupInventoryPath(lang)}/itune`;
