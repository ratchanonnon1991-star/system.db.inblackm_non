export const TOPUP_INVENTORY_PROVIDERS = [
  { key: "reservations", name: "จองช่องทาง", description: "จองบัญชีที่จะใช้เติม แล้วเลือกพร้อมกรอกยอดที่ตัดในหน้าออเดอร์ inblackm (เว็บ · Russia · MarketPlace) คนอื่นเห็นว่าใครจองอะไร", ready: true },
  { key: "staff-links", name: "จับคู่พนักงาน", description: "จับคู่ User ID พนักงาน inblackm กับบัญชี tools เพื่อให้เลือกเมล iTune และบันทึกยอดจากช่องทางที่จองได้ในหน้าออเดอร์ (Super Admin)", ready: true },
  { key: "ledger", name: "ยกยอดเติมมือ", description: "เลือกบัญชีที่ใช้เติม ใส่หรือวางเลขออเดอร์กับยอดที่ตัด ระบบหักยอดให้ ใช้แทนการยกยอดในชีท Center", ready: true },
  { key: "channels", name: "ยอดเติมมือรายบัญชี", description: "สรุปยอดที่ยกจากหน้ายกยอด แยกตามบัญชีและกลุ่ม (Moniepoint, iTunes, Bitcash, Laos Telecom ฯลฯ) พร้อมรายการของแต่ละบัญชี", ready: true },
  { key: "gamepoint", name: "(MYR) Gamepoint", description: "ยอดตัด MYR จากผลบอทและ ledger พร้อมต้นทุน กำไร และยอดคงเหลือคำนวณแยกจากยอดที่บันทึก", ready: true },
  { key: "plsbuy", name: "(MYR) Plsbuy", description: "ประวัติ Plsbuy ยอด MYR ออก ต้นทุน กำไร และยอดอ้างอิงจากชีท", ready: true },
  { key: "donshop", name: "(IDR) Donshop", description: "ประวัติ Donshop ทุกสถานะ ยอด IDR ออก ต้นทุน กำไร และยอดคงเหลือหลังออเดอร์สำเร็จล่าสุด", ready: true },
  { key: "agenh2h", name: "(IDR) AgenH2H", description: "ประวัติ AgenH2H ทุกสถานะ ยอด IDR ออก ต้นทุน กำไร และยอดคงเหลือหลังออเดอร์สำเร็จล่าสุด", ready: true },
  { key: "razer", name: "Razer Gold", description: "บัญชี Razer ทุกสกุลจาก Razer Stock และชีตที่นำเข้า พร้อม Gold / Silver ประวัติบอท และยอดเติมมือ แยกสกุลเงิน", ready: true },
  { key: "netease", name: "Netease", description: "Netease Pay และ Credit ตามชีท พร้อมยอดบอท ยอดออก ต้นทุน กำไร และประวัติรายการ", ready: true },
  { key: "garena-shell", name: "Garena Shell", description: "สองบัญชี Shell พร้อมยอดบอท ประวัติออเดอร์ ต้นทุน และกำไร แยกยอดอ้างอิงจากชีท", ready: true },
  { key: "itune", name: "iTune", description: "จัดการเมล สกุลเงิน ยอดคงเหลือ และการจองเมลสำหรับเติมเกม", ready: true },
  { key: "moniepoint", name: "Moniepoint", description: "บัญชี Moniepoint NP / SLY (NGN) ยอดใช้และรายการของแต่ละบัญชี จากชีตที่นำเข้า หน้ายกยอด และหน้าออเดอร์ inblackm", ready: true },
  { key: "wavepay", name: "WavePay", description: "ยอดคงเหลือ MMK แยกตามเบอร์ พร้อมออเดอร์ ต้นทุน และกำไรของแต่ละเบอร์", ready: true },
  { key: "usdcodashop", name: "USDCodashop", description: "จัดการบัญชี USD ผู้ลงรายการ ยอดปัจจุบัน ใช้ไป และคงเหลือ", ready: true },
  { key: "multigamecard", name: "Multigamecard", description: "ยอดบัตรแยก Serial พร้อมประวัติ Bot และบันทึกรายการ Manual ยอดเข้า ใช้ไป และคงเหลือ", ready: true },
];

export const topupInventoryPath = (lang) => `/projectm/${lang}/topup-inventory`;
export const ituneInventoryPath = (lang) => `${topupInventoryPath(lang)}/itune`;
