import { inventoryError } from "@/lib/usdcodashop-inventory";

export const CODA_PROFIT_OPTIONS = [
  ["all", "กำไรทั้งหมด"], ["profit", "มีกำไร"], ["loss", "ขาดทุน"],
  ["breakeven", "เท่าทุน"], ["missing", "ข้อมูลกำไรไม่ครบ"],
];

export function codaProfitFilter({ profitStatus = "all", profitUnit = "thb", profitMin = "", profitMax = "" } = {}) {
  const status = profitStatus || "all", unit = profitUnit || "thb";
  if (!CODA_PROFIT_OPTIONS.some(([value]) => value === status) || !["thb", "percent"].includes(unit)) {
    throw inventoryError("ตัวกรองกำไรไม่ถูกต้อง");
  }
  const bound = (value) => {
    const text = String(value ?? "").trim();
    if (!text) return null;
    if (!/^-?\d{1,12}(?:\.\d{1,2})?$/.test(text)) throw inventoryError("ช่วงกำไรต้องเป็นตัวเลข ไม่เกิน 2 ตำแหน่งทศนิยม");
    const negative = text.startsWith("-");
    const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    return { cents: negative ? -cents : cents, text: `${negative && cents ? "-" : ""}${cents / 100n}.${String(cents % 100n).padStart(2, "0")}` };
  };
  const min = bound(profitMin), max = bound(profitMax);
  if (min && max && min.cents > max.cents) throw inventoryError("กำไรต่ำสุดต้องไม่เกินกำไรสูงสุด");
  if (status === "missing" && (min || max)) throw inventoryError("กรองข้อมูลกำไรไม่ครบไม่สามารถระบุช่วงตัวเลขได้");
  return { profitStatus: status, profitUnit: unit, profitMin: min?.text || "", profitMax: max?.text || "" };
}

export function codaProfitLabel(value) {
  const f = codaProfitFilter(value);
  if (f.profitStatus === "all" && !f.profitMin && !f.profitMax) return "กำไรทั้งหมด";
  const status = CODA_PROFIT_OPTIONS.find(([key]) => key === f.profitStatus)[1];
  return `${status}${f.profitMin || f.profitMax ? ` · ${f.profitMin || "ไม่จำกัด"} ถึง ${f.profitMax || "ไม่จำกัด"} ${f.profitUnit === "percent" ? "%" : "บาท"}` : ""}`;
}
