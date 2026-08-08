/** @type {import('next').NextConfig} */
const nextConfig = {
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
              "script-src 'self' 'unsafe-inline'" +
                (process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"),
              "style-src 'self' 'unsafe-inline'",
              // gameinfo lets staff paste arbitrary image/currency/tutorial
              // URLs (see gameinfo-pack-editor.js, gameinfo-tutorial-modal.js)
              // rendered as plain <img> tags — those hosts aren't known ahead
              // of time, so img-src has to allow any https origin.
              "img-src 'self' data: blob: https:",
              "connect-src 'self'",
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
