import { levenshtein } from "@/lib/text-distance";

const ISO_COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(" ");

const thaiNames = new Intl.DisplayNames(["th"], { type: "region" });
const englishNames = new Intl.DisplayNames(["en"], { type: "region" });

export function gameinfoCountryDisplayName(value) {
  return String(value || "").replace(/\s+\([^()]+\)$/, "").trim();
}

export const GAMEINFO_COUNTRIES = ISO_COUNTRY_CODES.map((code) => ({
  code,
  name: gameinfoCountryDisplayName(englishNames.of(code)),
  englishName: gameinfoCountryDisplayName(englishNames.of(code)),
  thaiName: thaiNames.of(code),
})).sort((a, b) => a.name.localeCompare(b.name, "en"));

export const GAMEINFO_COUNTRY_NAMES = GAMEINFO_COUNTRIES.map((country) => country.name);

function countryKey(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("th")
    .replace(/[\s._'’()-]+/g, "");
}

const aliases = new Map();
for (const country of GAMEINFO_COUNTRIES) {
  for (const alias of [country.code, country.name, englishNames.of(country.code), country.thaiName]) {
    aliases.set(countryKey(alias), country.name);
  }
}
aliases.set(countryKey("USA"), englishNames.of("US"));
aliases.set(countryKey("UK"), englishNames.of("GB"));
aliases.set(countryKey("เกาหลีใต้"), englishNames.of("KR"));
aliases.set(countryKey("เกาหลีเหนือ"), englishNames.of("KP"));

export function normalizeGameinfoCountry(value) {
  const clean = String(value || "").trim();
  if (!clean) return { value: "", matched: false };
  const canonical = aliases.get(countryKey(clean));
  return { value: canonical || clean, matched: Boolean(canonical) };
}

export function gameinfoCountrySearchText(value) {
  const canonical = aliases.get(countryKey(value)) || String(value || "").trim();
  const country = GAMEINFO_COUNTRIES.find((item) => item.name === canonical);
  return country
    ? `${country.name} ${country.thaiName} ${country.code}`
    : canonical;
}

// Country names compare on the aggressive key (punctuation stripped) so
// "Cote d'Ivoire" and "Cote dIvoire" are zero apart, not two.
function editDistance(left, right) {
  return levenshtein(countryKey(left), countryKey(right));
}

export function suggestGameinfoCountries(value, limit = 3) {
  const clean = String(value || "").trim();
  if (!clean) return [];
  return GAMEINFO_COUNTRIES
    .map((country) => ({
      name: country.name,
      distance: Math.min(editDistance(clean, country.name), editDistance(clean, country.thaiName)),
    }))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name, "en"))
    .slice(0, limit)
    .map((item) => item.name);
}
