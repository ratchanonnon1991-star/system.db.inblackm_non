// Fallback when a game has no image of its own: its initials on a colour
// picked by id, so the same game keeps the same colour on every page.
const THUMB_COLORS = ["#18181B", "#7F1D1D", "#1E3A8A", "#14532D", "#581C87", "#9A3412", "#0F766E", "#3F3F46"];

export function gameinfoGameInitials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0].charAt(0) + (words[1] ? words[1].charAt(0) : words[0].charAt(1))).toUpperCase();
}

export function gameinfoGameColor(id) {
  return THUMB_COLORS[Number(id) % THUMB_COLORS.length] || THUMB_COLORS[0];
}
