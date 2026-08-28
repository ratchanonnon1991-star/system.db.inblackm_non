import { evaluateFormula, parseFormula } from "@/lib/gamedb-formula";

const MAX_PROFILES = 50;

function cleanText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
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
