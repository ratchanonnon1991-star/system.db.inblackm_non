/** The options whose text holds every word typed, keeping their groups (src/components/combo-input.js). */
export function filterComboGroups(groups, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  return groups
    .map((group) => ({ ...group, options: group.options.filter((option) => words.every((word) => option.toLowerCase().includes(word))) }))
    .filter((group) => group.options.length);
}
