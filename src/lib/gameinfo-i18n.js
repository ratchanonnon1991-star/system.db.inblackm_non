// Path-based language segment for /gameinfo, reserved ahead of real i18n.
// Adding a language later means adding it here — the rest of the module
// still hardcodes Thai copy, same as the rest of the app.
export const SUPPORTED_LANGS = ["th"];
export const DEFAULT_LANG = "th";

export function isSupportedLang(lang) {
  return SUPPORTED_LANGS.includes(lang);
}
