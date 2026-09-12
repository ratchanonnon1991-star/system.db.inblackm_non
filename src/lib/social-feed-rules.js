export function normalizeRuleTerms(terms) {
  const values = Array.isArray(terms) ? terms : String(terms || "").split(",");
  return [...new Set(values.map((term) => String(term).trim().toLocaleLowerCase("th-TH")).filter(Boolean))].slice(0, 30);
}

export function ruleMatchesText(rule, text) {
  if (!rule?.enabled) return false;
  const terms = normalizeRuleTerms(rule.terms);
  if (!terms.length) return false;
  const haystack = String(text || "").toLocaleLowerCase("th-TH");
  if (rule.mode === "exclude") return terms.some((term) => haystack.includes(term));
  if (rule.mode === "all") return terms.every((term) => haystack.includes(term));
  return terms.some((term) => haystack.includes(term));
}

export function categoryMatchesRules(rules, text) {
  const enabled = (rules || []).filter((rule) => rule.enabled);
  if (enabled.some((rule) => rule.mode === "exclude" && ruleMatchesText(rule, text))) return false;
  const positive = enabled.filter((rule) => rule.mode !== "exclude");
  return positive.length === 0 || positive.some((rule) => ruleMatchesText(rule, text));
}
