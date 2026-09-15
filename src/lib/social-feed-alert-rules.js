export function normalizeAlertRule(input = {}) {
  const normalizeTerms = (values) => {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map((term) => String(term || "").trim().slice(0, 120)).filter((term) => {
      const key = term.toLocaleLowerCase("th-TH");
      if (!term || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);
  };
  const legacyGroups = Array.isArray(input.groups) ? input.groups : [];
  const hasFlatFields = Array.isArray(input.includeTerms) || Array.isArray(input.excludeTerms);
  const positiveGroups = legacyGroups.filter((group) => group?.mode !== "exclude");
  const includeMode = hasFlatFields ? (input.includeMode === "any" ? "any" : "all")
    : positiveGroups.length === 1 ? (positiveGroups[0].mode === "any" ? "any" : "all")
      : input.groupMode === "all" ? "all" : "any";
  const legacyExcludeGroups = legacyGroups.filter((group) => group?.mode === "exclude");
  const excludeMode = hasFlatFields ? (input.excludeMode === "all" ? "all" : "any")
    : legacyExcludeGroups.length === 1 && legacyExcludeGroups[0].matchMode === "all" ? "all" : "any";
  const includeTerms = normalizeTerms(hasFlatFields ? input.includeTerms : positiveGroups.flatMap((group) => group?.terms || []));
  const excludeTerms = normalizeTerms(hasFlatFields ? input.excludeTerms : legacyExcludeGroups.flatMap((group) => group?.terms || []));
  const groups = [];
  if (includeTerms.length) groups.push({ mode: includeMode, terms: includeTerms });
  if (excludeTerms.length) groups.push({ mode: "exclude", matchMode: excludeMode, terms: excludeTerms });
  return {
    name: String(input.name || "").trim().slice(0, 100),
    includeMode,
    includeTerms,
    excludeMode,
    excludeTerms,
    groupMode: "all",
    groups,
  };
}

export function alertRuleMatches(rule, text) {
  const normalized = normalizeAlertRule(rule);
  if (!normalized.groups.length) return false;
  const haystack = String(text || "").toLocaleLowerCase("th-TH");
  const excluded = normalized.groups.filter((group) => group.mode === "exclude");
  if (excluded.some((group) => {
    const found = group.terms.map((term) => haystack.includes(term.toLocaleLowerCase("th-TH")));
    return group.matchMode === "all" ? found.every(Boolean) : found.some(Boolean);
  })) return false;
  const positive = normalized.groups.filter((group) => group.mode !== "exclude");
  if (!positive.length) return true;
  const matches = positive.map((group) => {
    const found = group.terms.map((term) => haystack.includes(term.toLocaleLowerCase("th-TH")));
    return group.mode === "all" ? found.every(Boolean) : found.some(Boolean);
  });
  return normalized.groupMode === "all" ? matches.every(Boolean) : matches.some(Boolean);
}

export function reconcileAlertRuleView(result, selectedId, page) {
  const nextSelectedId = String(result?.selectedId || "");
  const totalPages = Math.max(1, Number(result?.pagination?.totalPages) || 1);
  return {
    selectedId: nextSelectedId,
    page: Math.min(Math.max(1, Number(page) || 1), totalPages),
    selectionChanged: nextSelectedId !== String(selectedId || ""),
  };
}
