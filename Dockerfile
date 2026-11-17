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
# The PostgreSQL 17 client (pg_dump, psql) for backups: it must be at least the server's version,
# so it comes from the PostgreSQL apt repository rather than Debian's.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && . /etc/os-release \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 \
 && apt-get purge -y curl gnupg && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=80 WEB_ROOT=/app/web MIGRATIONS_DIR=/app/drizzle \
    DATA_DIR=/data PHOTOS_DIR=/data/photos APK_DIR=/data/apk \
    BACKUP_SCRIPT=/app/ops/backup.sh BACKUP_STATUS_FILE=/data/backups/last-backup.json
COPY --from=build /out ./
COPY --from=build /repo/apps/web/dist ./web
COPY apps/server/ops ./ops
RUN sed -i 's/\r$//' ops/*.sh && chmod +x ops/*.sh
EXPOSE 80
# Backup, then migrations, then serve (ops/start.sh).
CMD ["/app/ops/start.sh"]
