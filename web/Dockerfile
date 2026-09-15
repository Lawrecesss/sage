# Next.js standalone build. Build context is the REPO ROOT (see
# platform/infra/docker-compose.prod.yml) because the pnpm lockfile + workspace file live there.
FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY web ./web
RUN pnpm install --frozen-lockfile --filter web
WORKDIR /app/web
RUN pnpm build

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# `output: "standalone"` emits a self-contained server under web/ in the monorepo layout.
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static ./web/.next/static
COPY --from=build /app/web/public ./web/public
EXPOSE 3000
CMD ["node", "web/server.js"]
