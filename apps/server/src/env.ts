import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Loads the repo-root .env when running on the dev PC. In Docker, settings come from Compose. */
export function loadDevEnv(): void {
  const file = resolve(import.meta.dirname, '../../../.env');
  if (existsSync(file)) process.loadEnvFile(file);
}
