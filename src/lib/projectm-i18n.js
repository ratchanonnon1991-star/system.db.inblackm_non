// Path-based language segment for /projectm, mirrors gameinfo-i18n.js.
export const SUPPORTED_LANGS = ["th"];
export const DEFAULT_LANG = "th";

export function isSupportedLang(lang) {
  return SUPPORTED_LANGS.includes(lang);
}
