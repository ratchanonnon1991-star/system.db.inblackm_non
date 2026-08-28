// Autocomplete suggestions derived from data already loaded, in place of the
// reference app's separate "Lookups" history table — smaller scope, matches
// the rest of this module.
function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, "th"));
}

export function buildPackSuggestions(game) {
  const currencyNames = [];
  const categoryNames = [];
  const channels = [];
  const countries = [];
  for (const c of game.currencies || []) {
    currencyNames.push(c.name);
    for (const cat of c.categories || []) {
      categoryNames.push(cat.name);
      for (const p of cat.packs || []) {
        channels.push(...(p.channelsMain || []), ...(p.channelsSecondary || []));
        countries.push(p.country);
      }
    }
  }
  return {
    currencyNames: uniq(currencyNames),
    categoryNames: uniq(categoryNames),
    channels: uniq(channels),
    countries: uniq([...GAMEINFO_COUNTRY_NAMES, ...countries]),
  };
}
import { GAMEINFO_COUNTRY_NAMES } from "./gameinfo-countries.js";
