import { loadDevEnv } from '../env.ts';
import { migrationsFolder, runMigrations } from './migrations.ts';

// CLI: applies pending migrations (pnpm db:migrate, and at container start).
loadDevEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

await runMigrations(url);
console.log(`Migrations applied from ${migrationsFolder}`);
