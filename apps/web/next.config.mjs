/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server build for the Docker image (infra/docker-compose.prod.yml).
  output: "standalone",
};

export default nextConfig;
