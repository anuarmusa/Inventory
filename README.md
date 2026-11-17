# Household Inventory

Tracks a household's Supplies and Assets from Android phones, synced with a server on the home network. What v1 does is in [docs/spec/v1.md](docs/spec/v1.md); domain terms are in [GLOSSARY.md](GLOSSARY.md).

## Layout

```text
apps/
├── server/     # Fastify API; also serves the built web app
└── web/        # React + Vite dashboard and download page
packages/
└── shared/     # types, Zod schemas and rules shared by server, web and app
```

## Development

Needs Node 24, pnpm 10 and Docker Desktop.

```sh
cp .env.example .env      # then set POSTGRES_PASSWORD (and the same password in DATABASE_URL)
pnpm install
pnpm db:up                # PostgreSQL in Docker on port 5432
pnpm db:migrate           # apply database migrations
pnpm dev                  # server on :3000, web on :5173 (proxies to the server)
pnpm test                 # all tests
pnpm typecheck
```

To run the production-like stack (server + built web + database) at http://localhost:8080:

```sh
docker compose up --build
```

New migrations: change `apps/server/src/db/schema.ts`, then `pnpm --filter @inventory/server db:generate`.
