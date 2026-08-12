// A short, good-enough "browser · OS" label from a raw User-Agent string --
// not meant to be exact (there is no bulletproof way to parse UA strings
// without a maintained library, and this app doesn't have one), just enough
// for a log to say what kind of device an entry came from at a glance. The
// full string is always kept alongside it for anyone who needs to look closer.
export function summarizeUserAgent(userAgent) {
  const text = String(userAgent || "");
  if (!text) return "";

  const os = /Windows/.test(text)
    ? "Windows"
    : /Android/.test(text)
      ? "Android"
      : /iPhone|iPad|iPod/.test(text)
        ? "iOS"
        : /Mac OS X/.test(text)
          ? "macOS"
          : /Linux/.test(text)
            ? "Linux"
            : "";

  // Order matters: Edge/Opera/Chrome-based browsers all carry "Chrome" in
  // their UA too, and every one of those also carries "Safari" -- the more
  // specific token has to be checked first or everything reads as Chrome.
  const browser = /Edg\//.test(text)
    ? "Edge"
    : /OPR\//.test(text)
      ? "Opera"
      : /Chrome\//.test(text)
        ? "Chrome"
        : /Firefox\//.test(text)
          ? "Firefox"
          : /Safari\//.test(text)
            ? "Safari"
            : "";

  const label = [browser, os].filter(Boolean).join(" · ");
  return label || "อุปกรณ์ไม่ทราบชนิด";
}
