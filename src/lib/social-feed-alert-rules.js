export function normalizeAlertRule(input = {}) {
  const groups = (Array.isArray(input.groups) ? input.groups : []).map((group) => {
    const seen = new Set();
    const terms = (Array.isArray(group?.terms) ? group.terms : []).map((term) => String(term || "").trim().slice(0, 120)).filter((term) => {
      const key = term.toLocaleLowerCase("th-TH");
      if (!term || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);
    return { mode: group?.mode === "any" ? "any" : "all", terms };
  }).filter((group) => group.terms.length).slice(0, 20);
  return {
    name: String(input.name || "").trim().slice(0, 100),
    groupMode: input.groupMode === "all" ? "all" : "any",
    groups,
  };
}

export function alertRuleMatches(rule, text) {
  const normalized = normalizeAlertRule(rule);
  if (!normalized.groups.length) return false;
  const haystack = String(text || "").toLocaleLowerCase("th-TH");
  const matches = normalized.groups.map((group) => {
    const found = group.terms.map((term) => haystack.includes(term.toLocaleLowerCase("th-TH")));
    return group.mode === "all" ? found.every(Boolean) : found.some(Boolean);
  });
  return normalized.groupMode === "all" ? matches.every(Boolean) : matches.some(Boolean);
}
