import { resolve } from 'node:path';
import { buildApp } from './app.ts';
import { loadDevEnv } from './env.ts';

loadDevEnv();

const port = Number(process.env.PORT ?? 3000);
const webRoot = process.env.WEB_ROOT ?? resolve(import.meta.dirname, '../../web/dist');

const app = buildApp({ webRoot, logger: true });
await app.listen({ host: '0.0.0.0', port });
