// Canonical UID-pack shape shared by the editor, CSV importer, and storage
// adapter. Keep this allowlist aligned with fields the pack edit/view pages
// actually expose; unknown/legacy database fields must not be written back.

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

export function sanitizeGameinfoPack(pack) {
  const source = pack && typeof pack === "object" ? pack : {};
  const result = {
    id: text(source.id),
    name: text(source.name),
    image: text(source.image),
    price: text(source.price),
    amountChargedFee: text(source.amountChargedFee),
    serviceEnabled: source.serviceEnabled !== false,
    serviceStatus: source.serviceStatus === "new" ? "new" : "",
    costProfileId: text(source.costProfileId),
    channelsMain: stringList(source.channelsMain),
    channelsSecondary: stringList(source.channelsSecondary),
    country: text(source.country),
  };
  const localizedNames = sanitizeGameinfoPackLocalizedNames(source.localizedNames);
  if (Object.keys(localizedNames).length) result.localizedNames = localizedNames;
  return result;
}

export function createBlankGameinfoPack(id) {
  return sanitizeGameinfoPack({ id });
}

export function duplicateGameinfoPack(pack, newId) {
  const copy = sanitizeGameinfoPack(pack);
  copy.id = text(newId);
  copy.name = copy.name ? `${copy.name} (สำเนา)` : "สำเนา";
  return copy;
}
