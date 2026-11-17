# Builds the web app and the server, then ships only what the server needs at runtime.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @inventory/web build \
 && pnpm --filter @inventory/server build \
 && pnpm --filter @inventory/server deploy --prod --legacy /out

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=80 WEB_ROOT=/app/web MIGRATIONS_DIR=/app/drizzle PHOTOS_DIR=/data/photos
COPY --from=build /out ./
COPY --from=build /repo/apps/web/dist ./web
EXPOSE 80
# Migrations run before serving. The deployment tooling adds a backup step in front of this.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
