// Keep formula help shared so every gameinfo formula editor advertises the
// same functions supported by gamedb-formula.
export const GAMEINFO_FORMULA_FUNCTION_HELP = [
  ["เงื่อนไข", "IF(เงื่อนไข, ค่าเมื่อจริง, ค่าเมื่อเท็จ) · AND · OR · NOT · ISBLANK · COALESCE · IFERROR"],
  ["วันที่", "TODAY() · DAYSUNTIL(วันที่) · DAYS(ปลายทาง, ต้นทาง) · ADDDAYS · YEAR · MONTH · DAY"],
  ["ข้อความ", "CONCAT · LEFT · RIGHT · MID · LEN · UPPER · LOWER · TRIM · TEXT · CONTAINS · ต่อข้อความด้วย &"],
  ["ตัวเลข", "ROUND · ABS · MIN · MAX · SUM"],
];
