import { evaluateFormula, parseFormula } from "@/lib/gamedb-formula";

const MAX_PROFILES = 50;

function cleanText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

const positive = (value) => {
  const number = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(number) && number > 0 ? number : null;
};

// A rate worked out the way the source sheet does, kept with the profile so
// the rate table can suggest today's rate. "perUsdt": how many units one USDT
// buys (4,615 MMK, 1,355 NGN) → USDT/THB ÷ amount. "cnyPerUnit": the yuan one
// unit costs (an iTunes $1 card at ¥5.85) → amount ÷ USDCNY × USDT/THB.
// `usdtThb` is the baht per USDT typed in; empty means the live rate.
export const GAMEINFO_SHEET_CALC_KINDS = ["perUsdt", "cnyPerUnit"];

export function sanitizeGameinfoSheetCalc(raw) {
  if (!raw || typeof raw !== "object" || !GAMEINFO_SHEET_CALC_KINDS.includes(raw.kind)) return null;
  const amount = positive(raw.amount);
  if (amount === null) return null;
  const usdtThb = positive(raw.usdtThb);
  return { kind: raw.kind, amount: String(amount), usdtThb: usdtThb === null ? "" : String(usdtThb) };
}

/**
 * Baht per unit from a sheet calculation, or null when a rate it needs is
 * missing. `live` ignores a typed USDT/THB and uses today's.
 */
export function gameinfoSheetCalcRate(calc, externalValues = {}, { live = false } = {}) {
  const clean = sanitizeGameinfoSheetCalc(calc);
  if (!clean) return null;
  const usdtThb = (!live && positive(clean.usdtThb)) || positive(externalValues?.["USDT/THB"]);
  if (usdtThb === null) return null;
  if (clean.kind === "perUsdt") return usdtThb / Number(clean.amount);
  const usdCny = positive(externalValues?.USDCNY);
  return usdCny === null ? null : (Number(clean.amount) / usdCny) * usdtThb;
}

export function sanitizeGameinfoCostProfiles(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const profiles = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = cleanText(item.id, 64);
    const label = cleanText(item.label, 120);
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    const updatedBy = Number(item.updatedBy);
    profiles.push({
      id,
      label,
      inputCurrency: cleanText(item.inputCurrency, 12).toUpperCase(),
      baseValue: cleanText(item.baseValue, 64),
      rateFormula: cleanText(item.rateFormula, 500),
      ...(sanitizeGameinfoSheetCalc(item.sheetCalc) ? { sheetCalc: sanitizeGameinfoSheetCalc(item.sheetCalc) } : {}),
      ...(cleanText(item.note, 200) ? { note: cleanText(item.note, 200) } : {}),
      updatedAt: cleanText(item.updatedAt, 40),
      updatedBy: Number.isInteger(updatedBy) && updatedBy > 0 ? updatedBy : null,
    });
    if (profiles.length >= MAX_PROFILES) break;
  }
  return profiles;
}

export function getGameinfoCostProfile(profiles, profileId) {
  const id = String(profileId ?? "");
  return (profiles || []).find((profile) => profile.id === id) || null;
}

export function validateGameinfoCostProfiles(profiles) {
  const errors = [];
  for (const profile of profiles || []) {
    if (!profile.rateFormula && !Number.isFinite(Number(profile.baseValue))) {
      errors.push(`${profile.label}: ค่าพื้นฐานต้องเป็นตัวเลข`);
      continue;
    }
    if (profile.rateFormula) {
      try {
        parseFormula(profile.rateFormula);
      } catch (error) {
        errors.push(`${profile.label}: ${error instanceof Error ? error.message : "สูตรไม่ถูกต้อง"}`);
      }
    }
  }
  return errors;
}

// A profile calculates a cost multiplier and its resulting amount for previews.
export function evaluateGameinfoPackCost(pack, profile, resolveReference = () => undefined) {
  if (!profile) return { rate: null, cost: null, error: "ไม่พบโปรไฟล์ต้นทุน" };
  const baseValue = Number(profile.baseValue);
  try {
    const rate = profile.rateFormula
      ? evaluateFormula(parseFormula(profile.rateFormula), (label) => {
          if (label === "baseValue" || label === "ค่าพื้นฐาน") return profile.baseValue;
          return resolveReference(label);
        })
      : baseValue;
    if (rate == null || rate === "") {
      return { rate: null, cost: null, error: "ยังไม่มีค่าที่สูตรต้นทุนต้องใช้" };
    }
    const numericRate = Number(rate);
    const amount = Number(pack?.amountChargedFee);
    if (!Number.isFinite(numericRate) || !Number.isFinite(amount)) {
      return { rate: null, cost: null, error: "ค่าในโปรไฟล์ต้นทุนไม่ใช่ตัวเลข" };
    }
    return { rate: numericRate, cost: amount * numericRate, error: "" };
  } catch (error) {
    return { rate: null, cost: null, error: error instanceof Error ? error.message : "สูตรต้นทุนไม่ถูกต้อง" };
  }
}
