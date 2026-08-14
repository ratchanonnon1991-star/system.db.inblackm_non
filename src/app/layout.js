import "./globals.css";

export const metadata = {
  title: "GameDB — INBLACKM",
  description: "ตาราง Query ข้อมูลจากฐานข้อมูลกลาง InblackM",
};

// Stamps `data-theme` on <html> before the browser paints anything, so the
// login screen / hub / whole /projectm module (ll-theme.js, default light)
// and /gameinfo (gameinfo-theme-root.js, default dark) never flash their
// default theme before swapping to whatever the visitor actually picked —
// React can't do this itself, since useState's initial value always renders
// once with the server's guess (no access to localStorage) before an effect
// gets a chance to correct it. Mirrors each module's own fallback exactly:
// ll falls back to prefers-color-scheme, gameinfo falls back to dark.
// Rendered as a plain <script> tag below, not next/script — RootLayout is a
// Server Component, so this tag is part of the static HTML the server sends
// down and runs before hydration on its own; next/script's
// strategy="beforeInteractive" is for Client Components (where a literal
// <script> would otherwise be a dead client-only DOM node) and, as of
// Next 16 / React 19, triggers a spurious "Encountered a script tag while
// rendering React component" warning here for exactly that reason.
const THEME_INIT_SCRIPT = `(function(){try{
  var isGameinfo = location.pathname.indexOf("/gameinfo") === 0;
  var key = isGameinfo ? "gameinfo-theme" : "ll-theme";
  var stored = localStorage.getItem(key);
  var theme = stored === "light" || stored === "dark"
    ? stored
    : isGameinfo
      ? "dark"
      : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className="min-h-screen bg-zinc-100 text-zinc-900 antialiased">
        <script
          id="theme-init"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        {children}
      </body>
    </html>
  );
}
