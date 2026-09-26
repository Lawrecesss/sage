/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app is its own root; without this Next walks up and picks a stray
  // lockfile in the home directory as the workspace root.
  outputFileTracingRoot: import.meta.dirname,
  // Report export libs (lib/report-export/*): @resvg/resvg-js ships a native .node addon
  // webpack can't parse, and pdfkit/exceljs ship data files (AFM fonts, CSV codecs) that don't
  // survive bundling either. All three are only ever `require`d from nodejs-runtime routes
  // (see api/reports/[name]/route.ts), so they're left external and resolved from
  // node_modules at request time instead of being bundled.
  serverExternalPackages: ["@resvg/resvg-js", "pdfkit", "svg-to-pdfkit", "exceljs"],
  experimental: {
    // Explicit, not relying on the default: `dynamic = "force-dynamic"` pages
    // (dashboard, metrics/signals detail) must never be served from the
    // client Router Cache — every navigation needs fresh SQL. Without this,
    // a plain router.push() to the same route with a different searchParam
    // can silently reuse a stale cached render (see DomainTabs.tsx).
    staleTimes: { dynamic: 0 },
  },
  // History was renamed to Reports; keep old links and bookmarks working.
  async redirects() {
    return [{ source: "/history", destination: "/reports", permanent: true }];
  },
};

export default nextConfig;
