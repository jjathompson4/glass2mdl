import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// Vercel injects its comment toolbar into preview deployments only.
const isPreview = process.env.VERCEL_ENV === "preview";
const live = isPreview ? " https://vercel.live" : "";

/**
 * The pages are static, so the policy cannot use per-request nonces (those
 * force dynamic rendering). Inline scripts stay allowed because Next's own
 * bootstrap and the pre-paint theme script are inline; everything else is
 * locked to this origin. The tool makes no outside requests at all: fonts are
 * self-hosted and the solver, ZIP builder and image reads run in the browser.
 *
 * blob: covers the frit pattern preview (an object URL of the uploaded file)
 * and the ZIP download; data: covers inline images.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${live}`,
  `style-src 'self' 'unsafe-inline'${live}`,
  `img-src 'self' blob: data:${live}`,
  `font-src 'self'${live}`,
  `connect-src 'self'${live}${isPreview ? " wss://ws-us3.pusher.com" : ""}`,
  "worker-src 'self' blob:",
  `frame-src ${isPreview ? "https://vercel.live" : "'none'"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Older browsers that predate frame-ancestors.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
