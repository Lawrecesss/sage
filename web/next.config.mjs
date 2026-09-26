/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app is its own root; without this Next walks up and picks a stray
  // lockfile in the home directory as the workspace root.
  outputFileTracingRoot: import.meta.dirname,
  experimental: {
    // Explicit, not relying on the default: `dynamic = "force-dynamic"` pages
    // (dashboard, metrics/signals detail) must never be served from the
    // client Router Cache — every navigation needs fresh SQL. Without this,
    // a plain router.push() to the same route with a different searchParam
    // can silently reuse a stale cached render (see DomainTabs.tsx).
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
