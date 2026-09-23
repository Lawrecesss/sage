/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app is its own root; without this Next walks up and picks a stray
  // lockfile in the home directory as the workspace root.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
