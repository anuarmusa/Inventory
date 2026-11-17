import { defineConfig } from 'drizzle-kit';

// The phone's local SQLite database. `driver: 'expo'` makes drizzle-kit emit migrations.js for the app.
export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
