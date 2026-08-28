// Keep formula help shared so every gameinfo formula editor advertises the
// same functions supported by gamedb-formula.
export const GAMEINFO_FORMULA_FUNCTION_HELP = [
  ["เงื่อนไข", "IF(เงื่อนไข, ค่าเมื่อจริง, ค่าเมื่อเท็จ) · AND · OR · NOT · ISBLANK · COALESCE · IFERROR"],
  ["วันที่", "TODAY() · DAYSUNTIL(วันที่) · DAYS(ปลายทาง, ต้นทาง) · ADDDAYS · YEAR · MONTH · DAY"],
  ["ข้อความ", "CONCAT · LEFT · RIGHT · MID · LEN · UPPER · LOWER · TRIM · TEXT · CONTAINS · ต่อข้อความด้วย &"],
  ["ตัวเลข", "ABS · MIN · MAX · SUM"],
  ["ปัดเศษ", "ROUND · ROUNDDOWN · ROUNDUP · INT · FLOOR · CEILING · MROUND"],
];

export const GAMEINFO_ROUNDING_HELP = [
  ["ROUND(ตัวเลข, ทศนิยม)", "ปัดตามหลักคณิตศาสตร์ ตั้งแต่ 5 ขึ้นไปปัดขึ้น", "ROUND(10.567, 2) = 10.57"],
  ["ROUNDDOWN(ตัวเลข, ทศนิยม)", "ตัดเศษทิ้งเสมอ ใช้เมื่อไม่ต้องการให้ยอดเกิน", "ROUNDDOWN(10.567, 2) = 10.56"],
  ["ROUNDUP(ตัวเลข, ทศนิยม)", "ปัดขึ้นเสมอ ใช้กับต้นทุนหรือราคาที่ห้ามขาด", "ROUNDUP(10.561, 2) = 10.57"],
  ["INT(ตัวเลข)", "ปัดลงให้เหลือจำนวนเต็ม", "INT(10.9) = 10"],
  ["FLOOR(ตัวเลข, หลัก)", "ปัดลงให้ลงตัวกับหลักที่กำหนด", "FLOOR(127, 10) = 120"],
  ["CEILING(ตัวเลข, หลัก)", "ปัดขึ้นให้ลงตัวกับหลักที่กำหนด", "CEILING(121, 10) = 130"],
  ["MROUND(ตัวเลข, หลัก)", "ปัดเข้าหาหลักที่ใกล้ที่สุด", "MROUND(127, 10) = 130"],
];

export const GAMEINFO_ROUNDING_NOTE =
  "กลุ่ม ROUND ใช้จำนวนทศนิยม ส่วน FLOOR/CEILING/MROUND ใช้ขนาดหลัก เช่น 10; เลขติดลบ ROUNDDOWN ตัดเข้าหาศูนย์ แต่ INT/FLOOR ปัดลง";
