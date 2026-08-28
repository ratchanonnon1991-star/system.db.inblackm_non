const ISO_COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(" ");

const thaiNames = new Intl.DisplayNames(["th"], { type: "region" });
const englishNames = new Intl.DisplayNames(["en"], { type: "region" });

export const GAMEINFO_COUNTRIES = ISO_COUNTRY_CODES.map((code) => ({
  code,
  name: thaiNames.of(code),
  englishName: englishNames.of(code),
})).sort((a, b) => a.name.localeCompare(b.name, "th"));

export const GAMEINFO_COUNTRY_NAMES = GAMEINFO_COUNTRIES.map((country) => country.name);

function countryKey(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("th")
    .replace(/[\s._'’()-]+/g, "");
}

const aliases = new Map();
for (const country of GAMEINFO_COUNTRIES) {
  for (const alias of [country.code, country.name, country.englishName]) {
    aliases.set(countryKey(alias), country.name);
  }
}
aliases.set(countryKey("ไทย"), thaiNames.of("TH"));
aliases.set(countryKey("USA"), thaiNames.of("US"));
aliases.set(countryKey("UK"), thaiNames.of("GB"));
aliases.set(countryKey("เกาหลีใต้"), thaiNames.of("KR"));
aliases.set(countryKey("เกาหลีเหนือ"), thaiNames.of("KP"));

export function normalizeGameinfoCountry(value) {
  const clean = String(value || "").trim();
  if (!clean) return { value: "", matched: false };
  const canonical = aliases.get(countryKey(clean));
  return { value: canonical || clean, matched: Boolean(canonical) };
}

function editDistance(left, right) {
  const a = countryKey(left);
  const b = countryKey(right);
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

export function suggestGameinfoCountries(value, limit = 3) {
  const clean = String(value || "").trim();
  if (!clean) return [];
  return GAMEINFO_COUNTRIES
    .map((country) => ({
      name: country.name,
      distance: Math.min(editDistance(clean, country.name), editDistance(clean, country.englishName)),
    }))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name, "th"))
    .slice(0, limit)
    .map((item) => item.name);
}
