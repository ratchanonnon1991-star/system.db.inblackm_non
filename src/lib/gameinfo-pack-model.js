// Canonical UID-pack shape shared by the editor, CSV importer, and storage
// adapter. Keep this allowlist aligned with fields the pack edit/view pages
// actually expose; unknown/legacy database fields must not be written back.
import { normalizeGameinfoNumericInput } from "@/lib/gameinfo-pack-validation";
import { normalizeGameinfoCountry } from "@/lib/gameinfo-countries";

function text(value) {
  return value == null ? "" : String(value);
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean);
}

export function sanitizeGameinfoPackLocalizedNames(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [languageId, name] of Object.entries(value)) {
    if (!/^\d+$/.test(languageId)) continue;
    const normalized = text(name).trim().slice(0, 255);
    if (normalized) result[languageId] = normalized;
  }
  return result;
}

export function getGameinfoPackName(pack, languageId = "") {
  const key = String(languageId || "");
  if (key) return sanitizeGameinfoPackLocalizedNames(pack?.localizedNames)[key] || "";
  return text(pack?.name);
}

// serviceStatus on top of serviceEnabled: "new" (just added, on sale) and
// "expired" (gone from the game: the sheet's red rows). "" is plain open/closed.
export const GAMEINFO_PACK_SERVICE_STATUSES = ["new", "expired"];

export const GAMEINFO_PACK_STATUS_LABELS = { open: "เปิด", closed: "ปิด", new: "ใหม่", expired: "หมดอายุ" };

export function sanitizeGameinfoPackExpiry(value) {
  const date = text(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date) ? date : "";
}

/** Today in Bangkok as YYYY-MM-DD, the form expiresAt is kept in. */
export function gameinfoPackToday(now = new Date()) {
  return new Date(now).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

/** expiresAt is the pack's last day on sale: past it the pack is expired, whatever else was set. */
export function gameinfoPackDatePassed(pack, now = new Date()) {
  return Boolean(pack?.expiresAt) && pack.expiresAt < gameinfoPackToday(now);
}

/** "2026-11-04" as the sheet writes it: 4/11/2026. */
export function formatGameinfoPackExpiry(value) {
  const [year, month, day] = text(value).split("-");
  return day ? `${Number(day)}/${Number(month)}/${year}` : "";
}

/** open | closed | new | expired */
export function gameinfoPackStatus(pack, now = new Date()) {
  if (pack?.serviceStatus === "expired" || gameinfoPackDatePassed(pack, now)) return "expired";
  if (pack?.serviceEnabled === false) return "closed";
  return pack?.serviceStatus === "new" ? "new" : "open";
}

/** The fields that give a pack one of the statuses above. */
export function gameinfoPackStatusPatch(status) {
  if (status === "expired") return { serviceEnabled: false, serviceStatus: "expired" };
  if (status === "closed") return { serviceEnabled: false, serviceStatus: "" };
  if (status === "new") return { serviceEnabled: true, serviceStatus: "new" };
  return { serviceEnabled: true, serviceStatus: "" };
}

/** Closed or expired: what a game's service light counts as a pack that is off. */
export function gameinfoPackOffSale(pack, now = new Date()) {
  return pack?.serviceEnabled === false || gameinfoPackDatePassed(pack, now);
}

export function sanitizeGameinfoPack(pack) {
  const source = pack && typeof pack === "object" ? pack : {};
  const result = {
    id: text(source.id),
    name: text(source.name),
    image: text(source.image),
    price: normalizeGameinfoNumericInput(source.price),
    amountChargedFee: normalizeGameinfoNumericInput(source.amountChargedFee),
    // An expired pack is gone from the game, so it is never on sale.
    serviceEnabled: source.serviceStatus === "expired" ? false : source.serviceEnabled !== false,
    serviceStatus: GAMEINFO_PACK_SERVICE_STATUSES.includes(source.serviceStatus) ? source.serviceStatus : "",
    costProfileId: text(source.costProfileId),
    channelsMain: stringList(source.channelsMain),
    channelsSecondary: stringList(source.channelsSecondary),
    country: normalizeGameinfoCountry(source.country).value,
  };
  const localizedNames = sanitizeGameinfoPackLocalizedNames(source.localizedNames);
  if (Object.keys(localizedNames).length) result.localizedNames = localizedNames;
  // Only when set, so packs without them save exactly as they did. As written:
  // the sheet has "236155 X 2" before the fee as well as plain numbers.
  const amountBeforeFee = text(source.amountBeforeFee).trim().slice(0, 120);
  const amountReceived = normalizeGameinfoNumericInput(source.amountReceived);
  const priceUsd = normalizeGameinfoNumericInput(source.priceUsd);
  const link = text(source.link).trim().slice(0, 2048);
  const expiresAt = sanitizeGameinfoPackExpiry(source.expiresAt);
  if (amountBeforeFee) result.amountBeforeFee = amountBeforeFee;
  if (amountReceived) result.amountReceived = amountReceived;
  if (priceUsd) result.priceUsd = priceUsd;
  if (link) result.link = link;
  if (expiresAt) result.expiresAt = expiresAt;
  return result;
}

export function createBlankGameinfoPack(id) {
  return sanitizeGameinfoPack({ id });
}

/** A GameInfo pack tree with at least one pack that has a name or a price (an empty placeholder row does not count). */
export function gameinfoHasRealPacks(currencies) {
  return (currencies || []).some((currency) => (currency.categories || []).some((category) =>
    (category.packs || []).some((pack) => String(pack.name || "").trim() || String(pack.price || "").trim())
  ));
}

export function duplicateGameinfoPack(pack, newId) {
  const copy = sanitizeGameinfoPack(pack);
  copy.id = text(newId);
  copy.name = copy.name ? `${copy.name} (สำเนา)` : "สำเนา";
  return copy;
}
