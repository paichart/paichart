/** @type {import('next').NextConfig} */
const nextConfig = {
  // Catch potential bugs in development
  reactStrictMode: true,

  // Security: Hide X-Powered-By header
  poweredByHeader: false,

  // Enable gzip compression
  compress: true,

  experimental: {
    serverComponentsExternalPackages: ['@modelcontextprotocol/sdk', 'node-fetch', 'jose']
  },
  // BC45 FIX: Application-level security headers (defense-in-depth with nginx)
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-XSS-Protection', value: '0' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        // 2026-05-27 (pentest L-1): Content-Security-Policy. Launch-safe baseline —
        // script/style allow 'unsafe-inline' (Next.js injects inline bootstrap; Tailwind
        // inline styles) and img/connect allow https: (OAuth avatars, SSE/API) so the UI
        // doesn't break. The real wins here are frame-ancestors/object-src/base-uri/
        // form-action/upgrade-insecure-requests. HARDENING TODO (post-launch): move
        // script-src to nonces and drop 'unsafe-inline'/'unsafe-eval'.
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            // Cloudflare auto-injects its Web Analytics beacon (beacon.min.js) into every
            // page; without this origin the browser blocks it and logs a CSP violation on
            // every load (observed 2026-08-18). Its measurement POST is already covered by
            // connect-src https:.
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' https: wss:",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "upgrade-insecure-requests",
          ].join('; '),
        },
      ],
    }];
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Fix SSR "Must call super constructor" error from @tanstack/query-core.
      // The package's exports field only exposes the "modern" build which uses
      // ES private class fields (#e, #t) with class inheritance. Webpack's server
      // bundling breaks these. The "legacy" build ships without private fields
      // and works correctly for SSR.
      const path = require('path');
      const fs = require('fs');
      const legacyPath = path.join(__dirname, 'node_modules/@tanstack/query-core/build/legacy/index.cjs');
      if (!fs.existsSync(legacyPath)) {
        throw new Error(
          '@tanstack/query-core legacy build not found at ' + legacyPath + '. ' +
          'SSR will break with "Must call super constructor" errors. ' +
          'Check if @tanstack/react-query was upgraded past the pinned version.'
        );
      }
      config.resolve.alias = {
        ...config.resolve.alias,
        '@tanstack/query-core': legacyPath,
      };
    }
    if (!isServer) {
      // Don't bundle MCP SDK on the client side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        child_process: false,
        net: false,
        tls: false,
        crypto: false,
      };

      // Exclude MCP SDK from client bundle
      config.externals = config.externals || [];
      config.externals.push('@modelcontextprotocol/sdk');
    }
    return config;
  },
}

module.exports = nextConfig
