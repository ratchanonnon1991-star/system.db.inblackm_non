// Collapses runs of spacebar presses (leading, trailing, or repeated
// mid-string) down to single spaces / nothing. Applied on blur (not on every
// keystroke) so the user can still type a space mid-word without it being
// eaten immediately — only cleaned up once they click away from the field.
export function normalizeSpaces(s) {
  return String(s ?? "").replace(/ {2,}/g, " ").trim();
}
