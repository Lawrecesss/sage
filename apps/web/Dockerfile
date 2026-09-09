# Next.js standalone build. Build context is the REPO ROOT (see
# infra/docker-compose.prod.yml) because the pnpm lockfile + workspace file live there.
FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter web
WORKDIR /app/apps/web
RUN pnpm build

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# `output: "standalone"` emits a self-contained server under apps/web/ in the monorepo layout.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
