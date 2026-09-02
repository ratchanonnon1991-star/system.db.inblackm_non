import {
  gameNameKey,
  levenshtein,
  similarNameDistanceLimit,
  suggestSimilarNames,
} from "@/lib/text-distance.js";
import { suggestGameinfoCountries } from "@/lib/gameinfo-countries.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

check("identical strings are zero apart", levenshtein("abc", "abc"), 0);
check("empty left costs the whole right", levenshtein("", "abcd"), 4);
check("empty right costs the whole left", levenshtein("abcd", ""), 4);
check("one substitution", levenshtein("kitten", "sitten"), 1);
check("classic kitten/sitting is three edits", levenshtein("kitten", "sitting"), 3);
check("distance is symmetric", levenshtein("sitting", "kitten"), 3);
check("insertion at the end", levenshtein("abc", "abcd"), 1);
check("thai characters count per code unit", levenshtein("เกม", "เกมส์"), 2);

check("name key lowercases and trims", gameNameKey("  Honkai Impact  "), "honkai impact");
check("name key keeps inner punctuation", gameNameKey("NIKKE: UID"), "nikke: uid");
check("name key tolerates null", gameNameKey(null), "");

check("short names still allow one edit", similarNameDistanceLimit("abc"), 1);
check("limit is 30% of length", similarNameDistanceLimit("abcdefghij"), 3);

const pool = ["HONKAI IMPACT", "HONKAI STAR RAIL", "AUTO CHESS", "STUMBLE GUYS"];
check(
  "a typo suggests the closest existing name",
  suggestSimilarNames("HONKAI IMPAC", pool),
  ["HONKAI IMPACT"]
);
check("an exact match is a duplicate, not a suggestion", suggestSimilarNames("AUTO CHESS", pool), []);
check("case and spacing differences are exact matches too", suggestSimilarNames("  auto chess ", pool), []);
check("a one-character query is too short to nudge", suggestSimilarNames("H", pool), []);
check("an unrelated name suggests nothing", suggestSimilarNames("VALORANT", pool), []);
check("an empty pool suggests nothing", suggestSimilarNames("HONKAI IMPAC", []), []);
check("a missing pool does not throw", suggestSimilarNames("HONKAI IMPAC", undefined), []);
check(
  "suggestions are capped at the requested limit",
  suggestSimilarNames("HONKAI IMPAC", pool, 1).length,
  1
);

// gameinfo-countries now shares the same primitive; its own key (which strips
// punctuation and spaces) must keep working through it.
check(
  "country suggestions still resolve a misspelling",
  suggestGameinfoCountries("Malaisia", 1),
  ["Malaysia"]
);
check(
  "country suggestions ignore punctuation differences",
  suggestGameinfoCountries("Cote dIvoire", 1),
  suggestGameinfoCountries("Cote d'Ivoire", 1)
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
