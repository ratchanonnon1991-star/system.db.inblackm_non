export function parseSocialFeedSearchTerms(value) {
  const seen = new Set();
  return String(value || "").slice(0, 120).split(",").map((term) => term.trim()).filter((term) => {
    const normalized = term.toLocaleLowerCase();
    if (!term || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
