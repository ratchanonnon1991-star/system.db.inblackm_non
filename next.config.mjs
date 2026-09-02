/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["playwright"],
  // Next 16 defaults `next build` to Turbopack. We keep an explicit webpack
  // build (`next build --webpack` in package.json) and webpack-only resolve
  // tweak below; empty turbopack config silences the "webpack without
  // turbopack" guard if someone runs plain `next build`.
  turbopack: {},
  // tw-animate-css only publishes a `style` export. Turbopack honors that;
  // webpack (`next dev --webpack` / `next build --webpack`) does not, so
  // @import in globals.css fails until `style` is on the resolve condition list.
  webpack: (config) => {
    const names = config.resolve.conditionNames || ["browser", "module", "import", "require", "default"];
    if (!names.includes("style")) {
      config.resolve.conditionNames = ["style", ...names];
    }
    return config;
  },
  // Next 16 runs `next build` on Turbopack, and a `webpack` key with no
  // `turbopack` key is a hard error there. Turbopack needs no extra resolve
  // config (it already honors `style`), so an empty object is the whole answer.
  turbopack: {},
  // Response headers for every route. The session cookie is SameSite=Lax, so a
  // page in someone else's frame would not carry it anyway — but a tool that
  // shows customer data has no reason to be framable at all, and the rest costs
  // nothing. Browser connections remain restricted to this service.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next injects its bootstrap inline, and the dev overlay needs eval.
              "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com" +
                (process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"),
              "style-src 'self' 'unsafe-inline'",
              // gameinfo lets staff paste arbitrary image/currency/tutorial
              // URLs (see gameinfo-pack-editor.js, gameinfo-tutorial-modal.js)
              // rendered as plain <img> tags — those hosts aren't known ahead
              // of time, so img-src has to allow any https origin.
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://challenges.cloudflare.com",
              "frame-src https://challenges.cloudflare.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
